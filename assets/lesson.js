/**


(() => {
  // --------------------------
  // LRC 解析与小工具
  // --------------------------
  const LINE_RE = /^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/;
  const META_RE = /^\[(al|ar|ti|by):(.+)\]$/i;

  function timeTagsToSeconds(tags) {
    const m = /\[(\d+):(\d+(?:\.\d+)?)\]/.exec(tags);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  }
  function hasCJK(s) { return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(s); }

  async function fetchText(url) { const r = await fetch(url); if (!r.ok) throw new Error('Fetch failed ' + url); return r.text(); }

  async function loadLrc(url) {
    const text = await fetchText(url);
    const rows = text.replace(/\r/g, '').split('\n');
    const meta = { al: '', ar: '', ti: '', by: '' };
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i].trim(); if (!raw) continue;
      const mm = raw.match(META_RE); if (mm) { meta[mm[1].toLowerCase()] = mm[2].trim(); continue; }
      const m = raw.match(LINE_RE); if (!m) continue;
      const tags = m[1];
      const start = timeTagsToSeconds(tags);
      let body = m[2].trim();
      let en = body, cn = '';
      if (body.includes('|')) { const [a,b] = body.split('|'); en = a.trim(); cn = (b||'').trim(); }
      else if (i + 1 < rows.length) { // 叠行 EN/CN
        const m2 = rows[i + 1].trim().match(LINE_RE);
        if (m2 && m2[1] === tags) { const text2 = m2[2].trim(); if (hasCJK(text2)) { cn = text2; i++; } }
      }
      items.push({ start, en, cn });
    }
    for (let i = 0; i < items.length; i++) items[i].end = i + 1 < items.length ? items[i + 1].start : 0;
    return { meta, items };
  }

  function qs(sel) { return document.querySelector(sel); }
  const raf = (cb) => requestAnimationFrame(cb);

  // --------------------------
  // 启动
  // --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch(_) {}
    window.scrollTo(0, 0);

    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) { location.href = 'book.html'; return; }
    const [book, ...rest] = hash.split('/');
    const base = rest.join('/');
    const inModern = /\/modern\//.test(location.pathname);
    const prefix = inModern ? '../' : '';
    const mp3 = `${prefix}${book}/${base}.mp3`;
    const lrc = `${prefix}${book}/${base}.lrc`;

    // DOM
    const titleEl = qs('#lessonTitle');
    const subEl   = qs('#lessonSub');
    const listEl  = qs('#sentences');
    const audio   = qs('#player');

    const backLink       = qs('#backLink');
    const settingsBtn    = qs('#settingsBtn');
    const settingsOverlay= qs('#settingsOverlay');
    const settingsPanel  = qs('#settingsPanel');
    const settingsClose  = qs('#settingsClose');
    const settingsDone   = qs('#settingsDone');
    const prevLessonLink = qs('#prevLesson');
    const nextLessonLink = qs('#nextLesson');

    // 设置相关 UI
    const speedButton = qs('#speed');
    const modeToggle  = qs('#modeToggle');
    const readModeSeg = qs('#readModeSeg');
    const followToggle= qs('#followToggle');

    // 本地存储键
    const RECENT_KEY = 'nce_recents';
    const LASTPOS_KEY= 'nce_lastpos';
    const FOLLOW_KEY = 'autoFollow';
    const AUTO_CONTINUE_KEY = 'autoContinue';

    // 状态
    let items = [];
    let idx = -1;
    let prevLessonHref = '';
    let nextLessonHref = '';
    let _lastSavedAt = 0;

    // 被动模式：始终只做“跟随”，不控制播放
    const PASSIVE_MODE = true;

    // 自动跟随
    let autoFollow = (localStorage.getItem(FOLLOW_KEY) === 'false') ? false : true;

    // 自动续播（仅在 ended 后换课，不干预当前课播放）
    let autoContinueMode = (localStorage.getItem(AUTO_CONTINUE_KEY) === 'auto') ? 'auto' : 'single';

    // 倍速（允许调速，不改变起停/跳转）
    const rates = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 0.75, 1.0];
    const DEFAULT_RATE = 1.0;
    let savedRate = parseFloat(localStorage.getItem('audioPlaybackRate'));
    if (isNaN(savedRate) || !rates.includes(savedRate)) savedRate = DEFAULT_RATE;
    let currentRateIndex = Math.max(0, rates.indexOf(savedRate));

    // ---------------------------------
    // UI 反映
    // ---------------------------------
    function reflectFollowMode() {
      if (!followToggle) return;
      followToggle.textContent = autoFollow ? '跟随' : '不跟随';
      followToggle.setAttribute('aria-pressed', autoFollow ? 'true' : 'false');
    }
    reflectFollowMode();

    function reflectPassiveReadModeUI() {
      // 将“阅读模式”UI置为只读并提示
      if (modeToggle) {
        modeToggle.textContent = '歌词跟随';
        modeToggle.setAttribute('aria-pressed', 'true');
        modeToggle.title = '已启用歌词跟随模式：不控制音频起停/跳转';
        modeToggle.disabled = true;
      }
      if (readModeSeg) {
        const btns = readModeSeg.querySelectorAll('.seg');
        btns.forEach(btn => {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
          btn.setAttribute('disabled', 'true');
          btn.title = '歌词跟随模式下不可切换';
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.5';
        });
      }
    }
    reflectPassiveReadModeUI();

    // 自动续播单选（保留，与 Passive 不冲突）
    const singleRadio = document.getElementById('autoContinueSingle');
    const autoRadio  = document.getElementById('autoContinueAuto');
    function reflectAutoContinueMode() {
      if (singleRadio && autoRadio) {
        singleRadio.checked = autoContinueMode === 'single';
        autoRadio.checked   = autoContinueMode === 'auto';
      }
    }
    reflectAutoContinueMode();
    if (singleRadio) singleRadio.addEventListener('change', ()=>{ if (singleRadio.checked){ autoContinueMode='single'; localStorage.setItem(AUTO_CONTINUE_KEY,'single'); }});
    if (autoRadio)   autoRadio.addEventListener('change',  ()=>{ if (autoRadio.checked){  autoContinueMode='auto';   localStorage.setItem(AUTO_CONTINUE_KEY,'auto');  }});

    if (followToggle) followToggle.addEventListener('click', ()=>{ autoFollow=!autoFollow; localStorage.setItem(FOLLOW_KEY, autoFollow.toString()); reflectFollowMode(); });

    // 倍速
    audio.playbackRate = savedRate;
    if (speedButton) speedButton.textContent = `${savedRate.toFixed(2)}x`;
    if (speedButton) {
      speedButton.addEventListener('click', () => {
        currentRateIndex = (currentRateIndex + 1) % rates.length;
        const newRate = rates[currentRateIndex];
        audio.playbackRate = newRate;
      });
    }
    audio.addEventListener('ratechange', () => {
      const r = audio.playbackRate;
      try { localStorage.setItem('audioPlaybackRate', r); } catch(_) {}
      if (speedButton) speedButton.textContent = `${r.toFixed(2)}x`;
      const i = rates.indexOf(r); if (i !== -1) currentRateIndex = i;
    });

    // 返回
    if (backLink) {
      const fallback = `index.html#${book}`;
      backLink.setAttribute('href', fallback);
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        try { const ref = document.referrer; if (ref && new URL(ref).origin === location.origin) { history.back(); return; } } catch(_) {}
        location.href = fallback;
      });
    }

    // 设置面板开关（保留）
    let _prevFocus = null; let _trapHandler = null;
    function getFocusable(root){
      return root ? Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el=>!el.hasAttribute('disabled') && el.offsetParent !== null) : [];
    }
    function enableTrap(){
      if (!settingsPanel) return;
      const fs = getFocusable(settingsPanel); if (fs.length) fs[0].focus();
      _trapHandler = (e)=>{
        if (e.key !== 'Tab') return;
        const list = getFocusable(settingsPanel); if (!list.length) return;
        const first = list[0], last = list[list.length-1];
        if (e.shiftKey){ if (document.activeElement === first){ e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last){ e.preventDefault(); first.focus(); } }
      };
      document.addEventListener('keydown', _trapHandler);
    }
    function disableTrap(){ if (_trapHandler){ document.removeEventListener('keydown', _trapHandler); _trapHandler = null; } }
    function openSettings(){
      if (settingsOverlay) { settingsOverlay.hidden = false; requestAnimationFrame(()=>settingsOverlay.classList.add('show')); }
      if (settingsPanel)   { settingsPanel.hidden = false;   requestAnimationFrame(()=>settingsPanel.classList.add('show')); }
      try { _prevFocus = document.activeElement; } catch(_) {}
      try { document.body.style.overflow = 'hidden'; } catch(_) {}
      enableTrap();
    }
    function closeSettings(){
      disableTrap();
      if (settingsOverlay) { settingsOverlay.classList.remove('show'); setTimeout(()=>settingsOverlay.hidden = true, 200); }
      if (settingsPanel)   { settingsPanel.classList.remove('show');   setTimeout(()=>settingsPanel.hidden = true, 200); }
      try { document.body.style.overflow = ''; } catch(_) {}
      try { if (_prevFocus && _prevFocus.focus) _prevFocus.focus(); } catch(_) {}
    }
    if (settingsBtn)     settingsBtn.addEventListener('click', openSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);
    if (settingsClose)   settingsClose.addEventListener('click', closeSettings);
    if (settingsDone)    settingsDone.addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeSettings(); });

    // 重置按钮
    const settingsReset = qs('#settingsReset');
    if (settingsReset){
      settingsReset.addEventListener('click', ()=>{
        try{ localStorage.setItem('audioPlaybackRate', DEFAULT_RATE); }catch(_){}
        audio.playbackRate = DEFAULT_RATE;
        autoFollow = true; localStorage.setItem(FOLLOW_KEY,'true');
        autoContinueMode='single'; localStorage.setItem(AUTO_CONTINUE_KEY,'single');
        reflectFollowMode(); reflectAutoContinueMode(); reflectPassiveReadModeUI();
        showNotification('已恢复默认设置');
      });
    }

    // --------------------------
    // 渲染与高亮
    // --------------------------
    function render() {
      listEl.innerHTML = items.map((it, i) => `
        <div class="sentence" data-idx="${i}">
          <div class="en">${it.en}</div>
          ${it.cn ? `<div class="cn">${it.cn}</div>` : ''}
        </div>
      `).join('');
    }

    let scrollTimer = 0;
    function scheduleScrollTo(el, smooth) {
      if (!el || !autoFollow) return;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
      if (smooth) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
      } else {
        // 避开句首瞬态：延后 420ms 再滚动
        scrollTimer = setTimeout(()=>{ try { el.scrollIntoView({ behavior:'auto', block:'center' }); } catch(_) {} }, 420);
      }
    }

    function highlight(i, byClick=false) {
      const prev = listEl.querySelector('.sentence.active'); if (prev) prev.classList.remove('active');
      const cur = listEl.querySelector(`.sentence[data-idx="${i}"]`);
      if (cur) { cur.classList.add('active'); scheduleScrollTo(cur, byClick); }
    }

    // 句子点击：在被动模式下仅滚动到该句并瞬时高亮，不做 seek
    listEl.addEventListener('click', (e) => {
      const s = e.target.closest('.sentence'); if (!s) return;
      const i = parseInt(s.dataset.idx, 10);
      highlight(i, true);
      // 给少量视觉反馈
      s.classList.add('pulse');
      setTimeout(()=>s.classList.remove('pulse'), 300);
    });

    // --------------------------
    // 进度保存 & 跟随
    // --------------------------
    function lessonId(){ return `${book}/${base}`; }
    function touchRecent(){
      try{
        const id = lessonId(); const now = Date.now();
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
        const rest = raw.filter(x=>x && x.id !== id);
        const next = [{ id, ts: now }, ...rest].slice(0, 60);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      }catch(_){}
    }
    function saveLastPos(){
      try{
        const id = lessonId(); const now = Date.now();
        const map = JSON.parse(localStorage.getItem(LASTPOS_KEY)||'{}');
        map[id] = { t: Math.max(0, audio.currentTime||0), idx: Math.max(0, idx|0), ts: now };
        localStorage.setItem(LASTPOS_KEY, JSON.stringify(map));
      }catch(_){}
    }

    // 仅靠 timeupdate 做高亮与持久化（不做任何播放控制）
    let lastUpdateTs = 0;
    audio.addEventListener('timeupdate', () => {
      const now = performance.now();
      if (now - lastUpdateTs < 100) return; // 100ms 节流
      lastUpdateTs = now;

      const t = audio.currentTime;
      // 简单顺扫足够快（行数通常不大）；若后续需要可优化为二分
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const end = (it.end && it.end > it.start) ? it.end : (it.start + 0.2);
        if (t >= it.start && t < end) {
          if (idx !== i) { idx = i; highlight(i); }
          break;
        }
      }
      if (now - _lastSavedAt > 2000) { _lastSavedAt = now; saveLastPos(); }
    });

    // 播放/暂停事件（仅用于“最近播放”与轻量逻辑，不控制播放）
    audio.addEventListener('play',  ()=>{ touchRecent(); });
    audio.addEventListener('pause', ()=>{ saveLastPos(); });

    // 课程播完（自然 ended），按设置跳转下一课（不改变当前课内的播放逻辑）
    audio.addEventListener('ended', () => {
      if (autoContinueMode === 'auto') autoNextLesson();
    });

    // --------------------------
    // 相邻课程
    // --------------------------
    async function getNextLesson(currentBook, currentFilename) {
      try {
        const response = await fetch(prefix + 'static/data.json');
        if (!response.ok) return null;
        const data = await response.json();
        const num = parseInt(currentBook.replace('NCE','')) || 1;
        const lessons = data[num] || [];
        const i = lessons.findIndex(x => x.filename === currentFilename);
        if (i >= 0 && i + 1 < lessons.length) return lessons[i + 1];
        return null;
      } catch (e) { console.error(e); return null; }
    }
    async function autoNextLesson() {
      const nextLesson = await getNextLesson(book, base);
      if (nextLesson) {
        showNotification(`即将跳转到下一课：${nextLesson.title}`);
        setTimeout(() => { window.location.href = `lesson.html#${book}/${nextLesson.filename}`; }, 2000);
      } else {
        showNotification('🎉 恭喜完成本册课程！');
      }
    }
    async function resolveLessonNeighbors() {
      try {
        const res = await fetch(prefix + 'static/data.json');
        const data = await res.json();
        const num = parseInt(book.replace('NCE','')) || 1;
        const lessons = data[num] || [];
        const i = lessons.findIndex(x => x.filename === base);
        if (i > 0) {
          const prev = lessons[i - 1].filename;
          prevLessonHref = `lesson.html#${book}/${prev}`;
          if (prevLessonLink) { prevLessonLink.href = prevLessonHref; prevLessonLink.style.display=''; }
        } else { if (prevLessonLink) prevLessonLink.style.display='none'; }
        if (i >= 0 && i + 1 < lessons.length) {
          const next = lessons[i + 1].filename;
          nextLessonHref = `lesson.html#${book}/${next}`;
          if (nextLessonLink) { nextLessonLink.href = nextLessonHref; nextLessonLink.style.display=''; }
        } else { if (nextLessonLink) nextLessonLink.style.display='none'; }
      } catch(_) {
        if (prevLessonLink) prevLessonLink.style.display='none';
        if (nextLessonLink) nextLessonLink.style.display='none';
      }
    }

    // --------------------------
    // 通知
    // --------------------------
    function showNotification(message) {
      const n = document.createElement('div');
      n.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: var(--surface); color: var(--text); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 12px 20px; box-shadow: var(--shadow);
        z-index: 1000; backdrop-filter: saturate(120%) blur(10px); animation: slideDown 0.3s ease-out;
      `;
      n.textContent = message; document.body.appendChild(n);
      setTimeout(()=>{ n.style.animation='slideUp 0.3s ease-out'; setTimeout(()=>{ document.body.removeChild(n); }, 300); }, 2000);
    }

    // --------------------------
    // 初始化：装载资源、渲染、断点恢复（不自动播放/不 seek）
    // --------------------------
    try { audio.preload = 'auto'; } catch(_) {}
    audio.src = mp3;

    // 初始化你的 segmented/tabs（若存在）
    if (window.NCE_APP && typeof NCE_APP.initSegmented === 'function') {
      try { NCE_APP.initSegmented(document); } catch(_) {}
    }

    resolveLessonNeighbors();

    // 若已知时长，修正最后一句 end=duration（仅用于判定高亮，不用于控制播放）
    let _lastEndAdjusted = false;
    function adjustLastEndIfPossible() {
      if (_lastEndAdjusted) return;
      if (!items || !items.length) return;
      const dur = Number(audio.duration);
      if (!Number.isFinite(dur) || dur <= 0) return;
      const last = items[items.length - 1];
      if (!last.end || last.end <= last.start || last.end > dur) last.end = dur;
      _lastEndAdjusted = true;
    }
    audio.addEventListener('loadedmetadata', adjustLastEndIfPossible);

    loadLrc(lrc).then(({ meta, items: arr }) => {
      items = arr;
      titleEl.textContent = meta.ti || base;
      subEl.textContent = `${meta.al || book} · ${meta.ar || ''}`.trim();
      render();
      touchRecent();
      adjustLastEndIfPossible();

      // 尝试恢复上次位置（只设置高亮与滚动，不 seek/不自动播放）
      try {
        const map = JSON.parse(localStorage.getItem(LASTPOS_KEY)||'{}');
        const pos = map[lessonId()];
        if (pos) {
          const targetIdx = (Number.isInteger(pos.idx) && pos.idx>=0 && pos.idx<items.length) ? pos.idx : 0;
          idx = targetIdx; highlight(targetIdx, true);
        }
      } catch(_) {}
    }).catch(err => {
      titleEl.textContent = '无法加载课文';
      subEl.textContent = String(err);
    });

    window.addEventListener('beforeunload', ()=>{ saveLastPos(); });
    window.addEventListener('hashchange', ()=>{ window.scrollTo(0,0); location.reload(); });
  });
})();
