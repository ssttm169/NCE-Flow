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
    const prevLessonLink = qs('#prevLesson');
    const nextLessonLink = qs('#nextLesson');
    // 新加控制音频播放速度
    const speedButton = qs('#speed')
    // 连读/点读开关
    const modeToggle = qs('#modeToggle');
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

    function reflectReadMode() {
      if (!modeToggle) return;
      const isContinuous = readMode === 'continuous';
      modeToggle.textContent = isContinuous ? '连读' : '点读';
      modeToggle.setAttribute('aria-pressed', isContinuous ? 'true' : 'false');
      modeToggle.dataset.mode = readMode;
    }

    function setReadMode(mode) {
      readMode = mode === 'single' ? 'single' : 'continuous';
      try { localStorage.setItem(MODE_KEY, readMode); } catch (_) { }
      reflectReadMode();
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

    if (followToggle) {
      reflectFollowMode();
      followToggle.addEventListener('click', () => {
        setFollowMode(!autoFollow);
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

    let isScheduling = false; // 防止重复调度
    let scheduleTime = 0; // 记录调度时间点
    function scheduleAdvance() {
      if (isScheduling) return; // 防止重复调度
      clearAdvance();
      if (audio.paused) return; // 不在播放时不安排下一步
      if (segmentEnd && idx >= 0) {
        const rate = Math.max(0.0001, audio.playbackRate || 1);
        const currentTime = audio.currentTime;
        const ms = Math.max(0, (segmentEnd - currentTime) * 1000 / rate);

        // 防止过短的定时器或重复调度
        if (ms < 50 || ms > 30000) return;

        // 检查是否已经调度过这个时间点
        if (Math.abs(scheduleTime - segmentEnd) < 0.1) return;

        scheduleTime = segmentEnd;
        isScheduling = true;
        segmentTimer = setTimeout(() => {
          isScheduling = false;
          scheduleTime = 0;

          // 检查当前是否仍在预期的播放范围内
          const currentIdx = idx;
          const currentSegmentEnd = segmentEnd;
          const actualCurrentTime = audio.currentTime;

          // 如果已经播放到下一个句子了，不要重复播放
          if (actualCurrentTime >= currentSegmentEnd - 0.2) {
            if (readMode === 'continuous') {
              if (currentIdx + 1 < items.length) {
                playSegment(currentIdx + 1);
              } else {
                audio.pause();
              }
            } else {
              audio.pause();
            }
          }
        }, ms);
      }
    }

    // 进度跳转时，重置自动前进/暂停的计时
    audio.addEventListener('seeked', () => {
      scheduleAdvance();
    });

    function playSegment(i) {
      if (i < 0 || i >= items.length) return;
      // 防止重复播放同一句子
      if (idx === i && !audio.paused) return;

      // 清除之前的调度
      clearAdvance();
      isScheduling = false;
      scheduleTime = 0;

      idx = i;
      const it = items[i];
      audio.currentTime = Math.max(0, it.start);
      segmentEnd = computeEnd(it);
      const p = audio.play();
      if (p && p.catch) { p.catch(() => { }); }
      highlight(i);

      // 使用 requestAnimationFrame 确保 DOM 更新完成后再调度
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduleAdvance();
        });
      });
    }

    function highlight(i) {
      const prev = listEl.querySelector('.sentence.active');
      if (prev) prev.classList.remove('active');
      const cur = listEl.querySelector(`.sentence[data-idx="${i}"]`);
      if (cur) {
        cur.classList.add('active');
        // 只有在自动跟随开启时才滚动到当前位置
        if (autoFollow) {
          cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    listEl.addEventListener('click', e => {
      const s = e.target.closest('.sentence'); if (!s) return;
      playSegment(parseInt(s.dataset.idx, 10));
    });

    let lastUpdateTime = 0;
    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      const now = performance.now();

      // 节流 timeupdate 处理，避免频繁触发
      if (now - lastUpdateTime < 200) return;
      lastUpdateTime = now;

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
      saveLastPos(true);
    });
    audio.addEventListener('play', () => {
      // 延迟调度，避免与 timeupdate 冲突
      setTimeout(() => scheduleAdvance(), 50);
      // update recents timestamp upon play interaction
      touchRecent();
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

    loadLrc(lrc).then(({ meta, items: arr }) => {
      items = arr;
      titleEl.textContent = meta.ti || base;
      subEl.textContent = `${meta.al || book} · ${meta.ar || ''}`.trim();
      render();
      // Autoplay parameter is ignored by default; user taps to play
      // mark as visited in recents
      touchRecent();

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
            highlight(targetIdx);
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
