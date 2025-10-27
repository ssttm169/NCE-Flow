/**
 * NCE Flow · lesson.js · iOS-Optimized Edition
 */

(() => {
  // --------------------------
  // 工具 & 解析
  // --------------------------
  const LINE_RE = /^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$/;
  const TIME_RE = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  const META_RE = /^\[(al|ar|ti|by):(.+)\]$/i;

  // --------------------------
  // 文字匹配功能
  // --------------------------
  function matchText(originalText, inputText) {
    if (!originalText || !inputText) {
      return {
        highlightedText: originalText || '',
        matchScore: 0
      };
    }

    // 移除标点符号进行匹配比较
    const removePunctuation = (text) => text.replace(/[^\w\s]/g, '').toLowerCase();
    const originalClean = removePunctuation(originalText);
    const inputClean = removePunctuation(inputText);

    if (originalClean === inputClean) {
      return {
        highlightedText: originalText,
        matchScore: 100
      };
    }

    const originalWords = originalText.split(/\s+/);
    const inputWords = inputText.split(/\s+/);
    const originalWordsClean = originalClean.split(/\s+/);
    const inputWordsClean = inputClean.split(/\s+/);

    let matchedWords = new Set();
    let exactWordMatches = 0;

    // 计算精确单词匹配（忽略标点符号）
    for (let i = 0; i < inputWordsClean.length; i++) {
      const inputWord = inputWordsClean[i];
      for (let j = 0; j < originalWordsClean.length; j++) {
        if (originalWordsClean[j] === inputWord) {
          matchedWords.add(j);
          exactWordMatches++;
          break;
        }
      }
    }

    // 计算字符级别的相似度（使用清理后的文本）
    const charSimilarity = calculateCharSimilarity(originalClean, inputClean);

    // 计算综合匹配度
    const wordMatchRatio = exactWordMatches / Math.max(originalWords.length, inputWords.length);
    const lengthRatio = 1 - Math.abs(originalClean.length - inputClean.length) / Math.max(originalClean.length, inputClean.length);
    const matchScore = Math.round(
      (wordMatchRatio * 0.6 + charSimilarity * 0.3 + lengthRatio * 0.1) * 100
    );

    // 生成高亮文本
    const highlightedText = generateHighlightedText(originalWords, matchedWords);

    return {
      highlightedText,
      matchScore: Math.min(100, Math.max(0, matchScore))
    };
  }

  function calculateCharSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  function levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  function generateHighlightedText(originalWords, matchedWords) {
    return originalWords.map((word, index) => {
      if (!matchedWords.has(index)) {
        return `<span style="color:red;font-weight:bold;">${word}</span>`;
      }
      return word;
    }).join(' ');
  }

  // 显示匹配结果
  function showMatchResult(matchResult, transcript) {
    // 创建或更新匹配结果显示区域
    let matchDisplay = document.getElementById('matchDisplay');
    if (!matchDisplay) {
      matchDisplay = document.createElement('div');
      matchDisplay.id = 'matchDisplay';
      matchDisplay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 15px;
        box-shadow: var(--shadow);
        z-index: 1000;
        max-width: 300px;
        backdrop-filter: saturate(120%) blur(10px);
      `;
      document.body.appendChild(matchDisplay);
    }

    const scoreColor = matchResult.matchScore >= 80 ? '#28a745' :
      matchResult.matchScore >= 60 ? '#ffc107' : '#dc3545';

    matchDisplay.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: ${scoreColor};">
        匹配度: ${matchResult.matchScore}%
      </div>
      <div style="margin-bottom: 8px;">
        <strong>你说:</strong> ${transcript}
      </div>
      <div>
        <strong>原文:</strong> <span style="font-size: 14px;">${matchResult.highlightedText}</span>
      </div>
    `;

    // 3秒后自动隐藏
    setTimeout(() => {
      if (matchDisplay && matchDisplay.parentNode) {
        matchDisplay.style.opacity = '0';
        setTimeout(() => {
          if (matchDisplay && matchDisplay.parentNode) {
            matchDisplay.parentNode.removeChild(matchDisplay);
          }
        }, 300);
      }
    }, 15000);
  }

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

  const isMobile = navigator.userAgent.match(/(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i);

  // --------------------------
  // 主流程
  // --------------------------
  document.addEventListener('DOMContentLoaded', () => {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (_) { }
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
    const startListeningButton = qs('#startListeningButton');
    const stopListeningButton = qs('#stopListeningButton');
    const recordingControl = qs('#recording');
    const hiddenTextButton = qs('#hiddenTextButton');
    const showTextButton = qs('#showTextButton');
    
    let selectedSentence = null;
    let isHiddenText = false;

    let ws;
    let micStream;
    let wsReady = false;
    let audioContext = null;
    let processor = null;
    let matchTimer = null;
    let currentRecordingIndex = 0;

    // 本地存储键
    const RECENT_KEY = 'nce_recents';
    const LASTPOS_KEY = 'nce_lastpos';
    const MODE_KEY = 'readMode';
    const FOLLOW_KEY = 'autoFollow';
    const AUTO_CONTINUE_KEY = 'autoContinue';
    const LOOP_MODE_KEY = 'loopMode';

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
    let loopReplayPending = false;  // 标记是否正在等待循环重播

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

    // 读取模式/跟随/续播/循环
    let readMode = (localStorage.getItem(MODE_KEY) === 'single') ? 'single' : 'continuous';
    let autoFollow = (localStorage.getItem(FOLLOW_KEY) === 'false') ? false : true;
    let autoContinueMode = (localStorage.getItem(AUTO_CONTINUE_KEY) === 'auto') ? 'auto' : 'single';
    let loopMode = localStorage.getItem(LOOP_MODE_KEY) || 'none'; // 'none' | 'single' | 'all'

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
        setTimeout(() => { try { audio.pause(); } catch (_) { } audio.muted = false; }, 0);
      } catch (_) { iosUnlocked = false; }
    }
    if (isIOSLike) {
      const evs = ['pointerdown', 'touchstart', 'click'];
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
      const continuousRadio = document.getElementById('readModeContinuous');
      const singleRadio = document.getElementById('readModeSingle');
      if (continuousRadio && singleRadio) {
        continuousRadio.checked = isContinuous;
        singleRadio.checked = !isContinuous;
      }

      // 控制自动续播选项的启用/禁用状态
      const autoContinueCard = document.getElementById('autoContinueCard');
      const autoContinueAutoRadio = document.getElementById('autoContinueAuto');
      const autoContinueAutoLabel = document.querySelector('label[for="autoContinueAuto"]');

      if (!isContinuous) {
        // 点读模式：禁用"自动续播"选项，并强制选中"本课结束"
        if (autoContinueAutoRadio) {
          autoContinueAutoRadio.disabled = true;
        }
        if (autoContinueAutoLabel) {
          autoContinueAutoLabel.style.opacity = '0.5';
          autoContinueAutoLabel.style.cursor = 'not-allowed';
        }
        // 强制切换到"本课结束"
        if (autoContinueMode === 'auto') {
          setAutoContinueMode('single');
        }
      } else {
        // 连读模式：启用"自动续播"选项
        if (autoContinueAutoRadio) {
          autoContinueAutoRadio.disabled = false;
        }
        if (autoContinueAutoLabel) {
          autoContinueAutoLabel.style.opacity = '';
          autoContinueAutoLabel.style.cursor = '';
        }
      }

      // 控制循环模式选项的启用/禁用状态
      const loopSingleRadio = document.getElementById('loopSingle');
      const loopSingleLabel = document.querySelector('label[for="loopSingle"]');
      const loopAllRadio = document.getElementById('loopAll');
      const loopAllLabel = document.querySelector('label[for="loopAll"]');

      if (isContinuous) {
        // 连读模式：禁用"单句循环"，启用"整篇循环"
        if (loopSingleRadio) {
          loopSingleRadio.disabled = true;
        }
        if (loopSingleLabel) {
          loopSingleLabel.style.opacity = '0.5';
          loopSingleLabel.style.cursor = 'not-allowed';
        }
        if (loopAllRadio) {
          loopAllRadio.disabled = false;
        }
        if (loopAllLabel) {
          loopAllLabel.style.opacity = '';
          loopAllLabel.style.cursor = '';
        }
        // 如果当前是单句循环，自动切换到不循环
        if (loopMode === 'single') {
          setLoopMode('none');
        }
      } else {
        // 点读模式：启用"单句循环"，禁用"整篇循环"
        if (loopSingleRadio) {
          loopSingleRadio.disabled = false;
        }
        if (loopSingleLabel) {
          loopSingleLabel.style.opacity = '';
          loopSingleLabel.style.cursor = '';
        }
        if (loopAllRadio) {
          loopAllRadio.disabled = true;
        }
        if (loopAllLabel) {
          loopAllLabel.style.opacity = '0.5';
          loopAllLabel.style.cursor = 'not-allowed';
        }
        // 如果当前是整篇循环，自动切换到不循环
        if (loopMode === 'all') {
          setLoopMode('none');
        }
      }
    }
    function reflectFollowMode() {
      const followOnRadio = document.getElementById('followOn');
      const followOffRadio = document.getElementById('followOff');
      if (followOnRadio && followOffRadio) {
        followOnRadio.checked = autoFollow;
        followOffRadio.checked = !autoFollow;
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
    function reflectLoopMode() {
      const loopNoneRadio = document.getElementById('loopNone');
      const loopSingleRadio = document.getElementById('loopSingle');
      const loopAllRadio = document.getElementById('loopAll');
      if (loopNoneRadio && loopSingleRadio && loopAllRadio) {
        loopNoneRadio.checked = loopMode === 'none';
        loopSingleRadio.checked = loopMode === 'single';
        loopAllRadio.checked = loopMode === 'all';
      }
    }
    reflectReadMode(); reflectFollowMode(); reflectAutoContinueMode(); reflectLoopMode();

    function setReadMode(mode) {
      readMode = (mode === 'single') ? 'single' : 'continuous';
      setRecordingControl(readMode)
      try { localStorage.setItem(MODE_KEY, readMode); } catch (_) { }
      reflectReadMode();
      // 模式切换：清调度→按新模式刷新当前段末→重建调度
      clearAdvance(); isScheduling = false; scheduleTime = 0;
      if (idx >= 0 && idx < items.length) segmentEnd = endFor(items[idx]);
      scheduleAdvance();
    }
    function setFollowMode(follow) {
      autoFollow = !!follow;
      try { localStorage.setItem(FOLLOW_KEY, autoFollow.toString()); } catch (_) { }
      reflectFollowMode();
    }
    function setAutoContinueMode(mode) {
      autoContinueMode = (mode === 'auto') ? 'auto' : 'single';
      try { localStorage.setItem(AUTO_CONTINUE_KEY, autoContinueMode); } catch (_) { }
      reflectAutoContinueMode();
    }
    function setLoopMode(mode) {
      if (!['none', 'single', 'all'].includes(mode)) mode = 'none';
      loopMode = mode;
      try { localStorage.setItem(LOOP_MODE_KEY, loopMode); } catch (_) { }
      reflectLoopMode();
    }

    // 阅读模式单选按钮事件
    const readModeContinuous = document.getElementById('readModeContinuous');
    const readModeSingle = document.getElementById('readModeSingle');
    if (readModeContinuous) readModeContinuous.addEventListener('change', () => { if (readModeContinuous.checked) setReadMode('continuous'); });
    if (readModeSingle) readModeSingle.addEventListener('change', () => { if (readModeSingle.checked) setReadMode('single'); });

    // 自动跟随单选按钮事件
    const followOn = document.getElementById('followOn');
    const followOff = document.getElementById('followOff');
    if (followOn) followOn.addEventListener('change', () => { if (followOn.checked) setFollowMode(true); });
    if (followOff) followOff.addEventListener('change', () => { if (followOff.checked) setFollowMode(false); });

    // 自动续播单选按钮事件
    const singleRadio = document.getElementById('autoContinueSingle');
    const autoRadio = document.getElementById('autoContinueAuto');
    if (singleRadio) singleRadio.addEventListener('change', () => { if (singleRadio.checked) setAutoContinueMode('single'); });
    if (autoRadio) {
      autoRadio.addEventListener('change', () => { if (autoRadio.checked) setAutoContinueMode('auto'); });

      // 当禁用时点击，显示提示
      const autoLabel = document.querySelector('label[for="autoContinueAuto"]');
      if (autoLabel) {
        autoLabel.addEventListener('click', (e) => {
          if (autoRadio.disabled) {
            e.preventDefault();
            showNotification('自动续播仅在连读模式下可用');
          }
        });
      }
    }

    // 循环模式单选按钮事件
    const loopNoneRadio = document.getElementById('loopNone');
    const loopSingleRadio = document.getElementById('loopSingle');
    const loopAllRadio = document.getElementById('loopAll');
    if (loopNoneRadio) loopNoneRadio.addEventListener('change', () => { if (loopNoneRadio.checked) setLoopMode('none'); });
    if (loopSingleRadio) {
      loopSingleRadio.addEventListener('change', () => { if (loopSingleRadio.checked) setLoopMode('single'); });

      // 当禁用时点击，显示提示
      const loopSingleLabel = document.querySelector('label[for="loopSingle"]');
      if (loopSingleLabel) {
        loopSingleLabel.addEventListener('click', (e) => {
          if (loopSingleRadio.disabled) {
            e.preventDefault();
            showNotification('单句循环仅在点读模式下可用');
          }
        });
      }
    }
    if (loopAllRadio) {
      loopAllRadio.addEventListener('change', () => { if (loopAllRadio.checked) setLoopMode('all'); });

      // 当禁用时点击，显示提示
      const loopAllLabel = document.querySelector('label[for="loopAll"]');
      if (loopAllLabel) {
        loopAllLabel.addEventListener('click', (e) => {
          if (loopAllRadio.disabled) {
            e.preventDefault();
            showNotification('整篇循环仅在连读模式下可用');
          }
        });
      }
    }

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
      try { localStorage.setItem('audioPlaybackRate', r); } catch (_) { }
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
        location.href = fallback;
      });
    }

    // 设置面板（沿用你的结构）
    let _prevFocus = null; let _trapHandler = null;
    function getFocusable(root) {
      return root ? Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null) : [];
    }
    function enableTrap() {
      if (!settingsPanel) return;
      const fs = getFocusable(settingsPanel); if (fs.length) fs[0].focus();
      _trapHandler = (e) => {
        if (e.key !== 'Tab') return;
        const list = getFocusable(settingsPanel); if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
      };
      document.addEventListener('keydown', _trapHandler);
    }
    function disableTrap() { if (_trapHandler) { document.removeEventListener('keydown', _trapHandler); _trapHandler = null; } }
    function openSettings() {
      if (settingsOverlay) { settingsOverlay.hidden = false; requestAnimationFrame(() => settingsOverlay.classList.add('show')); }
      if (settingsPanel) { settingsPanel.hidden = false; requestAnimationFrame(() => settingsPanel.classList.add('show')); }
      try { _prevFocus = document.activeElement; } catch (_) { }
      try { document.body.style.overflow = 'hidden'; } catch (_) { }
      enableTrap();
    }
    function closeSettings() {
      disableTrap();
      if (settingsOverlay) { settingsOverlay.classList.remove('show'); setTimeout(() => settingsOverlay.hidden = true, 200); }
      if (settingsPanel) { settingsPanel.classList.remove('show'); setTimeout(() => settingsPanel.hidden = true, 200); }
      try { document.body.style.overflow = ''; } catch (_) { }
      try { if (_prevFocus && _prevFocus.focus) _prevFocus.focus(); } catch (_) { }
    }


    let transcript = '';
    let recognitionRef = null;
    let isListening = false;;

    async function pcReccording(){
      await ensureMicPrewarmed(); // 第一次点击自动预热

      if (!recognitionRef) recognitionRef = createRecognition();
      console.log('startListening', recognitionRef)

      transcript = ''
      if (recognitionRef && !isListening) {
        startListeningButton.style.display = 'none';
        stopListeningButton.style.display = '';

        try {
          recognitionRef.start();
        } catch (error) {
          startListeningButton.style.display = '';
          stopListeningButton.style.display = 'none';
          console.error('启动识别失败:', error)
        }
      }
    }


    async function initWebSocket() {
      return new Promise((resolve, reject) => {
        if (ws) return resolve(ws); // 已初始化

        // ws = new WebSocket("ws://localhost:8080");
        // ws = new WebSocket("ws://198.20.133.17:8080");
        // ws = new WebSocket("ws://198.20.133.17:2052");
        ws = new WebSocket("wss://stt.chicklish.app");
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          wsReady = true;
          // output.innerText = "✅ Connected to server.";
          resolve(ws);
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log('data',data)
          if (data.text) {
            transcript = data.text;
            // output.innerText = "🗣️ Final: " + data.text;
          } else if (data.partial) {
            transcript =  data.partial;
            // output.innerText = "Listening: " + data.partial;
          }
          clearTimeout(matchTimer)
          matchTimer = setTimeout(finalMatchMessage, 1000)

        };

        ws.onclose = () => {
          wsReady = false;
          // output.innerText = "🔴 Disconnected from server.";
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          reject(err);
        };
      });
    }


    async function wsRecording () {
      startListeningButton.style.display = 'none';
      stopListeningButton.style.display = '';


      // 初始化 WebSocket（只会执行一次）
      await initWebSocket();

      // 打开麦克风
      if (!micStream) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(micStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
          if (!wsReady) return;
          const input = e.inputBuffer.getChannelData(0);
          const buffer = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) buffer[i] = input[i] * 0x7FFF;
          ws.send(buffer);
        };
      }

      // output.innerText = "🎤 Connecting...";

      // ws = new WebSocket("ws://198.20.133.17:8080");
      // ws = new WebSocket("wss://stt.chicklish.app");
      // ws.binaryType = "arraybuffer";

      // ws.onopen = async () => {
      //   // output.innerText = "✅ Connected. Start speaking...";
      //   micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      //   audioContext = new AudioContext({ sampleRate: 16000 });
      //   const source = audioContext.createMediaStreamSource(micStream);
      //   processor = audioContext.createScriptProcessor(4096, 1, 1);
      //   source.connect(processor);
      //   processor.connect(audioContext.destination);

      //   processor.onaudioprocess = (e) => {
      //     const input = e.inputBuffer.getChannelData(0);
      //     const buffer = new Int16Array(input.length);
      //     for (let i = 0; i < input.length; i++) buffer[i] = input[i] * 0x7FFF;
      //     if (ws.readyState === WebSocket.OPEN) ws.send(buffer);
      //   };
      //   isListening = true;

      // };

      // ws.onmessage = (event) => {
      //   const data = JSON.parse(event.data);
      //   console.log('data',data)
      //   if (data.text) {
      //     transcript = data.text;
      //       // console.log('data.text',data.text)
      //     // output.innerText = "🗣️ Final: " + data.text;
      //   } else if (data.partial) {
      //     transcript =  data.partial;
      //     // output.innerText = "Listening: " + data.partial;
      //   }
      // };

      // ws.onclose = () => {
      //   isListening = false;
      //   // output.innerText = "🔴 Disconnected.";
      //     // 与当前句子进行匹配
      //     if (idx >= 0 && idx < items.length) {
      //       const currentSentence = items[idx].en;
      //       console.log('transcript',transcript)
      //       const matchResult = matchText(currentSentence, transcript);

      //       // 显示匹配结果
      //       // showMatchResult(matchResult, transcript);
      //       if(matchResult && selectedSentence) 
      //         selectedSentence.querySelector(".score").innerHTML = matchResult.matchScore + '分'
      //     }
      // };
    };

    function stopWsRecording( ) {

      if (processor) processor.disconnect();
      if (audioContext) audioContext.close();
      if (micStream) micStream.getTracks().forEach(track => track.stop());

      processor = null;
      audioContext = null;
      micStream = null;
      // output.innerText = "🛑 Stopped recording.";

    }

    function finalMatchMessage(){
      if(!transcript) return;
      let currentS
      if (currentRecordingIndex >= 0 && currentRecordingIndex < items.length) {

        const currentSentence = items[currentRecordingIndex].en;
        const matchResult = matchText(currentSentence, transcript);
        currentS = listEl.querySelector(`.sentence[data-idx="${currentRecordingIndex}"]`);

        // 显示匹配结果
        // showMatchResult(matchResult, transcript);
        if(matchResult && currentS) 
          currentS.querySelector(".score").innerHTML = matchResult.matchScore + '分'
      }
    }


    async function startListening() {
      currentRecordingIndex = idx
      console.log('currentRecordingIndex.startListening=',idx )
      if(isMobile){
        wsRecording()
      }else{
        pcReccording()
      }
    }


    // 停止语音识别
    function stopListening(isMatchMessage = true ) {
      startListeningButton.style.display = '';
      stopListeningButton.style.display = 'none';
      console.log('stopListening...', isListening, recognitionRef)

      if(isMobile){
        stopWsRecording()
        if(isMatchMessage){
          clearTimeout(matchTimer)
          matchTimer = setTimeout(finalMatchMessage, 1000)
        }
      }else{
        if (recognitionRef && isListening) recognitionRef.stop()
      }
    }

    function onHiddenTextEvent(){
      document.body.classList.remove('retell');
      document.body.classList.add('retell');
      isHiddenText = true;
      showTextButton.style.display = '';
      hiddenTextButton.style.display = 'none';
      
    }

    function onShowTextButton(){
      document.body.classList.remove('retell');
      isHiddenText = false;
      showTextButton.style.display = 'none';
      hiddenTextButton.style.display = '';
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);
    if (settingsClose) settingsClose.addEventListener('click', closeSettings);
    if (settingsDone) settingsDone.addEventListener('click', closeSettings);

    if (startListeningButton) startListeningButton.addEventListener('click', startListening);
    if (stopListeningButton) stopListeningButton.addEventListener('click', stopListening);
    if (hiddenTextButton) hiddenTextButton.addEventListener('click', onHiddenTextEvent);
    if (showTextButton) showTextButton.addEventListener('click', onShowTextButton);

    

    // 快捷键帮助面板
    const shortcutsBtn = qs('#shortcutsToggle');
    const shortcutsOverlay = qs('#shortcutsOverlay');
    const shortcutsPanel = qs('#shortcutsPanel');
    const shortcutsClose = qs('#shortcutsClose');
    const shortcutsDone = qs('#shortcutsDone');

    function openShortcuts() {
      // 先立即关闭设置面板,避免两个面板叠加显示
      if (settingsPanel && !settingsPanel.hidden) {
        disableTrap();
        if (settingsOverlay) { settingsOverlay.classList.remove('show'); settingsOverlay.hidden = true; }
        if (settingsPanel) { settingsPanel.classList.remove('show'); settingsPanel.hidden = true; }
        try { document.body.style.overflow = ''; } catch (_) { }
      }
      if (shortcutsOverlay) { shortcutsOverlay.hidden = false; requestAnimationFrame(() => shortcutsOverlay.classList.add('show')); }
      if (shortcutsPanel) { shortcutsPanel.hidden = false; requestAnimationFrame(() => shortcutsPanel.classList.add('show')); }
      try { _prevFocus = document.activeElement; } catch (_) { }
      try { document.body.style.overflow = 'hidden'; } catch (_) { }
    }
    function closeShortcuts() {
      if (shortcutsOverlay) { shortcutsOverlay.classList.remove('show'); setTimeout(() => shortcutsOverlay.hidden = true, 200); }
      if (shortcutsPanel) { shortcutsPanel.classList.remove('show'); setTimeout(() => shortcutsPanel.hidden = true, 200); }
      try { document.body.style.overflow = ''; } catch (_) { }
      try { if (_prevFocus && _prevFocus.focus) _prevFocus.focus(); } catch (_) { }
    }
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', openShortcuts);
    if (shortcutsOverlay) shortcutsOverlay.addEventListener('click', closeShortcuts);
    if (shortcutsClose) shortcutsClose.addEventListener('click', closeShortcuts);
    if (shortcutsDone) shortcutsDone.addEventListener('click', closeShortcuts);

    // 快捷键面板"返回设置"按钮
    const shortcutsBack = qs('#shortcutsBack');
    if (shortcutsBack) {
      shortcutsBack.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 立即关闭快捷键面板
        if (shortcutsOverlay) { shortcutsOverlay.classList.remove('show'); shortcutsOverlay.hidden = true; }
        if (shortcutsPanel) { shortcutsPanel.classList.remove('show'); shortcutsPanel.hidden = true; }
        try { document.body.style.overflow = ''; } catch (_) { }
        // 立即打开设置面板
        openSettings();
      });
    }

    // Escape 键处理：优先关闭快捷键面板，然后关闭设置面板
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (shortcutsPanel && !shortcutsPanel.hidden) {
          closeShortcuts();
        } else {
          closeSettings();
        }
      }
    });

    // --------------------------
    // 全局快捷键
    // --------------------------
    // 音量提示UI
    let volumeToastTimer = 0;
    function showVolumeToast(volume) {
      const percentage = Math.round(volume * 100);
      let toast = document.getElementById('volumeToast');

      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'volumeToast';
        toast.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px 30px;
          box-shadow: var(--shadow);
          z-index: 2000;
          backdrop-filter: saturate(120%) blur(10px);
          font-size: 18px;
          font-weight: 500;
          min-width: 120px;
          text-align: center;
          opacity: 0;
          transition: opacity 0.2s ease;
        `;
        document.body.appendChild(toast);
      }

      toast.textContent = `音量 ${percentage}%`;
      toast.style.opacity = '1';

      if (volumeToastTimer) clearTimeout(volumeToastTimer);
      volumeToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
      }, 1000);
    }

    document.addEventListener('keydown', (e) => {
      // 避免在输入框中触发快捷键
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // ? 键 - 打开/关闭快捷键帮助
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        if (shortcutsPanel && !shortcutsPanel.hidden) {
          closeShortcuts();
        } else {
          openShortcuts();
        }
        return;
      }

      // ArrowUp - 音量增加（优先处理，避免和其他按键冲突）
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newVolume = Math.min(1, audio.volume + 0.1);
        audio.volume = newVolume;
        try { localStorage.setItem('nce_volume', newVolume); } catch (_) { }
        showVolumeToast(newVolume);
        return;
      }

      // ArrowDown - 音量减少（优先处理，避免和其他按键冲突）
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newVolume = Math.max(0, audio.volume - 0.1);
        audio.volume = newVolume;
        try { localStorage.setItem('nce_volume', newVolume); } catch (_) { }
        showVolumeToast(newVolume);
        return;
      }

      // Space - 播放/暂停
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (audio.paused) {
          // 点读模式下的智能跳转：如果当前在句末（说明是自动暂停的），跳到下一句
          if (readMode === 'single' && idx >= 0 && segmentEnd > 0) {
            const currentTime = audio.currentTime;
            const tolerance = 0.1; // 容错范围 100ms
            // 判断是否在当前句末尾（自动暂停的位置）
            if (Math.abs(currentTime - segmentEnd) < tolerance) {
              // 在句末，跳到下一句
              const nextIdx = Math.min(idx + 1, items.length - 1);
              if (nextIdx < items.length && nextIdx !== idx) {
                playSegment(nextIdx, { manual: true });
                return;
              }
              // 如果已经是最后一句，则重播当前句
              playSegment(idx, { manual: true });
              return;
            }
          }

          // 其他情况：正常播放
          if (idx < 0 && items.length > 0) {
            // 如果没有选中任何句子，从第一句开始
            playSegment(0, { manual: true });
          } else {
            const p = audio.play();
            if (p && p.catch) p.catch(() => { });
          }
        } else {
          audio.pause();
        }
        return;
      }

      // ArrowRight 或 D - 下一句
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, items.length - 1);
        if (nextIdx < items.length) {
          playSegment(nextIdx, { manual: true });
        }
        return;
      }

      // ArrowLeft 或 A - 上一句
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        const prevIdx = idx < 0 ? 0 : Math.max(idx - 1, 0);
        if (prevIdx >= 0) {
          playSegment(prevIdx, { manual: true });
        }
        return;
      }

      // R - 重播当前句
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (idx >= 0 && idx < items.length) {
          playSegment(idx, { manual: true });
        } else if (items.length > 0) {
          // 如果没有当前句，播放第一句
          playSegment(0, { manual: true });
        }
        return;
      }
    });

    const settingsReset = qs('#settingsReset');
    if (settingsReset) {
      settingsReset.addEventListener('click', () => {
        try { localStorage.setItem('audioPlaybackRate', DEFAULT_RATE); } catch (_) { }
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
          <div class="score"></div>
        </div>
      `).join('');
      qs('#sentences').innerHTML = html;
    }

    function computeEnd(it) {
      const fallback = 0.2; // 连读最小时长
      if (it.end && it.end > it.start) return it.end;
      return Math.max(0, (it.start || 0) + fallback);
    }
    // 单句模式提前量，参考老版本：提前 0.5s 结束，避免读到下一句的前缀
    const SINGLE_CUTOFF = 0.5;
    const MIN_SEG_DUR = 0.2;
    function endFor(it) {
      if (readMode === 'single') {
        // 取下一句开始时间作为结束基准，并减去提前量
        let baseEnd = 0;
        if (it.end && it.end > it.start) baseEnd = it.end;
        else {
          const i = items ? items.indexOf(it) : -1;
          if (i >= 0 && i + 1 < items.length) baseEnd = items[i + 1].start || 0;
        }
        // 计算单句的目标结束时间：基准-提前量，且不小于最小时长
        if (baseEnd > 0) {
          const e = Math.max(it.start + MIN_SEG_DUR, baseEnd - SINGLE_CUTOFF);
          return e;
        }
        // 无可用基准：给一个保守默认值
        return it.start + 0.5;
      }
      return computeEnd(it);
    }

    // --------------------------
    // 调度：远端定时 + 近端 rAF
    // --------------------------
    function clearAdvance() {
      if (segmentTimer) { clearTimeout(segmentTimer); segmentTimer = 0; }
      if (segmentRaf) { cancelAnimationFrame(segmentRaf); segmentRaf = 0; }
    }
    function guardAheadSec() {
      const r = Math.max(0.5, Math.min(3, audio.playbackRate || 1));
      // iOS 略保守：基础 80ms，倍速升高再加裕度，上限约 120ms
      const base = isIOSLike ? 0.08 : 0.06;
      const slope = isIOSLike ? 0.03 : 0.02;
      return base + (r - 1) * slope;
    }
    const NEAR_WINDOW_MS = isIOSLike ? 160 : 120;
    const MAX_CHUNK_MS = 10000;

    function scheduleAdvance() {
      clearAdvance(); isScheduling = false; scheduleTime = 0;
      if (audio.paused) return;
      // 连读模式下不做逐句调度，避免 iOS 在边界 seek 造成的卡顿
      if (readMode === 'continuous') return;
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

            // 点读：暂停在段末
            console.log('[循环调试] scheduleAdvance到达段末，暂停播放', {
              idx,
              loopMode,
              loopReplayPending,
              currentTime: audio.currentTime,
              segmentEnd: endSnap
            });
            audio.pause();
            audio.currentTime = endSnap;

            // 单句循环：标记循环等待，稍后重播
            if (loopMode === 'single' && idx >= 0 && idx < items.length && !loopReplayPending) {
              console.log('[循环调试] 设置单句循环重播，300ms后执行');
              loopReplayPending = true;
              setTimeout(() => {
                console.log('[循环调试] 300ms后检查循环条件', {
                  loopReplayPending,
                  loopMode,
                  idx
                });
                if (loopReplayPending && loopMode === 'single') {
                  loopReplayPending = false;
                  console.log('[循环调试] 开始执行循环重播 playSegment');
                  playSegment(idx, { manual: false });
                } else {
                  console.log('[循环调试] 循环条件不满足，取消重播');
                }
              }, 300);
            } else {
              console.log('[循环调试] 不满足循环条件，不设置重播', {
                loopMode,
                loopReplayPending,
                idx
              });
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
        try { audio.fastSeek(t); } catch (_) { audio.currentTime = t; }
      } else {
        audio.currentTime = t;
      }
    }

    async function playSegment(i, opts) {
      const manual = !!(opts && opts.manual);
      console.log('[循环调试] playSegment调用', {
        idx: i,
        manual,
        currentIdx: idx,
        loopReplayPending,
        paused: audio.paused
      });

      if (i < 0 || i >= items.length) return;

      // 手动操作时清除循环等待标志
      if (manual && loopReplayPending) {
        console.log('[循环调试] 手动操作，清除循环等待标志');
        loopReplayPending = false;
      }

      // 自动流程：同句且已在播不重复
      if (!manual && idx === i && !audio.paused) {
        console.log('[循环调试] 自动流程跳过：同句且正在播放');
        return;
      }

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
      // 自动前进且"新起点过近"时，给极小前移，避免抖动
      // 但循环重播(同句)时不应用此逻辑，必须回到真实起点
      const isLoopReplay = (!manual && idx === i);
      if (!manual && !isLoopReplay && start <= cur + 0.005) {
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
        try { internalPause = true; audio.pause(); } catch (_) { }
        const resume = () => {
          audio.removeEventListener('seeked', resume);
          const p = audio.play(); if (p && p.catch) p.catch(() => { });
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
    function scheduleScrollTo(el, manual) {
      if (!el) return;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
      if (!autoFollow) return;
      if (manual) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { } return; }
      scrollTimer = setTimeout(() => { try { el.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (_) { } }, 420);
    }
    function highlight(i, manual = false) {
      const prev = listEl.querySelector('.sentence.active'); if (prev) prev.classList.remove('active');
      const cur = listEl.querySelector(`.sentence[data-idx="${i}"]`);
      if (cur) { 
        cur.classList.add('active'); scheduleScrollTo(cur, manual);  selectedSentence = cur;
      }else{
        selectedSentence = null;
      }
    }
    listEl.addEventListener('click', e => {
      const s = e.target.closest('.sentence'); if (!s) return;
      // 确保“首次点句”也能触发 iOS 解锁
      if (isIOSLike && !iosUnlocked) unlockAudioSync();
    
      
      stopListening(false);

      playSegment(parseInt(s.dataset.idx, 10), { manual: true });
    });

    // --------------------------
    // 轻量 timeupdate：优先做点读安全停止，其次做高亮/存档
    // --------------------------
    let lastUpdateTime = 0;
    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      // 点读模式安全网：如果 scheduleAdvance 失效，这里兜底暂停
      // （单句循环逻辑已移到 scheduleAdvance 中处理）
      if (readMode === 'single' && segmentEnd && t >= segmentEnd && !audio.paused) {
        audio.pause();
        audio.currentTime = segmentEnd;
        // 直接返回，避免本次循环内再做额外计算
        return;
      }

      const now = performance.now();
      if (now - lastUpdateTime < 200) return;
      lastUpdateTime = now;

      // 段首 350ms 内避免重活，降低抖动（不影响上面的点读安全停止）
      if (segmentStartWallclock && now - segmentStartWallclock < 350) return;

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
      console.log('[循环调试] audio.pause事件触发', {
        internalPause,
        loopReplayPending,
        idx,
        currentTime: audio.currentTime
      });
      clearAdvance(); isScheduling = false; scheduleTime = 0;
      if (!internalPause) saveLastPos(true);
      internalPause = false;
      if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = 0; }
    });
    audio.addEventListener('play', () => {
      console.log('[循环调试] audio.play事件触发', {
        idx,
        loopReplayPending,
        currentTime: audio.currentTime
      });
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
      // 整篇循环：从第一句重新开始
      if (readMode === 'continuous' && loopMode === 'all' && items.length > 0) {
        setTimeout(() => {
          playSegment(0, { manual: true });
        }, 100);
        return;
      }

      // 自动续播下一课（仅在未开启整篇循环时）
      if (readMode === 'continuous' && autoContinueMode === 'auto' && loopMode !== 'all') {
        autoNextLesson();
      }
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
      setTimeout(() => { n.style.animation = 'slideUp 0.3s ease-out'; setTimeout(() => { document.body.removeChild(n); }, 300); }, 2000);
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
    // 恢复保存的音量
    try {
      const savedVolume = parseFloat(localStorage.getItem('nce_volume'));
      if (!isNaN(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
        audio.volume = savedVolume;
      }
    } catch (_) { }

    // 重要：iOS 上尽早设定 preload，有助于更快拿到 metadata
    try { audio.preload = 'auto'; } catch (_) { }
    audio.src = mp3;
    try { audio.load(); } catch (_) { }

    if (window.NCE_APP && typeof NCE_APP.initSegmented === 'function') {
      try { NCE_APP.initSegmented(document); } catch (_) { }
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

    function lessonId() { return `${book}/${base}`; }
    function touchRecent() {
      try {
        const id = lessonId(); const now = Date.now();
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        const rest = raw.filter(x => x && x.id !== id);
        const next = [{ id, ts: now }, ...rest].slice(0, 60);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch (_) { }
    }
    function saveLastPos() {
      try {
        const id = lessonId(); const now = Date.now();
        const map = JSON.parse(localStorage.getItem(LASTPOS_KEY) || '{}');
        map[id] = { t: Math.max(0, audio.currentTime || 0), idx: Math.max(0, idx | 0), ts: now };
        localStorage.setItem(LASTPOS_KEY, JSON.stringify(map));
      } catch (_) { }
    }

    async function ensureMicPrewarmed() {
      stopListeningButton.style.display = 'none';

      if (micStream) return;
      try {
        // statusEl.textContent = '正在预热麦克风...';
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 创建静音 AudioContext 保持活跃
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(micStream);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(ctx.destination);
        micStream._ctx = ctx;
        // statusEl.textContent = '麦克风已预热。';
      } catch (err) {
        // statusEl.textContent = '麦克风预热失败：' + err.message;
        console.error(err);
      }
    }

    function createRecognition() {
      const r = new SpeechRecognition();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = true;

      r.onstart = () => {
        isListening = true;
        // statusEl.textContent = '状态：识别中...';
        // startBtn.disabled = true;
        // stopBtn.disabled = false;
        // interimEl.textContent = '';
      };
      r.onend = () => {
        isListening = false;
        // statusEl.textContent = '状态：已停止';
        // startBtn.disabled = false;
        // stopBtn.disabled = true;
        // interimEl.textContent = '';
      };
      r.onerror = (e) => {
        isListening = false;
        // statusEl.textContent = `错误：${e.error}`;
        console.error(e);
      };
      r.onresult = (e) => {
        let interim = '';
        let finalTranscript = ''

        for (let i = e.resultIndex; i < e.results.length; ++i) {
          const res = e.results[i];
          const text = res[0].transcript.trim();
          if (res.isFinal) {
            finalTranscript += text
          }
        }

        if (finalTranscript) {
          transcript = transcript ? transcript + " " + finalTranscript : finalTranscript;

          // 与当前句子进行匹配
          if (idx >= 0 && idx < items.length) {
            const currentSentence = items[idx].en;
            const matchResult = matchText(currentSentence, transcript);

            // 显示匹配结果
            // showMatchResult(matchResult, transcript);
            if(matchResult && selectedSentence) 
              selectedSentence.querySelector(".score").innerHTML = matchResult.matchScore + '分'

          }

          // interimEl.textContent = transcript;
        }
      };
      return r;
    }

    loadLrc(lrc).then(({ meta, items: arr }) => {
      items = arr;
      titleEl.textContent = meta.ti || base;
      subEl.textContent = `${meta.al || book} · ${meta.ar || ''}`.trim();
      render();
      touchRecent();
      adjustLastEndIfPossible();

      // 从上一课或首页跳转来的自动恢复
      try {
        const resumeId = sessionStorage.getItem('nce_resume');
        if (resumeId && resumeId === lessonId()) {
          const map = JSON.parse(localStorage.getItem(LASTPOS_KEY) || '{}');
          const pos = map[resumeId];
          if (pos) {
            const targetIdx = (Number.isInteger(pos.idx) && pos.idx >= 0 && pos.idx < items.length) ? pos.idx : 0;
            audio.currentTime = Math.max(0, pos.t || 0);
            idx = targetIdx; segmentEnd = endFor(items[targetIdx]);
            highlight(targetIdx, false);
            if (sessionStorage.getItem('nce_resume_play') === '1') {
              const p = audio.play(); if (p && p.catch) p.catch(() => { });
              scheduleAdvance();
            }
          }
        }
      } catch (_) { }
      sessionStorage.removeItem('nce_resume');
      sessionStorage.removeItem('nce_resume_play');

    }).catch(err => {
      titleEl.textContent = '无法加载课文';
      subEl.textContent = String(err);
    });

    // ensureMicPrewarmed()
    // console.log('readMode',readMode)

    function setRecordingControl(mode){
      if(mode === 'single'){
        recordingControl.style.display = '';
        // document.body.classList.remove('resell'); 
        // document.body.classList.add('resell');
      }else{
        recordingControl.style.display = 'none';
        // document.body.classList.remove('resell'); 
      }
    }
    
    setRecordingControl(readMode)

    stopListeningButton.style.display = 'none';
    showTextButton.style.display = 'none';

    
    window.addEventListener('beforeunload', () => { 
      saveLastPos();
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
     });
    window.addEventListener('hashchange', () => { window.scrollTo(0, 0); location.reload(); });
  });
})();
