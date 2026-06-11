/**
 * renderer.js
 * Manages the Three.js WebGL renderer, scene, orthographic camera,
 * and the main animation/render loop.
 */

const Renderer = (() => {

  // ── DOM ──
  const canvas = document.getElementById('three-canvas');

  // ── HELPERS ──
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  // ── THREE CORE ──
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  // Orthographic camera — 1 unit = 1 pixel
  const camera = new THREE.OrthographicCamera(-W()/2, W()/2, H()/2, -H()/2, 0.1, 2000);
  camera.position.z = 100;

  // ── RESIZE ──
  window.addEventListener('resize', () => {
    renderer.setSize(W(), H());
    camera.left   = -W() / 2;
    camera.right  =  W() / 2;
    camera.top    =  H() / 2;
    camera.bottom = -H() / 2;
    camera.updateProjectionMatrix();
  });

  // ── RENDER LOOP ──
  const clock = new THREE.Clock();
  let frameCount = 0;
  let lastTime = performance.now();
  let fpsEl = null;

  function loop() {
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();

    // FPS Calculation
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      if (!fpsEl) fpsEl = document.getElementById('stat-fps');
      if (fpsEl) fpsEl.textContent = frameCount;
      frameCount = 0;
      lastTime = now;
    }

    // Gentle float animation for unsolved pieces
    if (window.Puzzle && typeof Puzzle.floatPieces === 'function') {
      Puzzle.floatPieces(t);
    }

    renderer.render(scene, camera);
  }

  loop();

  // ── PUBLIC ──
  return { scene, camera, renderer, W, H };

})();
