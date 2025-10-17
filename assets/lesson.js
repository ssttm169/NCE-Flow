/**
 * NCE Flow · lesson.js (Best-Experience Edition)
 */
(() => {
  // --------------------------
  // LRC 解析与工具函数
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

  async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Fetch failed ' + url);
    return await r.text();
  }

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
      if (body.includes('|')) {
        const parts = body.split('|'); en = parts[0].trim(); cn = (parts[1] || '').trim();
      } else if (i + 1 < rows.length) {
        // 堆叠 EN/CN：下一行与本行时间相同且含中日韩字符，则为中文
        const m2 = rows[i + 1].trim().match(LINE_RE);
        if (m2 && m2[1] === tags) {
          const text2 = m2[2].trim();
          if (hasCJK(text2)) { cn = text2; i++; }
        }
      }
      items.push({ start, en, cn });
    }
    // 计算 end（下一行 start），最后一行先置 0，稍后有元数据时再修正为 duration
    for (let i = 0; i < items.length; i++) {
      items[i].end = i + 1 < items.length ? items[i + 1].start : 0;
    }
    return { meta, items };
  }

  function qs(sel) { return document.querySelector(sel); }

  // --------------------------
  // 页面初始化（沿用你的结构与约定）
  // --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    // 避免浏览器恢复滚动位置
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

    // 倍速
    const speedButton = qs('#speed');
    const rates = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 0.75, 1.0];
    const DEFAULT_RATE = 1.0;

    // 阅读模式/跟随/自动续播
    const modeToggle = qs('#modeToggle');
    const readModeSeg = qs('#readModeSeg');
    const followToggle = qs('#followToggle');

    // 本地存储键
    const RECENT_KEY = 'nce_recents';
    const LASTPOS_KEY = 'nce_lastpos'; // map: id -> { t, idx, ts }
    const MODE_KEY = 'readMode';             // 'continuous' | 'single'
    const FOLLOW_KEY = 'autoFollow';         // 'true' | 'false'
    const AUTO_CONTINUE_KEY = 'autoContinue' // 'single' | 'auto'

    // 运行态
    let items = [];
    let idx = -1;
    let segmentEnd = 0;                 // 当前句末时间（秒）
    let segmentTimer = 0;               // setTimeout id（远端调度）
    let segmentRaf = 0;                 // requestAnimationFrame id（近端调度）
    let isScheduling = false;           // 是否有调度在运行
    let scheduleTime = 0;               // 观测：本次调度的目标时间（段末）
    let internalPause = false;          // 内部切句引发的 pause 标记，避免在 'pause' 里做重活
    let segmentStartWallclock = 0;      // 每段开始的墙钟时间（用于首 ~300ms 的降噪）
    let prevLessonHref = '';
    let nextLessonHref = '';
    let _lastSavedAt = 0;               // 上次保存进度的时间戳

    // iOS 判断（用于决定是否采用 volume 渐变）
    const ua = navigator.userAgent || '';
    const isIOSLike = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);

    // --------- 播放速率持久化 ----------
    let savedRate = parseFloat(localStorage.getItem('audioPlaybackRate'));
    if (isNaN(savedRate) || !rates.includes(savedRate)) savedRate = DEFAULT_RATE;
    let currentRateIndex = rates.indexOf(savedRate);
    if (currentRateIndex === -1) currentRateIndex = rates.indexOf(DEFAULT_RATE);
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
      const actualRate = audio.playbackRate;
      try { localStorage.setItem('audioPlaybackRate', actualRate); } catch (_) { }
      if (speedButton) speedButton.textContent = `${actualRate.toFixed(2)}x`;
      const newIndex = rates.indexOf(actualRate);
      if (newIndex !== -1) currentRateIndex = newIndex;
      // 速率变化后，重新调度
      scheduleAdvance();
    });

    // --------- 阅读模式/跟随/续播 ----------
    let readMode = 'continuous';
    try {
      const savedMode = localStorage.getItem(MODE_KEY);
      if (savedMode === 'continuous' || savedMode === 'single') readMode = savedMode;
    } catch (_) { }

    let autoFollow = true;
    try {
      const savedFollow = localStorage.getItem(FOLLOW_KEY);
      if (savedFollow === 'true' || savedFollow === 'false') autoFollow = savedFollow === 'true';
    } catch (_) {}

    let autoContinueMode = 'single';
    try {
      const savedAutoContinue = localStorage.getItem(AUTO_CONTINUE_KEY);
      if (savedAutoContinue === 'single' || savedAutoContinue === 'auto') autoContinueMode = savedAutoContinue;
    } catch (_) {}

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
      // 自动续播设置显隐
      const autoContinueCard = document.getElementById('autoContinueCard');
      if (autoContinueCard) autoContinueCard.style.display = isContinuous ? 'inline-flex' : 'none';
    }
    reflectReadMode();

    function reflectFollowMode() {
      if (!followToggle) return;
      followToggle.textContent = autoFollow ? '跟随' : '不跟随';
      followToggle.setAttribute('aria-pressed', autoFollow ? 'true' : 'false');
      followToggle.dataset.follow = autoFollow;
    }
    reflectFollowMode();

    function reflectAutoContinueMode() {
      const singleRadio = document.getElementById('autoContinueSingle');
      const autoRadio = document.getElementById('autoContinueAuto');
      if (!singleRadio || !autoRadio) return;
      singleRadio.checked = autoContinueMode === 'single';
      autoRadio.checked = autoContinueMode === 'auto';
    }
    reflectAutoContinueMode();

    function setReadMode(mode) {
      readMode = mode === 'single' ? 'single' : 'continuous';
      try { localStorage.setItem(MODE_KEY, readMode); } catch(_) {}
      reflectReadMode();
      // 切模式要重建段末与调度
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;
      if (idx >= 0 && idx < items.length) segmentEnd = endFor(items[idx]);
      scheduleAdvance();
    }

    if (modeToggle) {
      modeToggle.addEventListener('click', () => setReadMode(readMode === 'continuous' ? 'single' : 'continuous'));
    }
    if (readModeSeg) {
      readModeSeg.addEventListener('click', (e) => {
        const b = e.target.closest('.seg'); if (!b) return;
        const v = b.getAttribute('data-read') === 'single' ? 'single' : 'continuous';
        setReadMode(v);
      });
    }

    function setFollowMode(follow) {
      autoFollow = !!follow;
      try { localStorage.setItem(FOLLOW_KEY, autoFollow.toString()); } catch(_) {}
      reflectFollowMode();
    }
    if (followToggle) {
      followToggle.addEventListener('click', () => setFollowMode(!autoFollow));
    }

    function setAutoContinueMode(mode) {
      autoContinueMode = mode === 'auto' ? 'auto' : 'single';
      try { localStorage.setItem(AUTO_CONTINUE_KEY, autoContinueMode); } catch(_) {}
      reflectAutoContinueMode();
    }
    const singleRadio = document.getElementById('autoContinueSingle');
    const autoRadio = document.getElementById('autoContinueAuto');
    if (singleRadio) singleRadio.addEventListener('change', () => { if (singleRadio.checked) setAutoContinueMode('single'); });
    if (autoRadio)  autoRadio.addEventListener('change',  () => { if (autoRadio.checked)  setAutoContinueMode('auto'); });

    // --------- 返回、设置面板等（沿用） ----------
    audio.src = mp3;
    if (backLink) {
      const fallback = `index.html#${book}`;
      backLink.setAttribute('href', fallback);
      backLink.addEventListener('click', (e) => {
        e.preventDefault();
        try { const ref = document.referrer; if (ref && new URL(ref).origin === location.origin) { history.back(); return; } } catch (_) {}
        location.href = fallback;
      });
    }

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

    const settingsReset = qs('#settingsReset');
    if (settingsReset){
      settingsReset.addEventListener('click', ()=>{
        try{ localStorage.setItem('audioPlaybackRate', DEFAULT_RATE); }catch(_){}
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

    // --------- 课文列表渲染 ----------
    function render() {
      listEl.innerHTML = items.map((it, i) => `
        <div class="sentence" data-idx="${i}">
          <div class="en">${it.en}</div>
          ${it.cn ? `<div class="cn">${it.cn}</div>` : ''}
        </div>
      `).join('');
    }

    // 段末选择：点读严格止于下一句开始；连读用 computeEnd（至少 0.2s）
    function computeEnd(it) {
      const fallback = 0.2; // seconds
      if (it.end && it.end > it.start) return it.end;
      return Math.max(0, (it.start || 0) + fallback);
    }
    function endFor(it){
      if (readMode === 'single') {
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

    // 动态提前量（单位：秒）。基础 60ms，倍速升高则更保守，上限约 100ms
    function guardAheadSec() {
      const r = Math.max(0.5, Math.min(3, audio.playbackRate || 1));
      return 0.06 + (r - 1) * 0.02;
    }

    const MAX_CHUNK_MS = 10000; // 远端分段最大的 sleep（处理慢速或超长句）
    const NEAR_WINDOW_MS = 120; // 近端窗口阈值（进入则改用 rAF）

    function scheduleAdvance() {
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;

      if (audio.paused) return;
      if (!(segmentEnd && idx >= 0)) return;

      const rate = Math.max(0.0001, audio.playbackRate || 1);
      const currentTime = audio.currentTime;
      const remainingMs = Math.max(0, (segmentEnd - currentTime) * 1000 / rate);
      scheduleTime = segmentEnd;
      const schedulingMode = readMode;

      // 近端：用 rAF 高精度判断，避免越界到下一句
      if (remainingMs <= NEAR_WINDOW_MS) {
        isScheduling = true;
        const endSnap = segmentEnd;
        const modeSnap = schedulingMode;
        const guard = guardAheadSec();
        const step = () => {
          if (readMode !== modeSnap || audio.paused || !(segmentEnd && idx >= 0)) { isScheduling = false; return; }
          const now = audio.currentTime;
          if (now >= endSnap - guard) {
            isScheduling = false; scheduleTime = 0;
            const currentIdx = idx;
            if (readMode === 'continuous') {
              if (currentIdx + 1 < items.length) {
                playSegment(currentIdx + 1);
              } else {
                audio.pause();
                if (autoContinueMode === 'auto') autoNextLesson();
              }
            } else {
              audio.pause();
            }
          } else {
            segmentRaf = requestAnimationFrame(step);
          }
        };
        segmentRaf = requestAnimationFrame(step);
        return;
      }

      // 远端：coarse timer，靠近段末时再递归切到近端 rAF
      const delay = Math.max(10, Math.min(remainingMs, MAX_CHUNK_MS));
      isScheduling = true;
      segmentTimer = setTimeout(function tick() {
        if (readMode !== schedulingMode || audio.paused || !(segmentEnd && idx >= 0)) { isScheduling = false; return; }
        const now = audio.currentTime;
        const end = segmentEnd;
        const remainRealMs = Math.max(0, (end - now) * 1000 / Math.max(0.0001, audio.playbackRate || 1));
        if (remainRealMs <= NEAR_WINDOW_MS) {
          isScheduling = false;
          scheduleAdvance(); // 进入近端分支
          return;
        }
        const rate2 = Math.max(0.0001, audio.playbackRate || 1);
        const remainMs2 = Math.max(0, (end - audio.currentTime) * 1000 / rate2);
        const nextDelay = Math.max(10, Math.min(remainMs2, MAX_CHUNK_MS));
        segmentTimer = setTimeout(tick, nextDelay);
      }, delay);
    }

    // 速率/seek 发生后，重建调度
    audio.addEventListener('seeked', () => {
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;
      scheduleAdvance();
    });

    // --------------------------
    // 无缝换段（核心体验）
    // --------------------------
    // 音量淡入/淡出（非 iOS 优先；iOS 上 volume 改动通常无效，退化为 mute）
    let _volRampId = 0;
    let _volRampRunning = false;
    let _userVolume = Math.max(0, Math.min(1, audio.volume || 1));
    audio.addEventListener('volumechange', () => {
      // 用户手动调音量时刷新保存值；淡入淡出过程中也会触发这个事件
      if (!_volRampRunning) _userVolume = Math.max(0, Math.min(1, audio.volume || 1));
    });

    function rampVolumeTo(target, ms) {
      if (isIOSLike) {
        // iOS：退化为瞬时 mute/解除
        audio.muted = target === 0;
        return Promise.resolve();
      }
      target = Math.max(0, Math.min(1, target));
      const startVol = audio.volume;
      const delta = target - startVol;
      if (Math.abs(delta) < 0.001 || ms <= 0) { audio.volume = target; return Promise.resolve(); }

      const start = performance.now();
      _volRampRunning = true;
      return new Promise(resolve => {
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          audio.volume = startVol + delta * t;
          if (t < 1) {
            _volRampId = requestAnimationFrame(step);
          } else {
            _volRampRunning = false;
            // ramp 结束后把用户音量记回来（如果目标是 0，先暂存原音量）
            if (target !== 0) _userVolume = target;
            resolve();
          }
        };
        _volRampId = requestAnimationFrame(step);
      });
    }

    function restoreUserVolume(ms = 12) {
      if (isIOSLike) { audio.muted = false; return Promise.resolve(); }
      return rampVolumeTo(Math.max(0, Math.min(1, _userVolume || 1)), ms);
    }

    function playSegment(i, opts) {
      const manual = !!(opts && opts.manual);
      if (i < 0 || i >= items.length) return;
      // 自动流程下，若已在同一句播放中，不重复触发；手动点击允许重播
      if (!manual && idx === i && !audio.paused) return;

      // 清理旧调度
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;

      idx = i;
      const it = items[i];
      let start = Math.max(0, it.start || 0);
      segmentEnd = endFor(it);
      segmentStartWallclock = performance.now();
      highlight(i, manual);

      // 当前时间与新起点过近时的微小保护（避免“回放抖动”）
      const cur = Math.max(0, audio.currentTime || 0);
      if (!manual && start <= cur + 0.005) {
        const dur = Number(audio.duration);
        const eps = 0.005; // 5ms
        start = Math.min(Number.isFinite(dur) ? Math.max(0, dur - 0.05) : start + eps, cur + eps);
      }

      // 快速 seek
      const doSeek = () => {
        if (typeof audio.fastSeek === 'function') {
          try { audio.fastSeek(start); } catch (_) { audio.currentTime = start; }
        } else {
          audio.currentTime = start;
        }
      };

      // 连读：保持播放状态 -> 短淡出（或 mute） -> seek -> seeked 后淡入（或 unmute）
      if (readMode === 'continuous' && !audio.paused) {
        // 先淡出到静音，避免 seek 期间偶发的前一段残响
        rampVolumeTo(0, 8).then(() => {
          const unmute = () => {
            audio.removeEventListener('seeked', unmute);
            // 等 2 帧让解码定位稳定，再恢复音量与调度
            requestAnimationFrame(() => requestAnimationFrame(() => {
              restoreUserVolume(14).then(() => { scheduleAdvance(); });
            }));
          };
          audio.addEventListener('seeked', unmute, { once: true });
          doSeek(); // 播放状态下直接 seek（已静音，不会听到抖动）
        });
      } else {
        // 点读/初次播放：先暂停，seek 完成后再 play；避免固定延时，严格等 seeked
        try { internalPause = true; audio.pause(); } catch (_) {}
        const resume = () => {
          audio.removeEventListener('seeked', resume);
          const p = audio.play();
          if (p && p.catch) p.catch(() => {});
          // 播放后两帧再调度，避开起段瞬态
          requestAnimationFrame(() => requestAnimationFrame(() => scheduleAdvance()));
        };
        audio.addEventListener('seeked', resume, { once: true });
        doSeek();
      }
    }

    // --------------------------
    // 高亮 & 滚动跟随
    // --------------------------
    let scrollTimer = 0;
    function scheduleScrollTo(el, manual){
      if (!el) return;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
      if (!autoFollow) return;
      if (manual) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        return;
      }
      // 自动：延后无动画滚动，避开段首 ~400ms 的易抖区域
      scrollTimer = setTimeout(() => {
        try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch(_){}
      }, 420);
    }
    function highlight(i, manual=false) {
      const prev = listEl.querySelector('.sentence.active');
      if (prev) prev.classList.remove('active');
      const cur = listEl.querySelector(`.sentence[data-idx="${i}"]`);
      if (cur) { cur.classList.add('active'); scheduleScrollTo(cur, manual); }
    }

    listEl.addEventListener('click', e => {
      const s = e.target.closest('.sentence'); if (!s) return;
      playSegment(parseInt(s.dataset.idx, 10), { manual: true });
    });

    // --------------------------
    // 进度保持、更新与事件处理
    // --------------------------
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

    // timeupdate 仅负责“高亮/断点存储”的轻量工作
    let lastUpdateTime = 0;
    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      const now = performance.now();

      if (now - lastUpdateTime < 200) return; // 节流
      lastUpdateTime = now;

      // 段起始的 350ms 内尽量不做重型 DOM/计算，降低抖动
      if (segmentStartWallclock && now - segmentStartWallclock < 350) return;

      // 轻量重算当前句 & 高亮
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const segEnd = endFor(it);
        const within = t >= it.start && (segEnd ? t < segEnd : true);
        if (within) {
          if (idx !== i) { idx = i; segmentEnd = segEnd; highlight(i); }
          break;
        }
      }

      // 间歇写入断点
      if (now - _lastSavedAt > 2000) { _lastSavedAt = now; saveLastPos(); }
    });

    // 播放/暂停：清理调度，处理内部/外部 pause 区别
    audio.addEventListener('pause', () => {
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;
      if (!internalPause) saveLastPos(true);
      internalPause = false;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
    });
    audio.addEventListener('play', () => {
      setTimeout(() => scheduleAdvance(), 50);
      touchRecent();
      internalPause = false;
    });

    // 音频整体结束（兜底）
    audio.addEventListener('ended', () => {
      if (readMode === 'continuous' && autoContinueMode === 'auto') autoNextLesson();
    });

    // --------------------------
    // 相邻课程解析与跳转
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
      } catch (error) {
        console.error('Failed to get next lesson:', error);
        return null;
      }
    }

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
        setTimeout(() => { document.body.removeChild(notification); }, 300);
      }, 2000);
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
          } catch (_) { }
          window.location.href = `lesson.html#${book}/${nextLesson.filename}`;
        }, 2000);
      } else {
        showNotification('🎉 恭喜完成本册课程！');
      }
    }

    // 相邻课程按钮（上一课/下一课）
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
          if (prevLessonLink) prevLessonLink.style.display = 'none';
        }
        if (i >= 0 && i + 1 < lessons.length) {
          const next = lessons[i + 1].filename;
          nextLessonHref = `lesson.html#${book}/${next}`;
          if (nextLessonLink) { nextLessonLink.href = nextLessonHref; nextLessonLink.style.display = ''; }
        } else {
          if (nextLessonLink) nextLessonLink.style.display = 'none';
        }
      } catch (_) {
        if (prevLessonLink) prevLessonLink.style.display = 'none';
        if (nextLessonLink) nextLessonLink.style.display = 'none';
      }
    }

    // --------------------------
    // 启动：加载课文、恢复断点、初始化 UI
    // --------------------------
    // 该调用来自你工程中的 app.js / segmented 控件初始化
    if (window.NCE_APP && typeof NCE_APP.initSegmented === 'function') {
      try { NCE_APP.initSegmented(document); } catch(_) {}
    }

    resolveLessonNeighbors();

    // 若已知 duration，修正最后一句 end = duration
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
    audio.addEventListener('loadedmetadata', adjustLastEndIfPossible);

    loadLrc(lrc).then(({ meta, items: arr }) => {
      items = arr;
      titleEl.textContent = meta.ti || base;
      subEl.textContent = `${meta.al || book} · ${meta.ar || ''}`.trim();
      render();
      touchRecent();
      adjustLastEndIfPossible();

      // 从索引页/上一课带来的恢复
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
