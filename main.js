'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const $score = document.getElementById('score');
const $speed = document.getElementById('speed');
const $pause = document.getElementById('pause');
const $restart = document.getElementById('restart');
const $overlay = document.getElementById('overlay');
const $start = document.getElementById('start');
const $pauseOverlay = document.getElementById('pauseOverlay');
const $resume = document.getElementById('resume');

let state = 'menu';
let groundY = 0;
let score = 0;
let t = 0;

const GRAVITY = 2200;
const JUMP_VY = -950;
const T_AIR = (2 * Math.abs(JUMP_VY)) / GRAVITY; // durée en l’air approx.

/* déclaré tôt, jamais redéclaré */
let player = null;

function syncUI() {
  const isMenu = state === 'menu';
  const isOver = state === 'over';
  const isPaused = state === 'paused';
  $overlay.hidden = !isMenu;
  $overlay.style.display = isMenu ? 'grid' : 'none';
  $restart.hidden = !isOver;
  if ($pauseOverlay) $pauseOverlay.hidden = !isPaused;
  if ($pause) $pause.textContent = isPaused ? 'Reprendre' : 'Pause';
}

/* Canvas + sol 70% */
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundY = Math.floor(h * 0.7);
  if (player) player.snapToGround();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* Parallax */
const farStars = [], nearStars = [];
function seedStars() {
  farStars.length = 0; nearStars.length = 0;
  const w = canvas.width / (window.devicePixelRatio || 1);
  for (let i = 0; i < 100; i++)
    farStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 1.5 + 0.2 });
  for (let i = 0; i < 40; i++)
    nearStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 2 + 0.8 });
}

/* Vitesse linéaire */
function difficultySpeed(s) { return 220 + 14 * s; }

/* Fond + sol */
function paintBackdrop(dt, speed) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  const g = ctx.createRadialGradient(w / 2, h * 0.2, 50, w / 2, h * 0.2, h * 0.9);
  g.addColorStop(0, 'rgba(103,232,249,0.20)');
  g.addColorStop(1, 'rgba(244,114,182,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const s of farStars) { s.x -= speed * 0.12 * dt; if (s.x < 0) s.x += w; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (const s of nearStars) { s.x -= speed * 0.35 * dt; if (s.x < 0) s.x += w; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }

  ctx.fillStyle = 'rgba(103,232,249,0.2)';
  ctx.fillRect(0, groundY - 10, w, 10);
  ctx.strokeStyle = '#67e8f9'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 8; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
  ctx.shadowBlur = 0;
}

/* Joueur */
class Player {
  constructor() { this.r = 22; this.x = 0; this.y = 0; this.vy = 0; this.onGround = true; this.snapToGround(); }
  snapToGround() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    this.x = Math.floor(w / 5);
    this.y = groundY - this.r;
    this.vy = 0; this.onGround = true;
  }
  jump() { if (this.onGround && state === 'running') { this.vy = JUMP_VY; this.onGround = false; } }
  update(dt) {
    this.vy += GRAVITY * dt; this.y += this.vy * dt;
    const maxY = groundY - this.r;
    if (this.y > maxY) { this.y = maxY; this.vy = 0; this.onGround = true; }
  }
  draw(ctx) {
    ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(103,232,249,0.9)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r - 6, 0, Math.PI * 2); ctx.stroke();
  }
  getAABB() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
}
player = new Player();
seedStars();

/* Obstacles vitesse uniforme */
class Obstacle {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.col = '#7dd3fc'; this.border = '#0ea5e9';
  }
  update(dt, baseSpeed) { this.x -= baseSpeed * dt; }
  draw(ctx) {
    ctx.fillStyle = this.col; ctx.strokeStyle = this.border; ctx.lineWidth = 2;
    ctx.shadowColor = this.col; ctx.shadowBlur = 12;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.shadowBlur = 0; ctx.strokeRect(this.x, this.y, this.w, this.h);
  }
  off() { return this.x + this.w < -10; }
  aabb() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}
const obstacles = [];

/* Génération infinie basée sur la distance */
let distSinceSpawn = 0;
let nextGapPx = 360;

function scheduleNextGap(currentSpeed) {
  const minGap = Math.max(200, 420 - 0.25 * currentSpeed);
  const extra = 120 + Math.random() * 260;
  nextGapPx = Math.max(minGap, minGap + extra);
}
function addBlockAt(x, w, h) {
  const y = groundY - h;
  obstacles.push(new Obstacle(x, y, w, h));
}
function spawnPattern(currentSpeed) {
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;
  const spawnX = Math.floor(viewW + 12);

  const roll = Math.random();
  if (roll < 0.55) {
    const w = 26 + Math.floor(Math.random() * 22);
    const h = 30 + Math.floor(Math.random() * 50);
    addBlockAt(spawnX, w, h);
  } else if (roll < 0.90) {
    const w1 = 24 + Math.floor(Math.random() * 20);
    const h1 = 28 + Math.floor(Math.random() * 44);
    const w2 = 24 + Math.floor(Math.random() * 22);
    const h2 = 28 + Math.floor(Math.random() * 44);
    const maxAirPixels = currentSpeed * (T_AIR * 0.82);
    const gap = Math.max(52, Math.min(200, maxAirPixels));
    addBlockAt(spawnX, w1, h1);
    addBlockAt(spawnX + Math.floor(gap), w2, h2);
  } else {
    const w = 70 + Math.floor(Math.random() * 80);
    const h = 22 + Math.floor(Math.random() * 18);
    addBlockAt(spawnX, w, h);
  }
  scheduleNextGap(currentSpeed);
}

function hit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* États */
function gameOver() { state = 'over'; syncUI(); }
function resetStateCommon() {
  score = 0; t = 0;
  obstacles.length = 0;
  distSinceSpawn = 0;
  nextGapPx = 360;
  player.snapToGround();
}
function resetGame() { resetStateCommon(); state = 'running'; syncUI(); }
function startFromMenu() { resetStateCommon(); state = 'running'; syncUI(); }

/* Boucle principale */
let last = performance.now();
function loop(now = performance.now()) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  const speed = difficultySpeed(t);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintBackdrop(dt, state === 'running' ? speed : 0); // fond figé en pause

  if (state === 'running') {
    t += dt;
    score += dt * (10 + speed * 0.03);
    player.update(dt);

    distSinceSpawn += speed * dt;
    if (distSinceSpawn >= nextGapPx) {
      distSinceSpawn = 0;
      spawnPattern(speed);
    }

    const p = player.getAABB();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.update(dt, speed);
      o.draw(ctx);
      if (o.off()) { obstacles.splice(i, 1); continue; }
      if (hit(p, o.aabb())) { gameOver(); break; }
    }
  } else {
    for (const o of obstacles) o.draw(ctx);
    if (state === 'over') {
      const w = canvas.width / (window.devicePixelRatio || 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, w, groundY);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 32px system-ui, sans-serif'; ctx.fillText('Game Over', w / 2, groundY - 84);
      ctx.font = '16px system-ui, sans-serif'; ctx.fillText('Espace pour rejouer', w / 2, groundY - 52);
    }
  }

  player.draw(ctx);
  $score.textContent = String(Math.floor(score));
  $speed.textContent = String(Math.round(speed));

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* Entrées */
if ($start) $start.addEventListener('click', startFromMenu);
if ($pause) $pause.addEventListener('click', () => {
  state = state === 'running' ? 'paused' : (state === 'paused' ? 'running' : state);
  syncUI();
});
if ($restart) $restart.addEventListener('click', resetGame);
if ($resume) $resume.addEventListener('click', () => { state = 'running'; syncUI(); });

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP') {
    state = state === 'running' ? 'paused' : (state === 'paused' ? 'running' : state);
    syncUI();
  }
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'menu') startFromMenu();
    else if (state === 'running') player.jump();
    else if (state === 'over') resetGame();
  }
}, { passive: false });

window.addEventListener('touchstart', () => {
  if (state === 'menu') startFromMenu();
  else if (state === 'running') player.jump();
  else if (state === 'over') resetGame();
}, { passive: true });

syncUI();
