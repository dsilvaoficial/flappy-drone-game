// Drone Runner - script.js
(() => {
  // Load drone image (sprite)
  const droneImg = new Image();
  droneImg.src = "drone.png";
  let droneImgLoaded = false;
  droneImg.onload = () => (droneImgLoaded = true);

  // Canvas + DPR scaling
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = 800, H = 450;

  function resizeCanvasForDPR() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvasForDPR();
  window.addEventListener("resize", resizeCanvasForDPR);

  // UI elements
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelp = document.getElementById("closeHelp");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverEl = document.getElementById("gameOver");
  const restartBtn = document.getElementById("restartBtn");
  const finalScore = document.getElementById("finalScore");
  const bestScoreEl = document.getElementById("bestScore");

  // Música de abertura
  const introMusic = document.getElementById("introMusic");
  introMusic.volume = 0.5; // volume inicial

  // Game state
  let lastTime = 0;
  let running = false;
  let paused = false;

// STARFIELD (céu espacial)
const stars = [];
const STAR_COUNT = 120;

function initStars() {
  stars.length = 0;
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.3,
      speed: Math.random() * 0.6 + 0.2,
      alpha: Math.random() * 0.5 + 0.3
    });
  }
}
initStars();

  // Drone
  const drone = {
    x: 80,
    y: H / 2 - 18,
    w: 64,
    h: 48,
    vy: 0,
    gravity: 0.45,
    lift: -9,
    rotation: 0
  };

  // Obstacles + scoring
  let obstacles = [];
  let spawnTimer = 0;
  let spawnInterval = 1400;
  let baseSpeed = 3.2;
  let speedMultiplier = 1;
  let passedCount = 0;
  let score = 0;
  let best = Number(localStorage.getItem("droneRunnerBest") || 0);

  function difficultyRamp(dt) {
    speedMultiplier = 1 + Math.min(1.6, passedCount * 0.035);
    spawnInterval = 1400 - Math.min(600, passedCount * 18);
  }

  // Audio
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  function beep(freq = 440, time = 0.05, type = "sine") {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + time);
  }

  // Create obstacle
  function createObstacle() {
    const gap = 140;
    const minTop = 40;
    const maxTop = H - gap - 40;
    const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
    const width = 48;
    obstacles.push({ x: W + 10, width, top: topHeight, bottom: H - topHeight - gap, passed: false });
  }

  // Input
  function flap() {
    if (!running) return startGame();
    if (paused) return;
    drone.vy = drone.lift;
    beep(880, 0.04, "triangle");
  }
  document.addEventListener("keydown", e => {
    if (["Space", "ArrowUp"].includes(e.code)) { e.preventDefault(); flap(); }
    else if (e.code === "KeyP") togglePause();
  });
  canvas.addEventListener("mousedown", flap);
  canvas.addEventListener("touchstart", e => { e.preventDefault(); flap(); }, { passive: false });

  // UI events
  startBtn.addEventListener("click", startGame);
  helpBtn.addEventListener("click", () => helpModal.classList.remove("hidden"));
  closeHelp.addEventListener("click", () => helpModal.classList.add("hidden"));
  restartBtn.addEventListener("click", resetAndStart);

  function togglePause() {
    if (!running) return;
    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    if (!paused) { lastTime = performance.now(); requestAnimationFrame(loop); }
  }

  // Collisions
  function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || a.x > b.x + b.width || a.y + a.h < b.y || a.y > b.y + b.height);
  }
  function checkCollisions() {
    const d = { x: drone.x, y: drone.y, w: drone.w, h: drone.h };
    if (drone.y <= 0 || drone.y + drone.h >= H) return true;
    for (let ob of obstacles) {
      const topRect = { x: ob.x, y: 0, width: ob.width, height: ob.top };
      const bottomRect = { x: ob.x, y: H - ob.bottom, width: ob.width, height: ob.bottom };
      if (rectsIntersect(d, topRect) || rectsIntersect(d, bottomRect)) return true;
    }
    return false;
  }

  // helper: rounded rectangle fill (must be declared before usage)
  
  function roundedRectFill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------
  // Drawing: propellers, LEDs
  // ---------------------------

  // draw a single propeller with 2 blades (blades length based on 'radius')
  // speed: multiplier (typical >0). rotation uses performance.now() for smoothness.
  function drawPropeller(cx, cy, radius, speed) {
    ctx.save();
    ctx.translate(cx, cy);

    // ROTATION suave
    const rot = (performance.now() * 0.001 * speed) % (Math.PI * 2);
    ctx.rotate(rot);

    // 1) disco de borrão
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 2) pás (duas lâminas opostas)
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    roundedRectFill(ctx, -radius, -2.6, radius * 2, 5.2, 2);
    ctx.rotate(Math.PI / 2);
    roundedRectFill(ctx, -radius, -2.6, radius * 2, 5.2, 2);

    // 3) LED central da hélice (pisca)
    const pulse = (Math.sin(performance.now() * 0.008) + 1) / 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 0, 0, ${0.35 + pulse * 0.6})`;
    ctx.arc(0, 0, 3 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // 4) hub preto no centro
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.arc(0, 0, Math.max(1.2, radius * 0.18), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // LEDs (body)
  function ledFront() {
    const cx = drone.x + drone.w / 2;
    const cy = drone.y - Math.max(6, drone.h * 0.15);
    const p = (Math.sin(performance.now() * 0.006) + 1) / 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(0,255,180,${0.35 + p * 0.6})`;
    ctx.arc(cx, cy, 3 + p * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  function ledRear() {
    const cx = drone.x + drone.w / 2;
    const cy = drone.y + drone.h + Math.max(6, drone.h * 0.15);
    const p = (Math.sin(performance.now() * 0.008) + 1) / 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,60,60,${0.35 + p * 0.6})`;
    ctx.arc(cx, cy, 3 + p * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  function ledSides() {
    const p = (Math.sin(performance.now() * 0.0075) + 1) / 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,200,40,${0.28 + p * 0.7})`;
    ctx.arc(drone.x - Math.max(6, drone.w * 0.12), drone.y + drone.h / 2, 2 + p * 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,200,40,${0.28 + p * 0.7})`;
    ctx.arc(drone.x + drone.w + Math.max(6, drone.w * 0.12), drone.y + drone.h / 2, 2 + p * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  function policeBar() {
    const t = performance.now() % 600;
    const isBlue = t < 300;
    const cx = drone.x + drone.w / 2;
    const cy = drone.y + Math.min(8, drone.h * 0.18);
    ctx.fillStyle = isBlue ? "rgba(80,160,255,0.85)" : "rgba(255,60,60,0.85)";
    ctx.fillRect(cx - 10, cy, 20, 4);
  }

  // Draw drone: sprite + propellers + leds
  function drawDrone() {
    ctx.save();

    const cx = drone.x + drone.w / 2;
    const cy = drone.y + drone.h / 2;
    const tilt = Math.max(-0.6, Math.min(0.9, drone.vy * 0.03));
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.translate(-cx, -cy);

    // draw sprite or fallback body
    if (droneImgLoaded) {
      ctx.drawImage(droneImg, drone.x, drone.y, drone.w, drone.h);
    } else {
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, drone.x, drone.y, drone.w, drone.h, 8, true, false);
      ctx.fillStyle = "#111";
      roundRect(ctx, drone.x + 8, drone.y + 8, drone.w - 16, drone.h - 16, 5, true, false);
    }

    // propellers positions (proportional)
    const px = Math.max(10, Math.floor(drone.w * 0.18));
    const py = Math.max(8, Math.floor(drone.h * 0.12));
    const r = Math.max(6, Math.min(14, Math.floor(Math.min(drone.w, drone.h) * 0.28)));

    // top-left
    drawPropeller(drone.x + 12, drone.y + 12, 08, 900);
    // top-right
    drawPropeller(drone.x + drone.w - 12, drone.y + 12, 09, 900);
    // bottom-left
    drawPropeller(drone.x + 12, drone.y + drone.h - 12, 08, 900);
    // bottom-right
    drawPropeller(drone.x + drone.w - 12, drone.y + drone.h - 12, 09, 900);

    // LEDs (draw while still rotated so they tilt with drone)
    ledFront();
    ledRear();
    ledSides();
    policeBar();

    ctx.restore();
  }

  // utility rounded rect
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    ctx.lineTo(x + r.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.quadraticCurveTo(x, y, x + r.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Obstacles draw
  function drawBuilding(x, y, w, h) {
  // corpo do prédio
  ctx.fillStyle = "#1b2638";
  roundRect(ctx, x, y, w, h, 6, true, false);

  // sombra lateral
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + w - 6, y, 6, h);

  // janelas
  const winW = 6;
  const winH = 8;
  const gapX = 10;
  const gapY = 14;

  for (let iy = y + 10; iy < y + h - 12; iy += gapY) {
    for (let ix = x + 6; ix < x + w - 10; ix += gapX) {
      const lightOn = Math.random() > 0.55;
      ctx.fillStyle = lightOn
        ? "rgba(255,220,120,0.9)"
        : "rgba(255,255,255,0.12)";
      ctx.fillRect(ix, iy, winW, winH);
    }
  }
}

function drawObstacles() {
  for (let ob of obstacles) {
    // prédio de cima
    drawBuilding(ob.x, 0, ob.width, ob.top);

    // prédio de baixo
    drawBuilding(ob.x, H - ob.bottom, ob.width, ob.bottom);
  }
}

  // HUD
  function drawHUD() {
    ctx.font = "bold 22px Inter, sans-serif";
    ctx.fillStyle = "#dffbf7";
    ctx.fillText("Pontos: " + Math.floor(score), 18, 28);

    ctx.font = "13px Inter, sans-serif";
    ctx.fillStyle = "#9fb6b0";
    ctx.fillText("Melhor: " + best, 18, 46);

    const barW = 160;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(W - barW - 18, 18, barW, 10);
    ctx.fillStyle = "#ffb86b";
    const val = Math.min(1, (speedMultiplier - 1) / 1.6);
    ctx.fillRect(W - barW - 18, 18, barW * val, 10);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.strokeRect(W - barW - 18, 18, barW, 10);
  }

  // Main loop
  function loop(ts) {
    if (!running || paused) return;
    const dt = Math.min(40, ts - lastTime);
    lastTime = ts;

    drone.vy += drone.gravity;
    drone.y += drone.vy;
    drone.rotation = Math.max(-0.8, Math.min(1.2, drone.vy * 0.03));

    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; createObstacle(); }

    const speed = baseSpeed * speedMultiplier;
    for (let ob of obstacles) {
      ob.x -= speed;
      if (!ob.passed && ob.x + ob.width < drone.x) {
        ob.passed = true;
        passedCount++;
        score += 10;
        beep(1200 - Math.min(800, passedCount * 12), 0.05, "sine");
      }
    }
    obstacles = obstacles.filter(o => o.x + o.width > -20);

    difficultyRamp(dt);
    if (checkCollisions()) return gameOver();

    score += dt * 0.01;
    render();
    requestAnimationFrame(loop);
  }
  
  
  function drawSpaceBackground() {
  // Gradiente espacial
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#050914");
  grad.addColorStop(1, "#0a1a33");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Estrelas
  for (let s of stars) {
    s.x -= s.speed;

    if (s.x < 0) {
      s.x = W;
      s.y = Math.random() * H;
    }

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

  function render() {
  ctx.clearRect(0, 0, W, H);
  drawSpaceBackground();

    // subtle moving grid
    ctx.strokeStyle = "rgba(255,255,255,0.02)";
    for (let i = 0; i < 10; i++) {
      const y = H * (i / 10) + ((performance.now() / 80) % 6);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    drawObstacles();
    drawDrone();
    drawHUD();
  }

  // Controls: start / reset / gameOver
  function startGame() {
    overlay.classList.add("hidden");
    helpModal.classList.add("hidden");
    gameOverEl.classList.add("hidden");
    
    // parar música de abertura
   introMusic.pause();
   introMusic.currentTime = 0;

    if (!running) {
      running = true;
      resetState();
      lastTime = performance.now();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      requestAnimationFrame(loop);
    }
  }

  function resetState() {
    obstacles = [];
    spawnTimer = 0;
    spawnInterval = 1400;
    baseSpeed = 3.2;
    speedMultiplier = 1;
    drone.x = 80;
    drone.y = H / 2 - drone.h / 2;
    drone.vy = 0;
    passedCount = 0;
    score = 0;
  }

  function resetAndStart() { running = false; resetState(); startGame(); }

  function gameOver() {
    running = false;
    gameOverEl.classList.remove("hidden");
    finalScore.textContent = "Pontuação: " + Math.floor(score);
    if (score > best) { best = Math.floor(score); localStorage.setItem("droneRunnerBest", best); }
    bestScoreEl.textContent = "Melhor: " + best;
    beep(160, 0.18, "sawtooth");
  }

  // init UI state
  bestScoreEl.textContent = "Melhor: " + best;
  overlay.classList.remove("hidden");
  document.body.addEventListener("click", () => {
  introMusic.play().catch(() => {});
}, { once: true });

})();
