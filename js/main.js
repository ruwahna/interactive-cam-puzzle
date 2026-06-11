/**
 * main.js
 * App entry point dan controller utama.
 */

const Main = (() => {

  const video   = document.getElementById('bg-video');
  const flashEl = document.getElementById('flash');
  const cntEl   = document.getElementById('countdown');
  const grEl    = document.getElementById('getready');
  const gpEl    = document.getElementById('gesture-progress');
  const polEl   = document.getElementById('polaroid');
  const badgeEl = document.getElementById('badge');
  const hintEl  = document.getElementById('hint');
  const ctrlEl  = document.getElementById('controls');
  const cur1    = document.getElementById('pc1');
  const cur2    = document.getElementById('pc2');
  const threeC  = document.getElementById('three-canvas');
  const statusEl= document.getElementById('status');
  const modeEl  = document.getElementById('input-mode');
  const noCamBtn = document.getElementById('start-nocam');
  const viewfinderEl = document.getElementById('viewfinder');

  let phase = 'idle';
  let mouseDrag = null;
  let handTrackingReady = false;
  let handTrackingInitStarted = false;
  let countdownTimer = null;
  let usePlaceholderCapture = false;
  let customVfRect = null;

  const startScreenEl = document.getElementById('start-screen');
  const mpStatusEl = document.getElementById('mp-status');

  // Paksa start screen tetap tampil saat awal load.
  if (startScreenEl) {
    startScreenEl.style.display = 'flex';
  }

  function setInputMode(mode, detail) {
    if (!modeEl) return;
    const text = mode === 'hand' ? 'HAND MODE' : 'MOUSE MODE';
    modeEl.textContent = detail ? `${text} - ${detail}` : text;
    modeEl.classList.toggle('mode-hand', mode === 'hand');
    modeEl.classList.toggle('mode-mouse', mode !== 'hand');
  }

  setInputMode('mouse');

  function getPhase() { return phase; }
  function setPhase(p) { 
    phase = p; 
    updateViewfinder();
  }

  function updateViewfinder() {
    if (!viewfinderEl) return;
    if (phase === 'armed' || phase === 'countdown' || phase === 'puzzle') {
      viewfinderEl.style.display = 'block';
      if (customVfRect) {
        viewfinderEl.style.width = `${customVfRect.w}px`;
        viewfinderEl.style.height = `${customVfRect.h}px`;
        viewfinderEl.style.left = `${customVfRect.x}px`;
        viewfinderEl.style.top = `${customVfRect.y}px`;
        viewfinderEl.style.transform = 'none';
      } else {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const iw = video.videoWidth || 1280;
        const ih = video.videoHeight || 720;
        
        const scale = Math.min(vw * 0.85 / iw, (vh - 80) * 0.85 / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        
        viewfinderEl.style.width = `${dw}px`;
        viewfinderEl.style.height = `${dh}px`;
        viewfinderEl.style.left = '50%';
        viewfinderEl.style.top = '50%';
        viewfinderEl.style.transform = 'translate(-50%, -50%)';
      }
    } else {
      viewfinderEl.style.display = 'none';
    }
  }

  function _enterArmedMode() {
    phase = 'armed';
    polEl.style.display = 'none';
    badgeEl.style.display = 'none';
    ctrlEl.style.display = 'none';
    cur1.style.display = 'none';
    cur2.style.display = 'none';
    Puzzle.clear();
    mouseDrag = null;

    statusEl.textContent = 'Camera Ready';
    if (usePlaceholderCapture) {
      hintEl.textContent = 'press Enter atau Space untuk mulai countdown';
    } else {
      hintEl.textContent = 'pinch both hands - expand - release';
    }
    grEl.style.display = 'none';
    cntEl.style.display = 'none';
    setArmedProgress(0, false);
    if (gpEl) gpEl.style.display = 'flex';
    updateViewfinder();
  }

  function triggerCaptureStart(source) {
    if (phase !== 'armed') return;
    setArmedProgress(0, false);
    if (gpEl) gpEl.style.display = 'none';
    if (source === 'hand') {
      statusEl.textContent = 'Hand Triggered';
    }
    startCountdown();
  }

  function setArmedProgress(progress, active) {
    if (!gpEl) return;
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    gpEl.style.setProperty('--progress', p.toFixed(3));
    gpEl.classList.toggle('active', !!active);
  }

  // ── MOUSE DRAG FALLBACK ──
  function _screenToOrtho(sx, sy) {
    return { x: sx - Renderer.W() / 2, y: -(sy - Renderer.H() / 2) };
  }

  threeC.addEventListener('mousedown', e => {
    if (phase !== 'puzzle') return;
    const o = _screenToOrtho(e.clientX, e.clientY);
    const p = Puzzle.findNearest(o.x, o.y, null);
    if (p) {
      mouseDrag = { piece: p, offX: p.mesh.position.x - o.x, offY: p.mesh.position.y - o.y };
      p.mesh.position.z = 99;
    }
  });

  threeC.addEventListener('mousemove', e => {
    if (!mouseDrag) return;
    const o = _screenToOrtho(e.clientX, e.clientY);
    mouseDrag.piece.mesh.position.x = o.x + mouseDrag.offX;
    mouseDrag.piece.mesh.position.y = o.y + mouseDrag.offY;
  });

  threeC.addEventListener('mouseup', () => {
    if (!mouseDrag) return;
    Puzzle.trySnap(mouseDrag.piece);
    mouseDrag = null;
  });

  threeC.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    threeC.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
  }, { passive: false });

  threeC.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    threeC.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
  }, { passive: false });

  threeC.addEventListener('touchend', () => {
    threeC.dispatchEvent(new MouseEvent('mouseup'));
  }, { passive: false });

  // ── KEYBOARD ──
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && phase === 'armed') {
      triggerCaptureStart('keyboard');
      return;
    }
    if (e.key === 'Enter' && (phase === 'puzzle' || phase === 'polaroid' || phase === 'idle')) {
      _enterArmedMode();
    }
    if ((e.key === 'g' || e.key === 'G') && phase === 'puzzle') {
      Puzzle.cycleGrid();
    }
  });

  // ── RESET ──
  document.getElementById('resetbtn').addEventListener('click', () => {
    polEl.style.display   = 'none';
    badgeEl.style.display = 'none';
    _enterArmedMode();
  });

  // ── START BUTTON ──
  document.getElementById('startbtn').addEventListener('click', async () => {
    const errEl = document.getElementById('camerr');
    const startScreen = document.getElementById('start-screen');
    errEl.style.display = 'none';
    if (noCamBtn) noCamBtn.style.display = 'none';
    usePlaceholderCapture = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      video.srcObject = stream;
      await video.play();
      startScreen.style.display = 'none';

      // Inisialisasi hand tracking berbasis event readiness.
      _initHandTracking();

      // Masuk mode siaga: tunggu trigger gesture/keyboard.
      _enterArmedMode();

    } catch (e) {
      errEl.style.display = 'block';
      errEl.textContent = 'Kamera error: ' + e.message;
      setInputMode('mouse', 'CAM OFF');
      if (noCamBtn) noCamBtn.style.display = 'inline-block';
    }
  });

  if (noCamBtn) {
    noCamBtn.addEventListener('click', () => {
      const startScreen = document.getElementById('start-screen');
      usePlaceholderCapture = true;
      setInputMode('mouse', 'NO CAMERA');
      startScreen.style.display = 'none';
      _enterArmedMode();
    });
  }

  // ── INIT HAND TRACKING (non-blocking) ──
  function _initHandTracking() {
    if (handTrackingReady || handTrackingInitStarted) return;

    const startHandTracking = () => {
      if (handTrackingReady || handTrackingInitStarted) return;
      handTrackingInitStarted = true;
      try {
        HandTracker.init(() => {
          handTrackingReady = true;
          setInputMode('hand', 'READY');
          if (phase === 'armed' && !usePlaceholderCapture) {
            hintEl.textContent = 'pinch both hands - expand - release';
          }
          console.log('[PuzzleCam] MediaPipe loaded OK');
        });
      } catch (e) {
        handTrackingInitStarted = false;
        console.warn('[PuzzleCam] Hand tracking error:', e);
        setInputMode('mouse', 'HAND ERROR');
      }
    };

    if (window.__mediapipeReady && typeof Hands !== 'undefined' && typeof Camera !== 'undefined') {
      startHandTracking();
      return;
    }

    if (window.__mediapipeFailed) {
      console.warn('[PuzzleCam] MediaPipe tidak tersedia, pakai mouse/touch');
      setInputMode('mouse', 'MP FAILED');
      return;
    }

    setInputMode('mouse', 'WAITING MP');
    if (mpStatusEl) {
      mpStatusEl.textContent = 'Loading MediaPipe...';
    }

    window.addEventListener('mediapipe-ready', startHandTracking, { once: true });
    window.addEventListener('mediapipe-failed', () => {
      console.warn('[PuzzleCam] MediaPipe gagal load, lanjut mouse/touch');
      setInputMode('mouse', 'MP FAILED');
      if (phase === 'armed') {
        hintEl.textContent = 'MediaPipe gagal: tekan Enter atau Space untuk mulai countdown';
      }
    }, { once: true });
  }

  // ── COUNTDOWN ──
  function startCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    phase = 'countdown';
    updateViewfinder();
    polEl.style.display   = 'none';
    badgeEl.style.display = 'none';
    ctrlEl.style.display  = 'none';
    cur1.style.display    = 'none';
    cur2.style.display    = 'none';
    Puzzle.clear();
    mouseDrag = null;

    statusEl.textContent = 'Get Ready...';
    hintEl.textContent   = 'drag pieces dengan mouse / pinch tangan';
    grEl.style.display   = 'block';
    if (gpEl) gpEl.style.display = 'none';

    let n = 3;
    cntEl.style.display = 'block';
    cntEl.textContent   = n;

    countdownTimer = setInterval(() => {
      n--;
      if (n > 0) {
        cntEl.style.display = 'none';
        void cntEl.offsetWidth;
        cntEl.style.display = 'block';
        cntEl.textContent   = n;
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        cntEl.style.display = 'none';
        grEl.style.display  = 'none';
        _capturePhoto();
      }
    }, 1000);
  }

  // ── CAPTURE FOTO ──
  function _capturePhoto() {
    flashEl.style.opacity = '1';
    setTimeout(() => { flashEl.style.opacity = '0'; }, 120);

    let c = null;
    if (!usePlaceholderCapture && video.srcObject && video.readyState >= 2) {
      c = document.createElement('canvas');
      c.width = video.videoWidth || 1280;
      c.height = video.videoHeight || 720;
      const ctx = c.getContext('2d');
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);

      if (customVfRect) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const screenAspect = vw / vh;
        const videoAspect = c.width / c.height;
        
        let visW = c.width;
        let visH = c.height;
        let visX = 0;
        let visY = 0;

        if (screenAspect > videoAspect) {
          visW = c.width;
          visH = c.width / screenAspect;
          visY = (c.height - visH) / 2;
        } else {
          visH = c.height;
          visW = c.height * screenAspect;
          visX = (c.width - visW) / 2;
        }

        const scaleX = visW / vw;
        const scaleY = visH / vh;

        const cropX = visX + customVfRect.x * scaleX;
        const cropY = visY + customVfRect.y * scaleY;
        const cropW = customVfRect.w * scaleX;
        const cropH = customVfRect.h * scaleY;

        const cropC = document.createElement('canvas');
        cropC.width = cropW;
        cropC.height = cropH;
        cropC.getContext('2d').drawImage(c, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        c = cropC;
      }
    } else {
      c = _createPlaceholderFrame();
    }

    phase = 'puzzle';
    updateViewfinder();
    Puzzle.build(c);
  }

  function _createPlaceholderFrame() {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, '#111111');
    g.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);

    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + (i % 4) * 0.02})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * c.width, Math.random() * c.height);
      ctx.lineTo(Math.random() * c.width, Math.random() * c.height);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 74px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PUZZLE CAM', c.width / 2, c.height / 2 - 20);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '28px Courier New';
    ctx.fillText('Camera permission denied - fallback mode', c.width / 2, c.height / 2 + 38);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '20px Courier New';
    ctx.fillText(new Date().toLocaleString(), c.width / 2, c.height / 2 + 78);

    return c;
  }

  window.addEventListener('resize', updateViewfinder);
  video.addEventListener('loadedmetadata', updateViewfinder);

  return {
    getPhase,
    setPhase,
    startCountdown,
    triggerCaptureStart,
    armForNextShot: _enterArmedMode,
    setArmedProgress,
    setCustomViewfinder: (rect) => { customVfRect = rect; updateViewfinder(); },
    getCustomViewfinder: () => customVfRect
  };

})();
