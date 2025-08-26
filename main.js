'use strict';

// --- Raccourcis DOM
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $score = document.getElementById('score');
const $speed = document.getElementById('speed');
const $pause = document.getElementById('pause');
const $restart = document.getElementById('restart');
const $overlay = document.getElementById('overlay');
const $start = document.getElementById('start');

// --- État global
let state = 'menu'; // 'menu' | 'running' | 'paused' | 'over'
let groundY = 0;
let score = 0;
let t = 0; // temps écoulé (secondes)

// --- Resize + DPR
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundY = Math.floor(h * 0.8);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Parallax: champs d'étoiles
const farStars = [];
const nearStars = [];
function seedStars() {
  farStars.length = 0;
  nearStars.length = 0;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  // étoiles lointaines (nombreuses, petites)
  for (let i = 0; i < 100; i++) {
    farStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 1.5 + 0.2 });
  }
  // étoiles proches (moins nombreuses, un peu plus grosses)
  for (let i = 0; i < 40; i++) {
    nearStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 2 + 0.8 });
  }
}
seedStars();

// --- Courbe de vitesse (progresse doucement)
function difficultySpeed(timeSec) {
  // base 280 px/s + croissance log base 2 douce
  return 280 * (1 + 0.12 * Math.log2(1 + timeSec));
}

// --- Rendu du décor (halo + étoiles + sol néon)
function paintBackdrop(dt, speed) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  // halo
  const g = ctx.createRadialGradient(w / 2, h * 0.2, 50, w / 2, h * 0.2, h * 0.9);
  g.addColorStop(0, 'rgba(103,232,249,0.20)');
  g.addColorStop(1, 'rgba(244,114,182,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // étoiles lointaines (défilement lent)
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const s of farStars) {
    s.x -= speed * 0.12 * dt;
    if (s.x < 0) s.x += w;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // étoiles proches (plus rapides)
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (const s of nearStars) {
    s.x -= speed * 0.35 * dt;
    if (s.x < 0) s.x += w;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // bande d’herbe néon + ligne de sol
  ctx.fillStyle = 'rgba(103,232,249,0.2)';
  ctx.fillRect(0, groundY - 10, w, 10);

  ctx.strokeStyle = '#67e8f9';
  ctx.shadowColor = '#67e8f9';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
  ctx.shadowBlur = 0; // reset
}

// --- Boucle de jeu (delta time clampé)
let last = performance.now();
function loop(now = performance.now()) {
  const dt = Math.min(0.033, (now - last) / 1000); // max ~33ms (limiter les gros sauts)
  last = now;

  // effacer l’écran
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const speed = difficultySpeed(t);
  paintBackdrop(dt, speed);

  if (state === 'running') {
    t += dt;
    score += dt * (10 + speed * 0.03); // score progresse avec le temps + vitesse
  }

  // HUD
  $score.textContent = String(Math.floor(score));
  $speed.textContent = String(Math.round(speed));

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- UI
$start.addEventListener('click', () => {
  state = 'running';
  $overlay.hidden = true;
});

$pause.addEventListener('click', () => {
  if (state === 'running') {
    state = 'paused';
    $pause.textContent = 'Reprendre';
  } else if (state === 'paused') {
    state = 'running';
    $pause.textContent = 'Pause';
  }
});

$restart.addEventListener('click', () => {
  // branché quand on aura le Game Over
});

// Raccourci clavier pour pause
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    if (state === 'running') {
      state = 'paused';
      $pause.textContent = 'Reprendre';
    } else if (state === 'paused') {
      state = 'running';
      $pause.textContent = 'Pause';
    }
  }
});
