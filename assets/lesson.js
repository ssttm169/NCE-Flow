/**
 * NCE Flow · lesson.js · iOS-Optimized Edition
 * 目标：
 *  - iOS 首次“点句子”即可播（全域解锁，无需先点系统播放按钮）
 *  - 点读：严格止于当前句（静音+暂停+钳位），不漏出下一句前缀音
 *  - 连读：无缝切句（静音→seek→seeked/canplay→两帧后解除静音）
 *  - 调度：远端 setTimeout + 近端 requestAnimationFrame（随倍速动态提前量）
 *  - 兼容：iOS Safari/Chrome、Android、桌面浏览器；倍速 0.75~2.5
 */

(() => {
  // --------------------------
  // 工具 & 解析
  // --------------------------
  const LINE_RE = /^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/;
  const TIME_RE = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  const META_RE = /^\[(al|ar|ti|by):(.+)\]$/i;

  function timeTagsToSeconds(tags) {
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
      else if (i + 1 < rows.length) {
        const m2 = rows[i + 1].trim().match(LINE_RE);
        if (m2 && m2[1] === tags) {
          const text2 = m2[2].trim();
          if (hasCJK(text2)) { cn = text2; i++; }
        }
      }
      items.push({ start, en, cn });
    }
    for (let i = 0; i < items.length; i++) items[i].end = i + 1 < items.length ? items[i + 1].start : 0;
    return { meta, items };
  }

  function qs(sel) { return document.querySelector(sel); }
  function once(target, type, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      let to = 0;
      const on = (e) => { cleanup(); resolve(e); };
      const cleanup = () => { target.removeEventListener(type, on); if (to) clearTimeout(to); };
      target.addEventListener(type, on, { once: true });
      if (timeoutMs > 0) to = setTimeout(() => { cleanup(); reject(new Error(type + ' timeout')); }, timeoutMs);
    });
  }
  const raf = (cb) => requestAnimationFrame(cb);
  const raf2 = (cb) => requestAnimationFrame(() => requestAnimationFrame(cb));

  // iOS / iPadOS / 触屏 Mac Safari
  const ua = navigator.userAgent || '';
  const isIOSLike = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

  // --------------------------
  // 主流程
  // --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (_) {}
    window.scrollTo(0, 0);

    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) { location.href = 'book.html'; return; }
    const [book, ...rest] = hash.split('/');
    const base = rest.join('/');
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
    const speedButton = qs('#speed');
    const modeToggle = qs('#modeToggle');
    const readModeSeg = qs('#readModeSeg');
    const followToggle = qs('#followToggle');

    // 本地存储键
    const RECENT_KEY = 'nce_recents';
    const LASTPOS_KEY = 'nce_lastpos';
    const MODE_KEY = 'readMode';
    const FOLLOW_KEY = 'autoFollow';
    const AUTO_CONTINUE_KEY = 'autoContinue';

    // 状态
    let items = [];
    let idx = -1;
    let segmentEnd = 0;
    let segmentTimer = 0;
    let segmentRaf = 0;
    let isScheduling = false;
    let scheduleTime = 0;
    let internalPause = false;
    let segmentStartWallclock = 0;
    let prevLessonHref = '';
    let nextLessonHref = '';
    let _lastSavedAt = 0;

    // iOS 特有状态
    let iosUnlocked = false;         // 是否已“解锁音频”
    let metadataReady = false;       // 是否已 loadedmetadata
    let _userVolume = Math.max(0, Math.min(1, audio.volume || 1));

    // 速率
    const rates = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 0.75, 1.0];
    const DEFAULT_RATE = 1.0;
    let savedRate = parseFloat(localStorage.getItem('audioPlaybackRate'));
    if (isNaN(savedRate) || !rates.includes(savedRate)) savedRate = DEFAULT_RATE;
    let currentRateIndex = Math.max(0, rates.indexOf(savedRate));

    // 读取模式/跟随/续播
    let readMode = (localStorage.getItem(MODE_KEY) === 'single') ? 'single' : 'continuous';
    let autoFollow = (localStorage.getItem(FOLLOW_KEY) === 'false') ? false : true;
    let autoContinueMode = (localStorage.getItem(AUTO_CONTINUE_KEY) === 'auto') ? 'auto' : 'single';

    // --------------------------
    // iOS 解锁：首次任意交互即解锁
    // --------------------------
    function unlockAudioSync() {
      if (iosUnlocked) return;
      try {
        audio.muted = true;            // 保证解锁过程无声
        const p = audio.play();        // 在同一用户手势栈内发起
        iosUnlocked = true;
        // 立即排队暂停与还原 mute（避免可闻 blip）
        setTimeout(() => { try { audio.pause(); } catch(_) {} audio.muted = false; }, 0);
      } catch (_) { iosUnlocked = false; }
    }
    if (isIOSLike) {
      const evs = ['pointerdown','touchstart','click'];
      const onceUnlock = (e) => { unlockAudioSync(); evs.forEach(t => document.removeEventListener(t, onceUnlock, true)); };
      evs.forEach(t => document.addEventListener(t, onceUnlock, { capture: true, passive: true, once: true }));
    }

    // 确保 metadata 已就绪（iOS 上 seek 前最好等）
    async function ensureMetadata() {
      if (metadataReady) return;
      try { await once(audio, 'loadedmetadata', 5000); metadataReady = true; }
      catch (_) { /* 忽略，后续 seek 仍会尽力 */ }
    }

    // --------------------------
    // UI 反映/设置
    // --------------------------
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
      const autoContinueCard = document.getElementById('autoContinueCard');
      if (autoContinueCard) autoContinueCard.style.display = isContinuous ? 'inline-flex' : 'none';
    }
    function reflectFollowMode() {
      if (!followToggle) return;
      followToggle.textContent = autoFollow ? '跟随' : '不跟随';
      followToggle.setAttribute('aria-pressed', autoFollow ? 'true' : 'false');
      followToggle.dataset.follow = autoFollow;
    }
    function reflectAutoContinueMode() {
      const singleRadio = document.getElementById('autoContinueSingle');
      const autoRadio = document.getElementById('autoContinueAuto');
      if (singleRadio && autoRadio) {
        singleRadio.checked = autoContinueMode === 'single';
        autoRadio.checked = autoContinueMode === 'auto';
      }
    }
    reflectReadMode(); reflectFollowMode(); reflectAutoContinueMode();

    function setReadMode(mode) {
      readMode = (mode === 'single') ? 'single' : 'continuous';
      try { localStorage.setItem(MODE_KEY, readMode); } catch(_) {}
      reflectReadMode();
      // 模式切换：清调度→按新模式刷新当前段末→重建调度
      clearAdvance(); isScheduling = false; scheduleTime = 0;
      if (idx >= 0 && idx < items.length) segmentEnd = endFor(items[idx]);
      scheduleAdvance();
    }
    function setFollowMode(follow) {
      autoFollow = !!follow;
      try { localStorage.setItem(FOLLOW_KEY, autoFollow.toString()); } catch(_) {}
      reflectFollowMode();
    }
    function setAutoContinueMode(mode) {
      autoContinueMode = (mode === 'auto') ? 'auto' : 'single';
      try { localStorage.setItem(AUTO_CONTINUE_KEY, autoContinueMode); } catch(_) {}
      reflectAutoContinueMode();
    }

    if (modeToggle) modeToggle.addEventListener('click', () => setReadMode(readMode === 'continuous' ? 'single' : 'continuous'));
    if (readModeSeg) readModeSeg.addEventListener('click', (e) => {
      const b = e.target.closest('.seg'); if (!b) return; const v = b.getAttribute('data-read');
      setReadMode(v === 'single' ? 'single' : 'continuous');
    });
    if (followToggle) followToggle.addEventListener('click', () => setFollowMode(!autoFollow));

    const singleRadio = document.getElementById('autoContinueSingle');
    const autoRadio  = document.getElementById('autoContinueAuto');
    if (singleRadio) singleRadio.addEventListener('change', () => { if (singleRadio.checked) setAutoContinueMode('single'); });
    if (autoRadio)   autoRadio.addEventListener('change',  () => { if (autoRadio.checked)   setAutoContinueMode('auto'); });

    // 倍速
    audio.playbackRate = savedRate;
    if (speedButton) speedButton.textContent = `${savedRate.toFixed(2)}x`;
    if (speedButton) speedButton.addEventListener('click', () => {
      currentRateIndex = (currentRateIndex + 1) % rates.length;
      const newRate = rates[currentRateIndex];
      audio.playbackRate = newRate;
    });
    audio.addEventListener('ratechange', () => {
      const r = audio.playbackRate;
      try { localStorage.setItem('audioPlaybackRate', r); } catch(_) {}
      if (speedButton) speedButton.textContent = `${r.toFixed(2)}x`;
      const i = rates.indexOf(r); if (i !== -1) currentRateIndex = i;
      scheduleAdvance();
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

    // 设置面板（沿用你的结构）
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
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
      };
      document.addEventListener('keydown', _trapHandler);
    }
    function disableTrap(){ if (_trapHandler) { document.removeEventListener('keydown', _trapHandler); _trapHandler = null; } }
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

    const settingsReset = qs('#settingsReset');
    if (settingsReset){
      settingsReset.addEventListener('click', ()=>{
        try{ localStorage.setItem('audioPlaybackRate', DEFAULT_RATE); }catch(_){}
        audio.playbackRate = DEFAULT_RATE;
        setReadMode('continuous'); setFollowMode(true); setAutoContinueMode('single');
        reflectReadMode(); reflectFollowMode(); reflectAutoContinueMode();
        showNotification('已恢复默认设置');
      });
    }

    // --------------------------
    // 渲染 & 端点计算
    // --------------------------
    function render() {
      const html = items.map((it, i) => `
        <div class="sentence" data-idx="${i}">
          <div class="en">${it.en}</div>
          ${it.cn ? `<div class="cn">${it.cn}</div>` : ''}
        </div>
      `).join('');
      qs('#sentences').innerHTML = html;
    }

    function computeEnd(it) {
      const fallback = 0.2; // 连读最小时长
      if (it.end && it.end > it.start) return it.end;
      return Math.max(0, (it.start || 0) + fallback);
    }
    function endFor(it) {
      if (readMode === 'single') {
        // 点读严格用下一句开始作为止点
        return (it.end && it.end > it.start) ? it.end : (it.start + 0.01);
      }
      return computeEnd(it);
    }

    // --------------------------
    // 调度：远端定时 + 近端 rAF
    // --------------------------
    function clearAdvance() {
      if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = 0; }
      if (segmentRaf)   { cancelAnimationFrame(segmentRaf); segmentRaf = 0; }
    }
    function guardAheadSec() {
      const r = Math.max(0.5, Math.min(3, audio.playbackRate || 1));
      // iOS 略保守：基础 80ms，倍速升高再加裕度，上限约 120ms
      const base = isIOSLike ? 0.08 : 0.06;
      const slope = isIOSLike ? 0.03 : 0.02;
      return base + (r - 1) * slope;
    }
    const NEAR_WINDOW_MS = isIOSLike ? 160 : 120;
    const MAX_CHUNK_MS   = 10000;

    function scheduleAdvance() {
      clearAdvance(); isScheduling = false; scheduleTime = 0;
      if (audio.paused) return;
      if (!(segmentEnd && idx >= 0)) return;

      const rate = Math.max(0.0001, audio.playbackRate || 1);
      const remainingMs = Math.max(0, (segmentEnd - audio.currentTime) * 1000 / rate);
      scheduleTime = segmentEnd;
      const modeSnap = readMode;

      // 近端窗口：rAF 精确判断
      if (remainingMs <= NEAR_WINDOW_MS) {
        isScheduling = true;
        const endSnap = segmentEnd;
        const guard = guardAheadSec();
        const step = () => {
          if (readMode !== modeSnap || audio.paused || !(segmentEnd && idx >= 0)) { isScheduling = false; return; }
          const now = audio.currentTime;
          if (now >= endSnap - guard) {
            isScheduling = false; scheduleTime = 0;
            const currentIdx = idx;

            if (readMode === 'continuous') {
              if (currentIdx + 1 < items.length) playSegment(currentIdx + 1);
              else { audio.pause(); if (autoContinueMode === 'auto') autoNextLesson(); }
            } else {
              // 点读：静音→暂停→钳位到句尾，彻底避免“下一句前缀音”
              const dur = Number(audio.duration);
              audio.muted = true;
              try { audio.pause(); } catch(_) {}
              const clamp = Number.isFinite(dur) ? Math.min(endSnap, Math.max(0, dur - 0.05)) : endSnap;
              try { audio.currentTime = clamp; } catch(_) {}
              // 保持暂停，稍后用户点播再解除静音
              setTimeout(() => { audio.muted = false; }, 0);
            }
          } else {
            segmentRaf = raf(step);
          }
        };
        segmentRaf = raf(step);
        return;
      }

      // 远端窗口：coarse timer
      const delay = Math.max(10, Math.min(remainingMs, MAX_CHUNK_MS));
      isScheduling = true;
      segmentTimer = setTimeout(function tick() {
        if (readMode !== modeSnap || audio.paused || !(segmentEnd && idx >= 0)) { isScheduling = false; return; }
        const now = audio.currentTime;
        const end = segmentEnd;
        const remainRealMs = Math.max(0, (end - now) * 1000 / Math.max(0.0001, audio.playbackRate || 1));

        if (remainRealMs <= NEAR_WINDOW_MS) {
          isScheduling = false; scheduleAdvance(); return;
        }
        const rate2 = Math.max(0.0001, audio.playbackRate || 1);
        const nextDelay = Math.max(10, Math.min(Math.max(0, (end - audio.currentTime) * 1000 / rate2), MAX_CHUNK_MS));
        segmentTimer = setTimeout(tick, nextDelay);
      }, delay);
    }

    // --------------------------
    // 无缝切句 / 播放控制
    // --------------------------
    function fastSeekTo(t) {
      if (typeof audio.fastSeek === 'function') {
        try { audio.fastSeek(t); } catch(_) { audio.currentTime = t; }
      } else {
        audio.currentTime = t;
      }
    }

    async function playSegment(i, opts) {
      const manual = !!(opts && opts.manual);
      if (i < 0 || i >= items.length) return;
      // 自动流程：同句且已在播不重复
      if (!manual && idx === i && !audio.paused) return;

      // iOS：点击句子也要能“第一次就播”
      if (isIOSLike && !iosUnlocked) unlockAudioSync();

      // 在 iOS 上，seek 前优先确保 metadata
      await ensureMetadata();

      clearAdvance(); isScheduling = false; scheduleTime = 0;
      idx = i;
      const it = items[i];
      let start = Math.max(0, it.start || 0);
      segmentEnd = endFor(it);
      segmentStartWallclock = performance.now();
      highlight(i, manual);

      const cur = Math.max(0, audio.currentTime || 0);
      // 自动前进且“新起点过近”时，给极小前移，避免抖动
      if (!manual && start <= cur + 0.005) {
        const dur = Number(audio.duration);
        const eps = 0.005;
        start = Math.min(Number.isFinite(dur) ? Math.max(0, dur - 0.05) : start + eps, cur + eps);
      }

      if (readMode === 'continuous' && !audio.paused) {
        // 连读：保持播放，静音→seek→(seeked/canplay)→两帧后解除静音→调度
        audio.muted = true;
        let done = false;
        const finish = () => {
          if (done) return; done = true;
          audio.removeEventListener('seeked', finish);
          audio.removeEventListener('canplay', finish);
          raf2(() => { audio.muted = false; scheduleAdvance(); });
        };
        audio.addEventListener('seeked', finish, { once: true });
        audio.addEventListener('canplay', finish, { once: true });
        fastSeekTo(start);
      } else {
        // 点读/初次播放：暂停→seek→seeked 后 play（不使用固定延时）
        try { internalPause = true; audio.pause(); } catch(_) {}
        const resume = () => {
          audio.removeEventListener('seeked', resume);
          const p = audio.play(); if (p && p.catch) p.catch(()=>{});
          raf2(() => scheduleAdvance());
        };
        audio.addEventListener('seeked', resume, { once: true });
        fastSeekTo(start);
      }
    }

    // --------------------------
    // 高亮 & 跟随
    // --------------------------
    let scrollTimer = 0;
    function scheduleScrollTo(el, manual){
      if (!el) return;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
      if (!autoFollow) return;
      if (manual) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {} return; }
      scrollTimer = setTimeout(() => { try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch(_) {} }, 420);
    }
    function highlight(i, manual=false) {
      const prev = listEl.querySelector('.sentence.active'); if (prev) prev.classList.remove('active');
      const cur = listEl.querySelector(`.sentence[data-idx="${i}"]`);
      if (cur) { cur.classList.add('active'); scheduleScrollTo(cur, manual); }
    }
    listEl.addEventListener('click', e => {
      const s = e.target.closest('.sentence'); if (!s) return;
      // 确保“首次点句”也能触发 iOS 解锁
      if (isIOSLike && !iosUnlocked) unlockAudioSync();
      playSegment(parseInt(s.dataset.idx, 10), { manual: true });
    });

    // --------------------------
    // 轻量 timeupdate：只做高亮/存档
    // --------------------------
    let lastUpdateTime = 0;
    audio.addEventListener('timeupdate', () => {
      const now = performance.now();
      if (now - lastUpdateTime < 200) return;
      lastUpdateTime = now;

      // 段首 350ms 内避免重活，降低抖动
      if (segmentStartWallclock && now - segmentStartWallclock < 350) return;

      const t = audio.currentTime;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const segEnd = endFor(it);
        const within = t >= it.start && (segEnd ? t < segEnd : true);
        if (within) {
          if (idx !== i) { idx = i; segmentEnd = segEnd; highlight(i); }
          break;
        }
      }

      if (now - _lastSavedAt > 2000) { _lastSavedAt = now; saveLastPos(); }
    });

    // 播放/暂停
    audio.addEventListener('pause', () => {
      clearAdvance(); isScheduling = false; scheduleTime = 0;
      if (!internalPause) saveLastPos(true);
      internalPause = false;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
    });
    audio.addEventListener('play', () => {
      setTimeout(() => scheduleAdvance(), 50);
      touchRecent();
      internalPause = false;
    });

    // 进度变更：重建调度
    audio.addEventListener('seeked', () => {
      clearAdvance(); isScheduling = false; scheduleTime = 0; scheduleAdvance();
    });

    // 整体结束
    audio.addEventListener('ended', () => {
      if (readMode === 'continuous' && autoContinueMode === 'auto') autoNextLesson();
    });

    // --------------------------
    // 邻接课程与跳转
    // --------------------------
    async function getNextLesson(currentBook, currentFilename) {
      try {
        const response = await fetch(prefix + 'static/data.json');
        if (!response.ok) return null;
        const data = await response.json();
        const bookNum = parseInt(currentBook.replace('NCE', '')) || 1;
        const lessons = data[bookNum] || [];
        const currentIndex = lessons.findIndex(lesson => lesson.filename === currentFilename);
        if (currentIndex >= 0 && currentIndex < lessons.length - 1) return lessons[currentIndex + 1];
        return null;
      } catch (e) { console.error(e); return null; }
    }
    function showNotification(message) {
      const n = document.createElement('div');
      n.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: var(--surface); color: var(--text); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 12px 20px; box-shadow: var(--shadow);
        z-index: 1000; backdrop-filter: saturate(120%) blur(10px); animation: slideDown 0.3s ease-out;
      `;
      n.textContent = message; document.body.appendChild(n);
      setTimeout(()=>{ n.style.animation='slideUp 0.3s ease-out'; setTimeout(()=>{ document.body.removeChild(n); },300); },2000);
    }
    async function autoNextLesson() {
      const nextLesson = await getNextLesson(book, base);
      if (nextLesson) {
        showNotification(`即将跳转到下一课：${nextLesson.title}`);
        setTimeout(() => {
          try {
            const nextId = `${book}/${nextLesson.filename}`;
            sessionStorage.setItem('nce_resume', nextId);
            sessionStorage.setItem('nce_resume_play', '1');
            const map = JSON.parse(localStorage.getItem(LASTPOS_KEY) || '{}');
            map[nextId] = { t: 0, idx: 0, ts: Date.now() };
            localStorage.setItem(LASTPOS_KEY, JSON.stringify(map));
          } catch(_) {}
          window.location.href = `lesson.html#${book}/${nextLesson.filename}`;
        }, 2000);
      } else {
        showNotification('🎉 恭喜完成本册课程！');
      }
    }
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
        } else { if (prevLessonLink) prevLessonLink.style.display = 'none'; }
        if (i >= 0 && i + 1 < lessons.length) {
          const next = lessons[i + 1].filename;
          nextLessonHref = `lesson.html#${book}/${next}`;
          if (nextLessonLink) { nextLessonLink.href = nextLessonHref; nextLessonLink.style.display = ''; }
        } else { if (nextLessonLink) nextLessonLink.style.display = 'none'; }
      } catch (_) {
        if (prevLessonLink) prevLessonLink.style.display = 'none';
        if (nextLessonLink) nextLessonLink.style.display = 'none';
      }
    }

    // --------------------------
    // 启动：装载音频/LRC + 断点恢复
    // --------------------------
    // 重要：iOS 上尽早设定 preload，有助于更快拿到 metadata
    try { audio.preload = 'auto'; } catch(_) {}
    audio.src = mp3;
    try { audio.load(); } catch(_) {}

    if (window.NCE_APP && typeof NCE_APP.initSegmented === 'function') {
      try { NCE_APP.initSegmented(document); } catch(_) {}
    }

    resolveLessonNeighbors();

    let _lastEndAdjusted = false;
    function adjustLastEndIfPossible() {
      if (_lastEndAdjusted) return;
      if (!items || !items.length) return;
      const dur = Number(audio.duration);
      if (!Number.isFinite(dur) || dur <= 0) return;
      const last = items[items.length - 1];
      if (!last.end || last.end <= last.start || last.end > dur) {
        last.end = dur;
        if (idx === items.length - 1) segmentEnd = computeEnd(last);
      }
      _lastEndAdjusted = true;
    }
    audio.addEventListener('loadedmetadata', () => { metadataReady = true; adjustLastEndIfPossible(); });

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

    loadLrc(lrc).then(({ meta, items: arr }) => {
      items = arr;
      titleEl.textContent = meta.ti || base;
      subEl.textContent = `${meta.al || book} · ${meta.ar || ''}`.trim();
      render();
      touchRecent();
      adjustLastEndIfPossible();

      // 从上一课或首页跳转来的自动恢复
      try{
        const resumeId = sessionStorage.getItem('nce_resume');
        if (resumeId && resumeId === lessonId()){
          const map = JSON.parse(localStorage.getItem(LASTPOS_KEY)||'{}');
          const pos = map[resumeId];
          if (pos){
            const targetIdx = (Number.isInteger(pos.idx) && pos.idx>=0 && pos.idx<items.length) ? pos.idx : 0;
            audio.currentTime = Math.max(0, pos.t || 0);
            idx = targetIdx; segmentEnd = endFor(items[targetIdx]);
            highlight(targetIdx, false);
            if (sessionStorage.getItem('nce_resume_play')==='1'){
              const p = audio.play(); if (p && p.catch) p.catch(()=>{});
              scheduleAdvance();
            }
          }
        }
      }catch(_){}
      sessionStorage.removeItem('nce_resume');
      sessionStorage.removeItem('nce_resume_play');
    }).catch(err => {
      titleEl.textContent = '无法加载课文';
      subEl.textContent = String(err);
    });

    window.addEventListener('beforeunload', ()=>{ saveLastPos(); });
    window.addEventListener('hashchange', () => { window.scrollTo(0, 0); location.reload(); });
  });
})();
