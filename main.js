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

// --- Physique
const GRAVITY = 2200;  // px/s^2
const JUMP_VY = -950;  // impulsion du saut

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
  if (player) player.snapToGround(); // recale le perso si on redimensionne
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
  for (let i = 0; i < 100; i++) {
    farStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 1.5 + 0.2 });
  }
  for (let i = 0; i < 40; i++) {
    nearStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 2 + 0.8 });
  }
}
seedStars();

// --- Courbe de vitesse (progresse doucement)
function difficultySpeed(timeSec) {
  return 280 * (1 + 0.12 * Math.log2(1 + timeSec));
}

// --- Rendu du décor (halo + étoiles + sol néon)
function paintBackdrop(dt, speed) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  const g = ctx.createRadialGradient(w / 2, h * 0.2, 50, w / 2, h * 0.2, h * 0.9);
  g.addColorStop(0, 'rgba(103,232,249,0.20)');
  g.addColorStop(1, 'rgba(244,114,182,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const s of farStars) {
    s.x -= speed * 0.12 * dt;
    if (s.x < 0) s.x += w;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (const s of nearStars) {
    s.x -= speed * 0.35 * dt;
    if (s.x < 0) s.x += w;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = 'rgba(103,232,249,0.2)';
  ctx.fillRect(0, groundY - 10, w, 10);

  ctx.strokeStyle = '#67e8f9';
  ctx.shadowColor = '#67e8f9';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
  ctx.shadowBlur = 0;
}

// === Joueur (cercle néon) ===
class Player {
  constructor() {
    this.r = 22;
    this.x = 90;
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.snapToGround();
  }
  snapToGround() {
    this.y = groundY - this.r;
    this.vy = 0;
    this.onGround = true;
  }
  jump() {
    if (!this.onGround || state !== 'running') return;
    this.vy = JUMP_VY;
    this.onGround = false;
  }
  update(dt) {
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;

    const maxY = groundY - this.r;
    if (this.y > maxY) {
      this.y = maxY;
      this.vy = 0;
      this.onGround = true;
    }
  }
  draw(ctx) {
    // glow extérieur
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(103,232,249,0.9)';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // anneau intérieur rose
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r - 6, 0, Math.PI * 2); ctx.stroke();
  }
}
let player = new Player();

// --- Boucle de jeu (delta time clampé)
let last = performance.now();
function loop(now = performance.now()) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const speed = difficultySpeed(t);
  paintBackdrop(dt, speed);

  if (state === 'running') {
    t += dt;
    score += dt * (10 + speed * 0.03);
    player.update(dt);
  }

  player.draw(ctx);

  $score.textContent = String(Math.floor(score));
  $speed.textContent = String(Math.round(speed));

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- UI
$start.addEventListener('click', () => { state = 'running'; $overlay.hidden = true; });

$pause.addEventListener('click', () => {
  if (state === 'running') { state = 'paused'; $pause.textContent = 'Reprendre'; }
  else if (state === 'paused') { state = 'running'; $pause.textContent = 'Pause'; }
});

$restart.addEventListener('click', () => {
  // branché au commit "restart flow"
});

// --- Contrôles
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  if (e.code === 'KeyP') {
    if (state === 'running') { state = 'paused'; $pause.textContent = 'Reprendre'; }
    else if (state === 'paused') { state = 'running'; $pause.textContent = 'Pause'; }
  }

  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'menu') { state = 'running'; $overlay.hidden = true; }
    else if (state === 'running') { player.jump(); }
  }
}, { passive: false });

// Tactile = saut
window.addEventListener('touchstart', () => {
  if (state === 'menu') { state = 'running'; $overlay.hidden = true; }
  else if (state === 'running') { player.jump(); }
}, { passive: true });
