/**
 * puzzle.js
 * Handles building puzzle pieces from the captured photo,
 * piece snap logic, solve detection, and the polaroid reveal.
 */

const Puzzle = (() => {

  // ── DOM ──
  const statusEl  = document.getElementById('status');
  const badgeEl   = document.getElementById('badge');
  const hintEl    = document.getElementById('hint');
  const ctrlEl    = document.getElementById('controls');
  const polEl     = document.getElementById('polaroid');
  const polCvs    = document.getElementById('pol-canvas');

  // ── STATE ──
  let pieces       = [];   // Array of piece objects
  let capturedImg  = null;
  let capturedTex  = null;
  let COLS         = 3;
  let ROWS         = 3;
  let puzzleSolved = false;

  // Active drag references (set by hands.js or mouse fallback)
  let dragL = null;  // { piece, offX, offY }
  let dragR = null;
  let polaroidSpin = null;

  // ── BUILD ──
  function build(imgCanvas) {
    capturedImg  = imgCanvas;
    capturedTex  = new THREE.CanvasTexture(imgCanvas);
    puzzleSolved = false;
    clear();

    const vw = Renderer.W();
    const vh = Renderer.H();
    const iw = capturedImg.width;
    const ih = capturedImg.height;

    const scale = Math.min(vw * 0.85 / iw, (vh - 80) * 0.85 / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const pw = dw / COLS;
    const ph = dh / ROWS;

    // Ortho origin (bottom-left corner of assembled puzzle)
    const ox = -dw / 2;
    const oy = -dh / 2;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        _createPiece(col, row, pw, ph, ox, oy);
      }
    }

    statusEl.textContent = 'Drag Pieces With Pinch';
    ctrlEl.style.display = 'block';
  }

  function _createPiece(col, row, pw, ph, ox, oy) {
    // UV slice for this piece
    const u0 = col / COLS;
    const u1 = (col + 1) / COLS;
    const v0 = 1 - (row + 1) / ROWS;
    const v1 = 1 - row / ROWS;

    const geo = new THREE.PlaneGeometry(pw - 2, ph - 2);
    const uv  = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i,
        u0 + uv.getX(i) * (u1 - u0),
        v0 + uv.getY(i) * (v1 - v0)
      );
    }
    uv.needsUpdate = true;

    const mat  = new THREE.MeshBasicMaterial({ map: capturedTex, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);

    // White border (child mesh, slightly behind)
    const bMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const bord = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), bMat);
    bord.position.z = -0.5;
    mesh.add(bord);

    // Target ortho position
    const tx = ox + col * pw + pw / 2;
    const ty = oy + (ROWS - 1 - row) * ph + ph / 2;

    // Random scatter
    mesh.position.set(
      (Math.random() - 0.5) * Renderer.W() * 0.7,
      (Math.random() - 0.5) * (Renderer.H() - 120) * 0.6,
      col + row * COLS + 1
    );
    mesh.rotation.z = (Math.random() - 0.5) * 0.6;

    Renderer.scene.add(mesh);
    pieces.push({ mesh, col, row, tx, ty, pw, ph, solved: false });
  }

  // ── CLEAR ──
  function clear() {
    pieces.forEach(p => Renderer.scene.remove(p.mesh));
    pieces = [];
    dragL = null;
    dragR = null;
  }

  // ── FIND NEAREST UNSOLVED ──
  function findNearest(ox, oy, exclude) {
    let best = null;
    let bestDist = 90;
    pieces.forEach(p => {
      if (p.solved) return;
      if (p === exclude) return;
      const d = Math.hypot(p.mesh.position.x - ox, p.mesh.position.y - oy);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }

  // ── SNAP ──
  function trySnap(p) {
    const dx = Math.abs(p.mesh.position.x - p.tx);
    const dy = Math.abs(p.mesh.position.y - p.ty);
    if (dx < 55 && dy < 55) {
      p.mesh.position.x = p.tx;
      p.mesh.position.y = p.ty;
      p.mesh.rotation.z = 0;
      p.mesh.position.z = p.col + p.row * COLS;
      p.solved = true;
      p.mesh.children[0].material.color.set(0x00e676);
      p.mesh.children[0].material.opacity = 0.9;
      _checkSolved();
      return true;
    }
    p.mesh.position.z = p.col + p.row * COLS;
    return false;
  }

  // ── SOLVE CHECK ──
  function _checkSolved() {
    if (puzzleSolved) return;
    if (!pieces.every(p => p.solved)) return;
    puzzleSolved = true;
    badgeEl.style.display = 'block';
    badgeEl.textContent   = '✓ SOLVED';
    badgeEl.style.background = '#00e676';
    badgeEl.style.color   = '#000';
    statusEl.textContent  = 'Puzzle Complete!';
    setTimeout(showPolaroid, 900);
  }

  // ── POLAROID REVEAL ──
  function showPolaroid() {
    // Notify main.js about phase change
    Main.setPhase('polaroid');
    ctrlEl.style.display = 'none';
    statusEl.textContent = 'Moment Captured';
    hintEl.textContent   = 'press Enter or Reset to play again';

    polaroidSpin = {
      active: true,
      angle: -2,
      startAngle: null,
      totalSpin: 0,
      lastAngle: null,
      pullX: 0,
      pullY: 0,
      centerX: Renderer.W() / 2,
      centerY: Renderer.H() / 2,
    };

    const pw = Math.min(Renderer.W() * 0.42, 300);
    const ph = pw * (capturedImg.height / capturedImg.width);
    polCvs.width  = pw;
    polCvs.height = ph;
    polCvs.getContext('2d').drawImage(capturedImg, 0, 0, pw, ph);
    polEl.style.display = 'block';
    polEl.dataset.active = '1';
    polEl.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
    polEl.style.opacity = '0';
    polEl.style.transform = 'translate(-50%, -50%) rotate(-8deg) scale(0.55)';
    requestAnimationFrame(() => {
      polEl.style.opacity = '1';
      polEl.style.transform = 'translate(-50%, -50%) rotate(-2deg) scale(1.04)';
      setTimeout(() => {
        if (polaroidSpin && polaroidSpin.active) {
          polEl.style.transform = `translate(-50%, -50%) rotate(${polaroidSpin.angle}deg) scale(1)`;
        }
      }, 180);
    });

    // Fade out pieces
    pieces.forEach((p, i) => {
      setTimeout(() => {
        let op = 1;
        const iv = setInterval(() => {
          op -= 0.1;
          p.mesh.material.opacity = Math.max(0, op);
          p.mesh.children[0].material.opacity = Math.max(0, op * 0.4);
          if (op <= 0) { clearInterval(iv); Renderer.scene.remove(p.mesh); }
        }, 25);
      }, i * 35);
    });
  }

  // ── FLOAT ANIMATION (called by renderer loop) ──
  function floatPieces(t) {
    pieces.forEach((p, i) => {
      const dragging = (dragL && dragL.piece === p) || (dragR && dragR.piece === p);
      if (!p.solved && !dragging) {
        p.mesh.position.y += Math.sin(t * 0.8 + i * 0.9) * 0.06;
      }
    });
  }

  // ── CYCLE GRID ──
  function cycleGrid() {
    const modes = [[3, 3], [2, 2], [4, 4]];
    const idx   = modes.findIndex(m => m[0] === COLS);
    const next  = modes[(idx + 1) % modes.length];
    COLS = next[0];
    ROWS = next[1];
    if (capturedImg) build(capturedImg);
  }

  // ── GETTERS / SETTERS for drag state (used by hands.js + mouse) ──
  function getDragL() { return dragL; }
  function getDragR() { return dragR; }
  function setDragL(v) { dragL = v; }
  function setDragR(v) { dragR = v; }

  function getPolaroidState() { return polaroidSpin; }

  function spinPolaroid(deltaDeg, scale, opacity, spinProgress, pullX, pullY, wobbleDeg) {
    if (!polaroidSpin || !polaroidSpin.active) return;
    const safeScale = Math.max(0.1, scale ?? 1);
    const safeOpacity = Math.max(0, Math.min(1, opacity ?? 1));
    polaroidSpin.angle += deltaDeg;
    if (typeof spinProgress === 'number') {
      polaroidSpin.totalSpin = spinProgress;
    }
    if (typeof pullX === 'number') polaroidSpin.pullX = pullX;
    if (typeof pullY === 'number') polaroidSpin.pullY = pullY;
    const wobble = typeof wobbleDeg === 'number' ? wobbleDeg : 0;
    const tx = Math.max(-140, Math.min(140, polaroidSpin.pullX || 0));
    const ty = Math.max(-140, Math.min(140, polaroidSpin.pullY || 0));
    polEl.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${polaroidSpin.angle + wobble}deg) scale(${safeScale})`;
    polEl.style.opacity = String(safeOpacity);
  }

  function dismissPolaroid() {
    if (!polaroidSpin || !polaroidSpin.active) return;
    polaroidSpin.active = false;
    statusEl.textContent = 'Photo Removed';
    hintEl.textContent = 'press Enter or Reset to play again';
    polEl.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
    polEl.style.transform = 'translate(-50%, -50%) rotate(540deg) scale(0.15)';
    polEl.style.opacity = '0';
    setTimeout(() => {
      polEl.style.display = 'none';
      polEl.style.opacity = '1';
      polEl.style.transition = '';
      Main.setPhase('idle');
    }, 380);
  }

  // ── PUBLIC ──
  return {
    build,
    clear,
    findNearest,
    trySnap,
    floatPieces,
    cycleGrid,
    getDragL, getDragR,
    setDragL, setDragR,
    getPolaroidState,
    spinPolaroid,
    dismissPolaroid,
  };

})();
