(() => {
  const LINE_RE = /^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/;
  const TIME_RE = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  const META_RE = /^\[(al|ar|ti|by):(.+)\]$/i;

  function timeTagsToSeconds(tags) {
    // Use the first tag as start
    const m = /\[(\d+):(\d+(?:\.\d+)?)\]/.exec(tags);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
  }

  function hasCJK(s) { return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(s) }

  async function fetchText(url) { const r = await fetch(url); if (!r.ok) throw new Error('Fetch failed ' + url); return await r.text(); }

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
      if (body.includes('|')) { const parts = body.split('|'); en = parts[0].trim(); cn = (parts[1] || '').trim(); }
      else {
        // stacked mode: next line may be CN with same timestamp
        if (i + 1 < rows.length) {
          const m2 = rows[i + 1].trim().match(LINE_RE);
          if (m2 && m2[1] === tags) {
            const text2 = m2[2].trim();
            if (hasCJK(text2)) { cn = text2; i++; }
          }
        }
      }
      items.push({ start, en, cn });
    }
    // compute end time
    for (let i = 0; i < items.length; i++) {
      items[i].end = i + 1 < items.length ? items[i + 1].start : 0;
    }
    return { meta, items };
  }

  function qs(sel) { return document.querySelector(sel); }

  document.addEventListener('DOMContentLoaded', () => {
    // Ensure new lesson loads at top (avoid scroll restoration)
    try { if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; } } catch (_) { }
    window.scrollTo(0, 0);
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) { location.href = 'book.html'; return; }
    const [book, ...rest] = hash.split('/');
    const base = rest.join('/'); // filename
    const inModern = /\/modern\//.test(location.pathname);
    const prefix = inModern ? '../' : '';
    const mp3 = `${prefix}${book}/${base}.mp3`;
    const lrc = `${prefix}${book}/${base}.lrc`;

    const titleEl = qs('#lessonTitle');
    const subEl = qs('#lessonSub');
    const listEl = qs('#sentences');
    const audio = qs('#player');
    const backLink = qs('#backLink');
    const settingsBtn = qs('#settingsBtn');
    const settingsOverlay = qs('#settingsOverlay');
    const settingsPanel = qs('#settingsPanel');
    const settingsClose = qs('#settingsClose');
    const settingsDone = qs('#settingsDone');
    const prevLessonLink = qs('#prevLesson');
    const nextLessonLink = qs('#nextLesson');
    // 新加控制音频播放速度
    const speedButton = qs('#speed')
    // 连读/点读开关
    const modeToggle = qs('#modeToggle');
    const readModeSeg = qs('#readModeSeg');
    // 自动跟随开关
    const followToggle = qs('#followToggle');
    const rates = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 0.75, 1.0];
    const DEFAULT_RATE = 1.0;
    
    let savedRate = parseFloat(localStorage.getItem('audioPlaybackRate'));
    if (isNaN(savedRate) || !rates.includes(savedRate)) {
        savedRate = DEFAULT_RATE;
    }
    let currentRateIndex = rates.indexOf(savedRate);
    if (currentRateIndex === -1) {
        currentRateIndex = rates.indexOf(DEFAULT_RATE);
    }
    audio.playbackRate = savedRate;
    if (speedButton) {
        speedButton.textContent = `${savedRate.toFixed(2)}x`;
    }
    if (speedButton) {
        speedButton.addEventListener('click', () => {
            currentRateIndex = (currentRateIndex + 1) % rates.length;
            const newRate = rates[currentRateIndex];
            audio.playbackRate = newRate; 
        });
    }
    audio.addEventListener('ratechange', () => {
        const actualRate = audio.playbackRate;
        try {
            localStorage.setItem('audioPlaybackRate', actualRate);
        } catch (e) {
            console.error('无法保存实际播放速度到 localStorage:', e);
        }
        if (speedButton) {
            speedButton.textContent = `${actualRate.toFixed(2)}x`;
        }
        const newIndex = rates.indexOf(actualRate);
        if (newIndex !== -1) {
            currentRateIndex = newIndex;
        } else {
            console.warn(`当前速度 ${actualRate.toFixed(2)}x 不在预设列表中，内部索引未更新。`);
        }
        // 速度改变后需要重置自动前进/暂停的计时
        scheduleAdvance();
    });

    let items = [];
    let idx = -1;
    let segmentEnd = 0; // current sentence end time
    let segmentTimer = 0; // timeout id for auto-advance
    let internalPause = false; // 标记内部切句导致的暂停，避免在 pause 里做重活
    let segmentStartWallclock = 0; // 每段开始的墙钟时间，用于首 300ms 降噪
    let prevLessonHref = '';
    let nextLessonHref = '';
    const RECENT_KEY = 'nce_recents';
    const LASTPOS_KEY = 'nce_lastpos'; // map: id -> { t, idx, ts }

    function lessonId(){ return `${book}/${base}`; }
    function touchRecent(){
      try{
        const id = lessonId();
        const now = Date.now();
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
        const rest = raw.filter(x=>x && x.id !== id);
        const next = [{ id, ts: now }, ...rest].slice(0, 60);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      }catch(_){ }
    }

    function saveLastPos(immediate=false){
      try{
        const id = lessonId();
        const now = Date.now();
        const map = JSON.parse(localStorage.getItem(LASTPOS_KEY)||'{}');
        map[id] = { t: Math.max(0, audio.currentTime||0), idx: Math.max(0, idx|0), ts: now };
        localStorage.setItem(LASTPOS_KEY, JSON.stringify(map));
      }catch(_){ }
    }
    let _lastSavedAt = 0;

    // 阅读模式：continuous（连读）或 single（点读）
    const MODE_KEY = 'readMode';
    let readMode = 'continuous';
    try {
      const savedMode = localStorage.getItem(MODE_KEY);
      if (savedMode === 'continuous' || savedMode === 'single') {
        readMode = savedMode;
      }
    } catch (_) { }

    // 自动跟随模式：true（自动跟随）或 false（不跟随）
    const FOLLOW_KEY = 'autoFollow';
    let autoFollow = true;
    try {
      const savedFollow = localStorage.getItem(FOLLOW_KEY);
      if (savedFollow === 'true' || savedFollow === 'false') {
        autoFollow = savedFollow === 'true';
      }
    } catch (_) { }

    // 自动续播模式：single（本课结束）或 auto（自动续播）
    const AUTO_CONTINUE_KEY = 'autoContinue';
    let autoContinueMode = 'single'; // 默认不自动续播
    try {
      const savedAutoContinue = localStorage.getItem(AUTO_CONTINUE_KEY);
      if (savedAutoContinue === 'single' || savedAutoContinue === 'auto') {
        autoContinueMode = savedAutoContinue;
      }
    } catch (_) { }

    function reflectReadMode() {
      const isContinuous = readMode === 'continuous';
      if (modeToggle) {
        modeToggle.textContent = isContinuous ? '连读' : '点读';
        modeToggle.setAttribute('aria-pressed', isContinuous ? 'true' : 'false');
        modeToggle.dataset.mode = readMode;
      }
      if (readModeSeg) {
        const btns = readModeSeg.querySelectorAll('.seg');
        btns.forEach(btn => {
          const v = btn.getAttribute('data-read');
          const active = (v === readMode);
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      }
      // 显示/隐藏自动续播设置
      const autoContinueCard = document.getElementById('autoContinueCard');
      if (autoContinueCard) {
        if (isContinuous) { autoContinueCard.style.display = 'inline-flex'; }
        else { autoContinueCard.style.display = 'none'; }
      }
    }

    function reflectAutoContinueMode() {
      const singleRadio = document.getElementById('autoContinueSingle');
      const autoRadio = document.getElementById('autoContinueAuto');
      if (singleRadio && autoRadio) {
        singleRadio.checked = autoContinueMode === 'single';
        autoRadio.checked = autoContinueMode === 'auto';
      }
    }

    function setAutoContinueMode(mode) {
      autoContinueMode = mode === 'auto' ? 'auto' : 'single';
      try {
        localStorage.setItem(AUTO_CONTINUE_KEY, autoContinueMode);
      } catch (_) { }
      reflectAutoContinueMode();
    }

    function setReadMode(mode) {
      readMode = mode === 'single' ? 'single' : 'continuous';
      try { localStorage.setItem(MODE_KEY, readMode); } catch (_) { }
      reflectReadMode();
      // 模式切换时，先清除所有调度状态，然后重新调度
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;
      scheduleAdvance();
    }

    function reflectFollowMode() {
      if (!followToggle) return;
      followToggle.textContent = autoFollow ? '跟随' : '不跟随';
      followToggle.setAttribute('aria-pressed', autoFollow ? 'true' : 'false');
      followToggle.dataset.follow = autoFollow;
    }

    function setFollowMode(follow) {
      autoFollow = follow === true;
      try { localStorage.setItem(FOLLOW_KEY, autoFollow.toString()); } catch (_) { }
      reflectFollowMode();
    }

    if (modeToggle) {
      reflectReadMode();
      modeToggle.addEventListener('click', () => {
        setReadMode(readMode === 'continuous' ? 'single' : 'continuous');
      });
    }
    if (readModeSeg) {
      reflectReadMode();
      readModeSeg.addEventListener('click', (e) => {
        const b = e.target.closest('.seg');
        if (!b) return;
        const v = b.getAttribute('data-read') === 'single' ? 'single' : 'continuous';
        setReadMode(v);
      });
    }

    if (followToggle) {
      reflectFollowMode();
      followToggle.addEventListener('click', () => {
        setFollowMode(!autoFollow);
      });
    }

    // 自动续播设置事件监听
    reflectAutoContinueMode();
    const singleRadio = document.getElementById('autoContinueSingle');
    const autoRadio = document.getElementById('autoContinueAuto');

    if (singleRadio) {
      singleRadio.addEventListener('change', () => {
        if (singleRadio.checked) {
          setAutoContinueMode('single');
        }
      });
    }

    if (autoRadio) {
      autoRadio.addEventListener('change', () => {
        if (autoRadio.checked) {
          setAutoContinueMode('auto');
        }
      });
    }

    audio.src = mp3;
    // Back navigation: prefer history, fallback to index with current book
    if (backLink) {
      const fallback = `index.html#${book}`;
      backLink.setAttribute('href', fallback);
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const ref = document.referrer;
          if (ref && new URL(ref).origin === location.origin) { history.back(); return; }
        } catch (_) { }
        location.href = fallback;
      });
    }

    // Settings panel open/close helpers
    let _prevFocus = null;
    let _trapHandler = null;
    function getFocusable(root){
      return root ? Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el=>!el.hasAttribute('disabled') && el.offsetParent !== null) : [];
    }
    function enableTrap(){
      if (!settingsPanel) return;
      const focusables = getFocusable(settingsPanel);
      if (focusables.length){ focusables[0].focus(); }
      _trapHandler = (e)=>{
        if (e.key !== 'Tab') return;
        const fs = getFocusable(settingsPanel);
        if (!fs.length) return;
        const first = fs[0], last = fs[fs.length-1];
        if (e.shiftKey){
          if (document.activeElement === first){ e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last){ e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', _trapHandler);
    }
    function disableTrap(){ if (_trapHandler){ document.removeEventListener('keydown', _trapHandler); _trapHandler = null; } }
    function openSettings(){
      if (settingsOverlay) { settingsOverlay.hidden = false; requestAnimationFrame(()=>settingsOverlay.classList.add('show')); }
      if (settingsPanel) { settingsPanel.hidden = false; requestAnimationFrame(()=>settingsPanel.classList.add('show')); }
      try { _prevFocus = document.activeElement; } catch(_){}
      try { document.body.style.overflow = 'hidden'; } catch(_){}
      enableTrap();
    }
    function closeSettings(){
      disableTrap();
      if (settingsOverlay) { settingsOverlay.classList.remove('show'); setTimeout(()=>{ settingsOverlay.hidden = true; }, 200); }
      if (settingsPanel) { settingsPanel.classList.remove('show'); setTimeout(()=>{ settingsPanel.hidden = true; }, 200); }
      try { document.body.style.overflow = ''; } catch(_){}
      try { if (_prevFocus && _prevFocus.focus) _prevFocus.focus(); } catch(_){}
    }
    if (settingsBtn){ settingsBtn.addEventListener('click', openSettings); }
    if (settingsOverlay){ settingsOverlay.addEventListener('click', closeSettings); }
    if (settingsClose){ settingsClose.addEventListener('click', closeSettings); }
    if (settingsDone){ settingsDone.addEventListener('click', closeSettings); }
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeSettings(); });
    // Ensure panel is closed initially (defensive)
    closeSettings();

    // Reset defaults
    const settingsReset = qs('#settingsReset');
    if (settingsReset){
      settingsReset.addEventListener('click', ()=>{
        try{ localStorage.setItem('audioPlaybackRate', DEFAULT_RATE); }catch(_){ }
        audio.playbackRate = DEFAULT_RATE;
        setReadMode('continuous');
        setFollowMode(true);
        setAutoContinueMode('single');
        reflectAutoContinueMode();
        reflectFollowMode();
        reflectReadMode();
        showNotification('已恢复默认设置');
      });
    }

    function render() {
      listEl.innerHTML = items.map((it, i) => `
        <div class="sentence" data-idx="${i}">
          <div class="en">${it.en}</div>
          ${it.cn ? `<div class="cn">${it.cn}</div>` : ''}
        </div>
      `).join('');
    }

    function computeEnd(it) {
      if (!it.end || it.end <= it.start) return 0;
      // ensure a minimal segment duration to avoid too-short loops
      const minDur = 0.6; // seconds
      return Math.max(it.end, it.start + minDur);
    }

    function clearAdvance() { if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = 0; } }

    // 获取下一课信息
    async function getNextLesson(currentBook, currentFilename) {
      try {
        const response = await fetch(prefix + 'static/data.json');
        if (!response.ok) return null;
        const data = await response.json();
        const bookNum = parseInt(currentBook.replace('NCE', '')) || 1;
        const lessons = data[bookNum] || [];
        const currentIndex = lessons.findIndex(lesson => lesson.filename === currentFilename);

        if (currentIndex >= 0 && currentIndex < lessons.length - 1) {
          return lessons[currentIndex + 1];
        }
        return null;
      } catch (error) {
        console.error('Failed to get next lesson:', error);
        return null;
      }
    }

    // 自动跳转到下一课
    async function autoNextLesson() {
      const nextLesson = await getNextLesson(book, base);
      if (nextLesson) {
        // 显示即将跳转的提示
        showNotification(`即将跳转到下一课：${nextLesson.title}`);
        setTimeout(() => {
          // 预置下节课的断点与自动播放标记，实现跳转后自动播放
          try {
            const nextId = `${book}/${nextLesson.filename}`;
            sessionStorage.setItem('nce_resume', nextId);
            sessionStorage.setItem('nce_resume_play', '1');
            try {
              const map = JSON.parse(localStorage.getItem(LASTPOS_KEY) || '{}');
              map[nextId] = { t: 0, idx: 0, ts: Date.now() };
              localStorage.setItem(LASTPOS_KEY, JSON.stringify(map));
            } catch (_) { }
          } catch (_) { }
          window.location.href = `lesson.html#${book}/${nextLesson.filename}`;
        }, 2000);
      } else {
        // 已经是最后一课，显示完成提示
        showNotification('🎉 恭喜完成本册课程！');
      }
    }

    // 显示通知
    function showNotification(message) {
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px 20px;
        box-shadow: var(--shadow);
        z-index: 1000;
        backdrop-filter: saturate(120%) blur(10px);
        animation: slideDown 0.3s ease-out;
      `;
      notification.textContent = message;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 2000);
    }

    let isScheduling = false; // 防止重复调度
    let scheduleTime = 0; // 记录调度目标（段末）时间点，仅用于观测
    const MAX_CHUNK_MS = 10000; // 分段调度最大间隔，处理超长句/慢速
    function scheduleAdvance() {
      // 统一先清理再调度，避免早退导致旧定时器残留
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;

      if (audio.paused) return; // 不在播放时不安排下一步
      if (!(segmentEnd && idx >= 0)) return;

      const rate = Math.max(0.0001, audio.playbackRate || 1);
      const currentTime = audio.currentTime;
      const remainingMs = Math.max(0, (segmentEnd - currentTime) * 1000 / rate);
      scheduleTime = segmentEnd;
      const schedulingMode = readMode; // 记录调度时的模式

      // 分段调度，避免超长延时导致定时器被丢弃
      const delay = Math.max(10, Math.min(remainingMs, MAX_CHUNK_MS));
      isScheduling = true;
      segmentTimer = setTimeout(function tick() {
        // 模式改变则放弃（setReadMode 会清理原定时器，这里双重保护）
        if (readMode !== schedulingMode) { isScheduling = false; return; }

        // 如果已暂停或无有效段末，停止调度
        if (audio.paused || !(segmentEnd && idx >= 0)) { isScheduling = false; return; }

        const now = audio.currentTime;
        const end = segmentEnd;

        // 已到段末附近：执行段落结束逻辑
        if (now >= end - 0.15) {
          isScheduling = false;
          scheduleTime = 0;
          const currentIdx = idx;
          if (readMode === 'continuous') {
            if (currentIdx + 1 < items.length) {
              playSegment(currentIdx + 1);
            } else {
              // 课程结束，检查是否自动续播
              if (autoContinueMode === 'auto') {
                audio.pause();
                autoNextLesson();
              } else {
                audio.pause();
              }
            }
          } else {
            audio.pause();
          }
          return;
        }

        // 未到段末则继续分段调度
        const rate2 = Math.max(0.0001, audio.playbackRate || 1);
        const remainMs2 = Math.max(0, (end - audio.currentTime) * 1000 / rate2);
        const nextDelay = Math.max(10, Math.min(remainMs2, MAX_CHUNK_MS));
        segmentTimer = setTimeout(tick, nextDelay);
      }, delay);
    }

    // 进度跳转时，重置自动前进/暂停的计时
    audio.addEventListener('seeked', () => {
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;
      scheduleAdvance();
    });

    function playSegment(i, opts) {
      const manual = !!(opts && opts.manual);
      if (i < 0 || i >= items.length) return;
      // 防止重复播放同一句子（仅自动流程）。手动点击允许从头重播
      if (!manual && idx === i && !audio.paused) return;

      // 清除之前的调度
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;

      idx = i;
      const it = items[i];
      // 在部分移动浏览器上，播放状态下直接 seek 会出现短暂回放前一段的现象
      // 统一先暂停再跳转再播放，并避免在 pause 事件里做重活
      try { internalPause = true; audio.pause(); } catch(_){}
      const cur = Math.max(0, audio.currentTime || 0);
      let start = Math.max(0, it.start || 0);
      if (!manual) {
        // 自动前进时，若新起点与当前时间过近或在其之前，给一个极小前移以避免回放抖动
        if (start <= cur + 0.01) {
          const dur = Number(audio.duration);
          const epsilon = 0.04; // 40ms 前推，进一步降低解码抖动
          start = Math.min(Number.isFinite(dur) ? Math.max(0, dur - 0.05) : start + epsilon, cur + epsilon);
        }
      }
      if (typeof audio.fastSeek === 'function') {
        try { audio.fastSeek(start); } catch(_) { audio.currentTime = start; }
      } else {
        audio.currentTime = start;
      }
      segmentEnd = computeEnd(it);
      segmentStartWallclock = performance.now();
      // 让浏览器有时间完成 seek 的解码定位，再启动播放
      setTimeout(() => {
        const p = audio.play();
        if (p && p.catch) { p.catch(() => { }); }
      }, 20);
      highlight(i, manual);

      // 使用 requestAnimationFrame 确保 DOM 更新完成后再调度
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduleAdvance();
        });
      });
    }

    let scrollTimer = 0;
    function scheduleScrollTo(el, manual){
      if (!el) return;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
      if (!autoFollow) return;
      if (manual) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        return;
      }
      // 自动模式：延后执行无动画滚动，避开段首易抖区域
      scrollTimer = setTimeout(() => {
        try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch(_){}
      }, 420);
    }
    function highlight(i, manual=false) {
      const prev = listEl.querySelector('.sentence.active');
      if (prev) prev.classList.remove('active');
      const cur = listEl.querySelector(`.sentence[data-idx="${i}"]`);
      if (cur) {
        cur.classList.add('active');
        scheduleScrollTo(cur, manual);
      }
    }

    listEl.addEventListener('click', e => {
      const s = e.target.closest('.sentence'); if (!s) return;
      playSegment(parseInt(s.dataset.idx, 10), { manual: true });
    });

    let lastUpdateTime = 0;
    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      const now = performance.now();

      // 节流 timeupdate 处理，避免频繁触发
      if (now - lastUpdateTime < 200) return;
      lastUpdateTime = now;

      // 段起始的短时间窗口内，避免做重型 DOM/计算，减小移动端抖动
      if (segmentStartWallclock && now - segmentStartWallclock < 350) {
        return;
      }

      // 只处理高亮和位置保存，不处理调度
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const segEnd = computeEnd(it);
        const within = t >= it.start && (segEnd ? t < segEnd : true);
        if (within) {
          if (idx !== i) {
            idx = i;
            segmentEnd = segEnd;
            highlight(i);
          }
          break;
        }
      }
      // throttle persist last position
      if (now - _lastSavedAt > 2000) { _lastSavedAt = now; saveLastPos(); }
    });

    // User control: when paused, stop auto-advance; when resumed, re-schedule
    audio.addEventListener('pause', () => {
      clearAdvance();
      isScheduling = false; // 重置调度状态
      scheduleTime = 0;
      // 内部切句导致的 pause 不写入本地，避免同步写阻塞主线程
      if (!internalPause) saveLastPos(true);
      internalPause = false;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
    });
    audio.addEventListener('play', () => {
      // 延迟调度，避免与 timeupdate 冲突
      setTimeout(() => scheduleAdvance(), 50);
      // update recents timestamp upon play interaction
      touchRecent();
      internalPause = false;
    });

    // 倍速变化由上方监听器触发 scheduleAdvance，这里无需重复绑定

    // 音频整体播放结束兜底：用于最后一句未正确设置 end 的情况
    audio.addEventListener('ended', () => {
      if (readMode === 'continuous') {
        if (autoContinueMode === 'auto') {
          autoNextLesson();
        }
      }
    });

    // Handle lesson change via hash navigation (prev/next buttons)
    window.addEventListener('hashchange', () => {
      // Scroll to top then reload to re-init content
      window.scrollTo(0, 0);
      location.reload();
    });

    // Resolve neighbors and wire bottom nav
    async function resolveLessonNeighbors() {
      try {
        const num = parseInt(book.replace('NCE', '')) || 1;
        const res = await fetch(prefix + 'static/data.json');
        const data = await res.json();
        const lessons = data[num] || [];
        const i = lessons.findIndex(x => x.filename === base);
        if (i > 0) {
          const prev = lessons[i - 1].filename;
          prevLessonHref = `lesson.html#${book}/${prev}`;
          if (prevLessonLink) { prevLessonLink.href = prevLessonHref; prevLessonLink.style.display = ''; }
        } else {
          if (prevLessonLink) { prevLessonLink.style.display = 'none'; }
        }
        if (i >= 0 && i + 1 < lessons.length) {
          const next = lessons[i + 1].filename;
          nextLessonHref = `lesson.html#${book}/${next}`;
          if (nextLessonLink) { nextLessonLink.href = nextLessonHref; nextLessonLink.style.display = ''; }
        } else {
          if (nextLessonLink) { nextLessonLink.style.display = 'none'; }
        }
      } catch (_) {
        if (prevLessonLink) prevLessonLink.style.display = 'none';
        if (nextLessonLink) nextLessonLink.style.display = 'none';
      }
    }

    NCE_APP.initSegmented(document);

    resolveLessonNeighbors();

    // 如果音频元数据已就绪，为最后一句设置 end = duration
    let _lastEndAdjusted = false;
    function adjustLastEndIfPossible() {
      if (_lastEndAdjusted) return;
      if (!items || !items.length) return;
      const dur = Number(audio.duration);
      if (!Number.isFinite(dur) || dur <= 0) return;
      const last = items[items.length - 1];
      if (!last.end || last.end <= last.start || last.end > dur) {
        last.end = dur;
        if (idx === items.length - 1) {
          segmentEnd = computeEnd(last);
        }
      }
      _lastEndAdjusted = true;
    }
    audio.addEventListener('loadedmetadata', adjustLastEndIfPossible);

    loadLrc(lrc).then(({ meta, items: arr }) => {
      items = arr;
      titleEl.textContent = meta.ti || base;
      subEl.textContent = `${meta.al || book} · ${meta.ar || ''}`.trim();
      render();
      // Autoplay parameter is ignored by default; user taps to play
      // mark as visited in recents
      touchRecent();
      // 若已知时长，修正最后一句的 end，确保段末逻辑能触发
      adjustLastEndIfPossible();

      // Resume if coming from index last seen
      try{
        const resumeId = sessionStorage.getItem('nce_resume');
        if (resumeId && resumeId === lessonId()){
          const map = JSON.parse(localStorage.getItem(LASTPOS_KEY)||'{}');
          const pos = map[resumeId];
          if (pos){
            const targetIdx = (Number.isInteger(pos.idx) && pos.idx>=0 && pos.idx<items.length) ? pos.idx : 0;
            audio.currentTime = Math.max(0, pos.t || 0);
            idx = targetIdx; segmentEnd = computeEnd(items[targetIdx]);
            highlight(targetIdx, false);
            if (sessionStorage.getItem('nce_resume_play')==='1'){
              const p = audio.play(); if (p && p.catch) p.catch(()=>{});
              scheduleAdvance();
            }
          }
        }
      }catch(_){ }
      sessionStorage.removeItem('nce_resume');
      sessionStorage.removeItem('nce_resume_play');
    }).catch(err => {
      titleEl.textContent = '无法加载课文';
      subEl.textContent = String(err);
    });

    window.addEventListener('beforeunload', ()=>{ saveLastPos(true); });
  });
})();
