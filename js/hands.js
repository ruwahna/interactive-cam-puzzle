/**
 * hands.js
 * MediaPipe Hands - hand tracking, skeleton draw, gesture detection.
 * Rename module ke HandTracker agar tidak konflik dengan MediaPipe Hands class.
 */

const HandTracker = (() => {

  const handCanvas = document.getElementById('hand-canvas');
  const badgeEl    = document.getElementById('badge');
  const cur1       = document.getElementById('pc1');
  const cur2       = document.getElementById('pc2');
  const video      = document.getElementById('bg-video');

  const BONES = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],[0,17]
  ];

  function init(onReady) {
    const hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });

    hands.onResults(_onResults);

    // Gunakan Camera dari mediapipe camera_utils
    const mpCam = new Camera(video, {
      onFrame: async () => {
        try {
          await hands.send({ image: video });
        } catch(e) { /* ignore frame errors */ }
      },
      width: 640,
      height: 480
    });

    mpCam.start().then(() => {
      if (onReady) onReady();
    }).catch(e => {
      console.warn('[HandTracker] Camera start error:', e);
    });
  }

  function _onResults(res) {
    handCanvas.width  = Renderer.W();
    handCanvas.height = Renderer.H();
    const ctx = handCanvas.getContext('2d');
    ctx.clearRect(0, 0, Renderer.W(), Renderer.H());

    if (!res.multiHandLandmarks || res.multiHandLandmarks.length === 0) {
      cur1.style.display = cur2.style.display = 'none';
      _releaseDrag('L');
      _releaseDrag('R');
      return;
    }

    const handsData = res.multiHandLandmarks.map((lms, i) => {
      const label = res.multiHandedness[i].label;
      const mapped = lms.map(lm => ({
        x: (1 - lm.x) * Renderer.W(),
        y: lm.y * Renderer.H()
      }));
      _drawSkeleton(ctx, mapped, label);
      return { label, lms: mapped };
    });

    const left  = handsData.find(h => h.label === 'Left');
    const right = handsData.find(h => h.label === 'Right');

    if (Main.getPhase() === 'polaroid') {
      _processPolaroidHands(left, right);
      return;
    }

    _processHand('L', left);
    _processHand('R', right);
  }

  function _processPolaroidHands(left, right) {
    const activeHand = left || right;
    const state = Puzzle.getPolaroidState && Puzzle.getPolaroidState();

    if (!activeHand || !state || !state.active) {
      if (cur1) cur1.style.display = 'none';
      if (cur2) cur2.style.display = 'none';
      return;
    }

    const lms = activeHand.lms;
    const index = lms[8];
    const thumb = lms[4];
    const centerX = Renderer.W() / 2;
    const centerY = Renderer.H() / 2;
    const fingerX = (index.x + thumb.x) / 2;
    const fingerY = (index.y + thumb.y) / 2;
    const dx = fingerX - centerX;
    const dy = fingerY - centerY;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const nearPhoto = dist < 320;
    const onRing = dist > 70 && dist < 330;
    const pullStrength = nearPhoto ? Math.max(0, 1 - dist / 320) : 0;

    if (cur1) cur1.style.display = 'block';
    if (cur2) cur2.style.display = 'none';

    const scale = nearPhoto ? Math.max(0.78, 1 - dist / 1500) : 1;
    const opacity = nearPhoto ? Math.max(0.22, 1 - dist / 1000) : 1;
    const pullX = dx * 0.14 * pullStrength;
    const pullY = dy * 0.14 * pullStrength;
    const wobble = nearPhoto ? Math.sin((state.totalSpin || 0) * 0.12) * 1.8 : 0;

    if (state.lastAngle == null) {
      state.lastAngle = angle;
      Puzzle.spinPolaroid(0, scale, opacity, state.totalSpin || 0, pullX, pullY, wobble);
      return;
    }

    const delta = _shortestAngleDiff(angle, state.lastAngle);
    state.lastAngle = angle;

    if (nearPhoto && _isOpenPalm(lms) && onRing) {
      const spinDelta = delta * 0.95;
      state.totalSpin = (state.totalSpin || 0) + Math.abs(spinDelta);
      Puzzle.spinPolaroid(spinDelta, scale, opacity, state.totalSpin, pullX, pullY, wobble);

      if (state.totalSpin > 170) {
        Puzzle.dismissPolaroid();
      }
      return;
    }

    // Saat tangan menjauh atau tidak dalam gesture putar, pertahankan foto dengan sedikit easing.
    state.totalSpin = Math.max(0, (state.totalSpin || 0) - 1.5);
    Puzzle.spinPolaroid(delta * 0.12, scale, opacity, state.totalSpin, pullX * 0.4, pullY * 0.4, wobble * 0.4);
  }

  function _processHand(side, hand) {
    const cur       = side === 'L' ? cur1 : cur2;
    const otherDrag = side === 'L' ? Puzzle.getDragR() : Puzzle.getDragL();

    if (!hand) {
      cur.style.display = 'none';
      _releaseDrag(side);
      return;
    }

    const lms   = hand.lms;
    const pm    = { x: (lms[4].x + lms[8].x) / 2, y: (lms[4].y + lms[8].y) / 2 };
    const pinch = _isPinching(lms);
    const fist  = _isFist(lms);

    cur.style.display = 'block';
    cur.style.left    = pm.x + 'px';
    cur.style.top     = pm.y + 'px';
    cur.classList.toggle('active', pinch);

    if (fist) {
      _releaseDrag(side);
      badgeEl.style.display    = 'block';
      badgeEl.style.color      = '#000';
      if (side === 'L') {
        badgeEl.textContent      = '⬡ FROZEN';
        badgeEl.style.background = '#f0a500';
      } else {
        badgeEl.textContent      = '⬡ FREE TILT';
        badgeEl.style.background = '#4fc3f7';
      }
      return;
    }

    badgeEl.style.display = 'none';
    if (Main.getPhase() !== 'puzzle') return;

    const o = _screenToOrtho(pm.x, pm.y);

    if (pinch) {
      const drag = side === 'L' ? Puzzle.getDragL() : Puzzle.getDragR();
      if (!drag) {
        const p = Puzzle.findNearest(o.x, o.y, otherDrag ? otherDrag.piece : null);
        if (p) {
          const nd = { piece: p, offX: p.mesh.position.x - o.x, offY: p.mesh.position.y - o.y };
          p.mesh.position.z = side === 'L' ? 98 : 97;
          if (side === 'L') Puzzle.setDragL(nd);
          else              Puzzle.setDragR(nd);
        }
      } else {
        drag.piece.mesh.position.x = o.x + drag.offX;
        drag.piece.mesh.position.y = o.y + drag.offY;
      }
    } else {
      _releaseDrag(side);
    }
  }

  function _releaseDrag(side) {
    const drag = side === 'L' ? Puzzle.getDragL() : Puzzle.getDragR();
    if (drag) {
      Puzzle.trySnap(drag.piece);
      if (side === 'L') Puzzle.setDragL(null);
      else              Puzzle.setDragR(null);
    }
  }

  function _dist(a, b)       { return Math.hypot(a.x - b.x, a.y - b.y); }
  function _isPinching(lms)  { return _dist(lms[4], lms[8]) < 42; }
  function _isFist(lms)      { return [8,12,16,20].every(i => _dist(lms[i], lms[0]) < 110); }
  function _isOpenPalm(lms)  { return [8,12,16,20].every(i => _dist(lms[i], lms[0]) > 120); }
  function _shortestAngleDiff(a, b) {
    let d = a - b;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function _screenToOrtho(sx, sy) {
    return { x: sx - Renderer.W() / 2, y: -(sy - Renderer.H() / 2) };
  }

  function _drawSkeleton(ctx, lms, label) {
    const col = label === 'Left' ? 'rgba(255,255,255,0.75)' : 'rgba(240,165,0,0.75)';
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5;
    BONES.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(lms[a].x, lms[a].y);
      ctx.lineTo(lms[b].x, lms[b].y);
      ctx.stroke();
    });
    lms.forEach((lm, i) => {
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, i === 0 ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });
  }

  return { init };

})();
