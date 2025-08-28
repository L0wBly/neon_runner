'use strict';

/* ===== DOM ===== */
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

/* ===== State ===== */
let state = 'menu';
let groundY = 0;
let score = 0;
let t = 0;

/* ===== API (fallback) ===== */
const API_BASE = 'http://localhost:3001';
let OBSTACLE_DEFS = null;
let BONUS_DEFS = null;
const FALLBACK_OBSTACLES = [
  { type: 'single',  weight: 3, wMin: 26, wMax: 48,  hMin: 30, hMax: 80 },
  { type: 'low-wide',weight: 1, wMin: 70, wMax: 150, hMin: 22, hMax: 40 }
];
const FALLBACK_BONUSES = [
  { type: 'coin', points: 50,  weight: 2 },
  { type: 'gem',  points: 120, weight: 1 }
];

/* ===== Gameplay / Physique ===== */
const GRAVITY = 2200;
const JUMP_VY = -950;
const PLAYER_R = 22;
const CROUCH_SCALE = 0.6;
const CROUCH_R = Math.floor(PLAYER_R * CROUCH_SCALE);
const SAFETY = 18;
const T_AIR = (2 * Math.abs(JUMP_VY)) / GRAVITY;
function difficultySpeed(s) { return 220 + 14 * s; }

/* ===== Rayons / Sol ===== */
const BEAM_CLEAR_MARGIN = 6;
const GROUND_BAND_HEIGHT = 10;
const BEAM_GROUND_GAP = 28;

/* ===== Espacements Obstacles (base) ===== */
const GAP_COEF = 0.85, GAP_BASE = 140;
const GAP_EXTRA_MIN = 100, GAP_EXTRA_MAX = 420;
const MIN_PATTERN_GAP = 360;
const LONG_GAP_CHANCE = 0.22;
const LONG_GAP_BONUS_MIN = 160, LONG_GAP_BONUS_MAX = 420;

/* ===== Bonus / Pickups ===== */
const BONUS_LEAD_TIME = 0.65;
const BONUS_MIN_H = 50, BONUS_MAX_H_CAP = 150;
const PICKUP_SAFE_HORIZ = PLAYER_R + 28;
const SAFE_TIME_MARGIN = 0.25;

/* ===== Globals ===== */
let player = null;
const obstacles = [];
const bonuses = [];
const farStars = [], nearStars = [];
let distSinceSpawn = 0;
let nextGapPx = 360;
let nextBonusScore = 300;
let gemSpawned = false;
let gemTargetScore = 0;
let gemTryCooldown = 0;
let lastObstacleWasSaucer = false;

const skyShips = [];
const fishies = [];
const underShips = [];
const bubbles = [];
let skyShipTimer = 0, fishTimer = 0, underShipTimer = 0, bubbleTimer = 0;

let spawnHoldTimer = 0;
let waitingForSaucerPx = 0;

/* ===== UI (barre aide) ===== */
let howtoBar = null;
function ensureHowtoBar() {
  if (howtoBar) return;
  howtoBar = document.createElement('div');
  howtoBar.id = 'howtoBar';
  howtoBar.innerHTML = 'Espace pour <b>sauter</b> • <b>Ctrl gauche</b> pour s’accroupir • <b>P</b> pour pause';
  Object.assign(howtoBar.style, {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '28px',
    padding: '10px 16px', color: '#e6fbff', font: '14px system-ui, sans-serif',
    background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,240,233,0.35)',
    borderRadius: '9999px', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.35), inset 0 0 20px rgba(56,189,248,0.25)', zIndex: 50
  });
  document.body.appendChild(howtoBar);
}
function setHowtoVisible(show) { ensureHowtoBar(); howtoBar.style.display = show ? 'block' : 'none'; }
function hideOverlayHelpLine() {
  if (!$overlay) return;
  const ps = $overlay.getElementsByTagName('p');
  for (const p of ps) p.style.display = 'none';
}
function syncUI() {
  const isMenu = state === 'menu';
  const isOver = state === 'over';
  const isPaused = state === 'paused';
  if ($overlay) {
    $overlay.hidden = !isMenu;
    $overlay.style.display = isMenu ? 'grid' : 'none';
    if (isMenu) hideOverlayHelpLine();
  }
  if ($restart) $restart.hidden = !isOver;
  if ($pauseOverlay) $pauseOverlay.hidden = !isPaused;
  if ($pause) $pause.textContent = isPaused ? 'Reprendre' : 'Pause';
  setHowtoVisible(isMenu);
}

/* ===== Canvas / sol ===== */
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

/* ===== Parallax étoiles ===== */
function seedStars() {
  farStars.length = 0; nearStars.length = 0;
  const w = canvas.width / (window.devicePixelRatio || 1);
  for (let i = 0; i < 100; i++)
    farStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 1.5 + 0.2 });
  for (let i = 0; i < 40; i++)
    nearStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 2 + 0.8 });
}
seedStars();

/* ===== Vaisseaux (ciel) ===== */
function spawnSkyShip(viewW) {
  const depth = Math.random();
  const w = 90 + Math.random() * 220;
  const h = 22 + Math.random() * 40;
  const y = 40 + Math.random() * Math.max(60, groundY - 160);
  const speed = 28 + (1 - depth) * 120;
  const hue = 170 + Math.random() * 80;
  const model = ['scout','triwing','hauler','ring','beetle'][Math.floor(Math.random()*5)];
  skyShips.push({
    x: viewW + 80, y, w, h, speed, depth, hue, model,
    wobbleA: (Math.random()*0.6+0.2) * (1-depth), wobbleP: Math.random()*Math.PI*2
  });
  if (skyShips.length > 12) skyShips.shift();
}
function drawGreeblesRect(cx, cy, w, h, count, alpha=0.18) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(15,23,42,0.8)';
  ctx.lineWidth = 1;
  for (let i=0;i<count;i++){
    const px = cx - w/2 + 6 + Math.random()*(w-12);
    const py = cy - h/2 + 4 + Math.random()*(h-8);
    const len = 6 + Math.random()*14;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + len, py); ctx.stroke();
  }
  ctx.restore();
}
function engineFlame(x, y, r, len, alpha) {
  const phase = Math.sin(t*8 + x*0.01) * 0.2 + 0.8;
  const L = len * (0.8 + 0.4*phase);
  const grad = ctx.createLinearGradient(x - L, y, x, y);
  grad.addColorStop(0, `rgba(56,189,248,0.0)`);
  grad.addColorStop(0.6, `rgba(56,189,248,${0.35*alpha})`);
  grad.addColorStop(1, `rgba(148,240,233,${0.65*alpha})`);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(x - L/2, y, L/2, r, 0, 0, Math.PI*2); ctx.fill();
}
function cockpitBubble(cx, cy, r, alpha=0.8) {
  const g = ctx.createRadialGradient(cx-r*0.3, cy-r*0.3, r*0.2, cx, cy, r);
  g.addColorStop(0, `rgba(125,211,252,${0.7*alpha})`);
  g.addColorStop(1, `rgba(59,130,246,${0.25*alpha})`);
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(56,189,248,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
}
function drawSkyShip(s, dt) {
  s.x -= s.speed * dt;
  s.wobbleP += dt * (0.8 + s.speed/200);
  const wobble = Math.sin(s.wobbleP) * s.wobbleA * 6;
  const cx = s.x + s.w/2, cy = s.y + s.h/2 + wobble;
  const alpha = 0.28 + (1 - s.depth) * 0.35;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = `hsl(${s.hue} 90% 70%)`;
  ctx.shadowBlur = 12 * (1 - s.depth);

  const hullGrad = ctx.createLinearGradient(s.x, cy, s.x + s.w, cy);
  hullGrad.addColorStop(0, `hsl(${s.hue} 60% 55%)`);
  hullGrad.addColorStop(0.5, `hsl(${s.hue} 95% 80%)`);
  hullGrad.addColorStop(1, `hsl(${s.hue} 60% 55%)`);
  ctx.fillStyle = hullGrad;
  ctx.strokeStyle = `hsl(${s.hue} 70% 38%)`;
  ctx.lineWidth = 1.4;

  ctx.beginPath();
  ctx.moveTo(s.x + s.w*0.1, cy);
  ctx.quadraticCurveTo(s.x + s.w*0.22, cy - s.h*0.9, s.x + s.w*0.50, cy - s.h*0.55);
  ctx.quadraticCurveTo(s.x + s.w*0.82, cy - s.h*0.2, s.x + s.w*0.92, cy);
  ctx.quadraticCurveTo(s.x + s.w*0.82, cy + s.h*0.2, s.x + s.w*0.50, cy + s.h*0.55);
  ctx.quadraticCurveTo(s.x + s.w*0.22, cy + s.h*0.9, s.x + s.w*0.1, cy);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  cockpitBubble(s.x + s.w*0.42, cy - s.h*0.18, Math.min(s.h*0.42, 11), alpha);
  engineFlame(s.x + s.w*0.06, cy, s.h*0.2, s.w*0.22, alpha);
  drawGreeblesRect(cx, cy, s.w*0.9, s.h*0.7, 6, 0.18*alpha);
  ctx.restore();
}

/* ===== Faune & Sous-marins ===== */
function spawnFish(viewW, viewH) {
  const size = 10 + Math.random()*20;
  const y = groundY + 20 + Math.random() * (viewH - groundY - 60);
  const speed = 20 + Math.random()*50;
  const amp = 8 + Math.random()*26;
  const hue = 160 + Math.random()*90;
  fishies.push({ x: viewW + 20, y, baseY: y, size, speed, amp, phase: Math.random()*Math.PI*2, hue });
  if (fishies.length > 22) fishies.shift();
}
function drawFish(f, dt) {
  f.x -= f.speed * dt;
  f.phase += dt * (1.2 + f.speed/60);
  f.y = f.baseY + Math.sin(f.phase) * f.amp;
  const w = f.size*2, h = f.size*1.1;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.shadowColor = `hsl(${f.hue} 100% 75%)`; ctx.shadowBlur = 10;
  ctx.fillStyle = `hsl(${f.hue} 70% 60%)`;
  roundRect(ctx, f.x - w/2, f.y - h/2, w, h, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(f.x + w/2, f.y);
  ctx.lineTo(f.x + w/2 + f.size*0.7, f.y - f.size*0.4);
  ctx.lineTo(f.x + w/2 + f.size*0.7, f.y + f.size*0.4);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.9; ctx.shadowBlur = 0;
  ctx.fillStyle = '#0b2c3a';
  ctx.beginPath(); ctx.arc(f.x - w*0.25, f.y - h*0.15, f.size*0.18, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function spawnUnderShip(viewW, viewH) {
  const w = 90 + Math.random()*160;
  const h = 28 + Math.random()*36;
  const y = groundY + 40 + Math.random() * Math.max(40, viewH - groundY - 120);
  const speed = 22 + Math.random()*50;
  const hue = 190 + Math.random()*40;
  underShips.push({ x: viewW + 60, y, w, h, speed, hue });
  if (underShips.length > 8) underShips.shift();
}
function drawUnderShip(u, dt) {
  u.x -= u.speed * dt;
  const cx = u.x + u.w/2, cy = u.y + u.h/2;
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 12;
  const g = ctx.createLinearGradient(u.x, cy, u.x + u.w, cy);
  g.addColorStop(0, `hsl(${u.hue} 70% 45%)`);
  g.addColorStop(0.6, `hsl(${u.hue} 90% 70%)`);
  g.addColorStop(1, `hsl(${u.hue} 70% 45%)`);
  ctx.fillStyle = g; ctx.strokeStyle = `hsl(${u.hue} 70% 32%)`;
  roundRect(ctx, u.x, u.y, u.w, u.h, 16);
  ctx.fill(); ctx.stroke();
  cockpitBubble(cx - u.w*0.22, cy - u.h*0.02, Math.min(u.h*0.45, 12), 0.9);
  ctx.restore();
}
function spawnBubble(viewW, viewH) {
  const x = Math.random()*viewW;
  bubbles.push({ x, y: groundY + 16 + Math.random()*(viewH-groundY-20), r: 2 + Math.random()*3, vy: 22 + Math.random()*28, life: 1 });
  if (bubbles.length > 80) bubbles.shift();
}
function drawBubble(b, dt) {
  b.y -= b.vy * dt;
  b.life -= dt * 0.3;
  if (b.y < groundY + 6) b.life = 0;
  ctx.save();
  ctx.globalAlpha = Math.max(0, b.life) * 0.7;
  ctx.strokeStyle = 'rgba(148,240,233,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}

/* ===== Décor principal ===== */
function paintBackdrop(dt, gameSpeed) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  const g = ctx.createRadialGradient(w / 2, h * 0.2, 50, w / 2, h * 0.2, h * 0.9);
  g.addColorStop(0, 'rgba(103,232,249,0.20)');
  g.addColorStop(1, 'rgba(244,114,182,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const s of farStars) { s.x -= (gameSpeed*0.12 + 6) * dt; if (s.x < 0) s.x += w; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (const s of nearStars) { s.x -= (gameSpeed*0.35 + 10) * dt; if (s.x < 0) s.x += w; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }

  skyShipTimer -= dt;
  if (skyShipTimer <= 0) { spawnSkyShip(w); skyShipTimer = 1.8 + Math.random()*2.8; }
  for (let i = skyShips.length - 1; i >= 0; i--) { const s = skyShips[i]; drawSkyShip(s, dt); if (s.x + s.w < -60) skyShips.splice(i,1); }

  ctx.fillStyle = 'rgba(103,232,249,0.2)';
  ctx.fillRect(0, groundY - GROUND_BAND_HEIGHT, w, GROUND_BAND_HEIGHT);
  ctx.strokeStyle = '#67e8f9'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 8; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
  ctx.shadowBlur = 0;

  const waterGrad = ctx.createLinearGradient(0, groundY, 0, h);
  waterGrad.addColorStop(0, 'rgba(2, 30, 50, 0.75)');
  waterGrad.addColorStop(1, 'rgba(2, 18, 40, 0.95)');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, groundY, w, h - groundY);

  underShipTimer -= dt;
  if (underShipTimer <= 0) { spawnUnderShip(w, h); underShipTimer = 3 + Math.random()*3.5; }
  for (let i = underShips.length - 1; i >= 0; i--) { const u = underShips[i]; drawUnderShip(u, dt); if (u.x + u.w < -60) underShips.splice(i,1); }

  fishTimer -= dt;
  if (fishTimer <= 0) { spawnFish(w, h); fishTimer = 0.35 + Math.random()*0.65; }
  for (let i = fishies.length - 1; i >= 0; i--) { const f = fishies[i]; drawFish(f, dt); if (f.x < -40) fishies.splice(i,1); }

  bubbleTimer -= dt;
  if (bubbleTimer <= 0) { spawnBubble(w, h); bubbleTimer = 0.04 + Math.random()*0.06; }
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; drawBubble(b, dt); if (b.life <= 0) bubbles.splice(i,1); }
}

/* ===== Joueur (astronaute) ===== */
class Player {
  constructor() {
    this.rBase = PLAYER_R;
    this.rCrouch = CROUCH_R;
    this.r = PLAYER_R;
    this.x = 0; this.y = 0; this.vy = 0;
    this.onGround = true;
    this.crouching = false;
    this.snapToGround();
  }
  snapToGround() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    this.x = Math.floor(w / 5);
    this.r = this.crouching ? this.rCrouch : this.rBase;
    this.y = groundY - this.r;
    this.vy = 0; this.onGround = true;
  }
  setCrouch(on) {
    if (on === this.crouching) return;
    if (!this.onGround && on) return;
    this.crouching = !!on;
    const prevR = this.r;
    this.r = this.crouching ? this.rCrouch : this.rBase;
    if (this.onGround) this.y += (prevR - this.r);
  }
  jump() {
    if (this.onGround && state === 'running') {
      if (this.crouching) this.setCrouch(false);
      this.vy = JUMP_VY; this.onGround = false;
    }
  }
  update(dt) {
    this.vy += GRAVITY * dt; this.y += this.vy * dt;
    const maxY = groundY - this.r;
    if (this.y > maxY) { this.y = maxY; this.vy = 0; this.onGround = true; }
  }
  draw(ctx) {
    const bodyH = this.r * (this.crouching ? 1.6 : 2.0);
    const bodyW = this.r * 1.6;
    const x = this.x - bodyW / 2;
    const y = this.y - bodyH * 0.9;
    ctx.save();
    ctx.shadowColor = '#a7f3d0'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#d1fae5'; ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2;
    roundRect(ctx, x, y, bodyW, bodyH, 8);
    ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(this.x, y + bodyH * 0.33, Math.min(bodyW, bodyH) * 0.22, 0, Math.PI * 2);
    ctx.fill(); ctx.strokeStyle = '#38bdf8'; ctx.stroke();
    ctx.strokeStyle = '#34d399'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 6, y + bodyH * 0.52);
    ctx.lineTo(x - 8, y + bodyH * 0.44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + bodyW - 6, y + bodyH * 0.52);
    ctx.lineTo(x + bodyW + 8, y + bodyH * 0.46); ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.fillRect(x + 6, y + bodyH - 8, 12, 8);
    ctx.fillRect(x + bodyW - 18, y + bodyH - 8, 12, 8);
    ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 18;
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  getAABB() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}
player = new Player();

/* ===== Obstacles ===== */
class Obstacle {
  constructor(x, y, w, h, kind='block', extendUp=0) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.kind = kind; this.extendUp = extendUp;
  }
  update(dt, baseSpeed) { this.x -= baseSpeed * dt; }
  draw(ctx) {
    if (this.kind === 'saucer') {
      const hullCx = this.x + this.w/2;
      const hullCy = this.y + this.h/2;

      const top = this.y + this.h;
      const lethalBottom = Math.max(top + 8, groundY - (2 * CROUCH_R + BEAM_CLEAR_MARGIN));
      const groundTop = groundY - GROUND_BAND_HEIGHT;
      const renderBottom = groundTop - BEAM_GROUND_GAP;
      const bx  = this.x + this.w * 0.16;
      const bw  = this.w * 0.68;
      const bh  = Math.max(8, renderBottom - top);
      const grad = ctx.createLinearGradient(0, top, 0, renderBottom);
      grad.addColorStop(0.00, 'rgba(56,189,248,0.55)');
      grad.addColorStop(0.35, 'rgba(56,189,248,0.30)');
      grad.addColorStop(0.75, 'rgba(56,189,248,0.12)');
      grad.addColorStop(1.00, 'rgba(56,189,248,0.05)');
      ctx.save();
      ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 18;
      ctx.fillStyle   = grad;
      roundRect(ctx, bx, top, bw, bh, 12);
      ctx.fill();
      const phase = (t * 2.0) % 1;
      const sy = top + phase * bh;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(bx + 6, sy, bw - 12, 3);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 12;
      ctx.fillStyle  = 'rgba(56,189,248,0.18)';
      const haloRy = Math.max(3, Math.min(8, BEAM_GROUND_GAP - 6));
      ctx.beginPath();
      ctx.ellipse(bx + bw/2, renderBottom + 2, bw*0.42, haloRy, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = '#94f1e9'; ctx.shadowBlur = 14;
      const gHull = ctx.createLinearGradient(this.x, hullCy, this.x + this.w, hullCy);
      gHull.addColorStop(0,   '#84e1bc');
      gHull.addColorStop(0.5, '#c9ffee');
      gHull.addColorStop(1,   '#84e1bc');
      ctx.fillStyle = gHull; ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(hullCx, hullCy, this.w/2, this.h/2, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      const domeR = Math.min(this.w, this.h) * 0.35;
      const domeCx = hullCx, domeCy = this.y + this.h*0.2;
      const gDome = ctx.createRadialGradient(domeCx, domeCy, 2, domeCx, domeCy, domeR);
      gDome.addColorStop(0, 'rgba(59,130,246,0.55)');
      gDome.addColorStop(1, 'rgba(125,211,252,0.25)');
      ctx.fillStyle = gDome; ctx.strokeStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(domeCx, domeCy, domeR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.ellipse(hullCx, this.y - this.extendUp*0.5, this.w*0.55, this.extendUp, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      this._lethalBottom = lethalBottom;
    } else {
      ctx.fillStyle = '#7dd3fc'; ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2;
      ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 12;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.shadowBlur = 0; ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
  }
  off() { return this.x + this.w < -10; }
  aabb() {
    const up = (this.kind === 'saucer') ? this.extendUp : 0;
    return { x: this.x, y: this.y - up, w: this.w, h: this.h + up };
  }
  beamRect() {
    if (this.kind !== 'saucer') return null;
    const top = this.y + this.h;
    const lethalBottom = this._lethalBottom ?? Math.max(top + 8, groundY - (2 * CROUCH_R + BEAM_CLEAR_MARGIN));
    const x = this.x + this.w * 0.16;
    const w = this.w * 0.68;
    return { x, y: top, w, h: Math.max(8, lethalBottom - top) };
  }
}

/* ===== Bonus ===== */
class Bonus {
  constructor(x, y, r, points, type='coin') {
    this.x = x; this.y = y; this.r = r; this.points = points; this.type = type;
    this.col = type === 'gem' ? '#34d399' : '#ffd166';
    this.stroke = type === 'gem' ? '#059669' : '#ff9f1c';
  }
  update(dt, baseSpeed) { this.x -= baseSpeed * dt; }
  draw(ctx) {
    ctx.shadowColor = this.col; ctx.shadowBlur = 14;
    ctx.fillStyle = this.col; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = this.stroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r - 4, 0, Math.PI * 2); ctx.stroke();
  }
  off() { return this.x + this.r < -10; }
}

/* ===== Utilitaires gameplay ===== */
function timeAboveHeight(h) { const vy = Math.abs(JUMP_VY); const disc = vy*vy - 2*GRAVITY*h; if (disc<=0) return 0; return (2*Math.sqrt(disc))/GRAVITY; }
function maxClearableWidth(speed, h) { const dt = timeAboveHeight(h); if (dt<=0) return 0; const horiz = speed*dt; return Math.max(0, horiz - 2*PLAYER_R - SAFETY); }
function adjustBlockForSpeed(speed, w, h) { let limit = maxClearableWidth(speed, h); if (limit < 18) { let hh = h; while (hh > 12 && maxClearableWidth(speed, hh) < 22) hh -= 6; h = Math.max(12, hh); limit = maxClearableWidth(speed, h); } const newW = Math.min(w, Math.max(18, Math.floor(limit))); return { w:newW, h }; }
function gapFactorByProgress(currentSpeed, currentScore) { if (currentSpeed < 500 || currentScore < 1000) return 0.77; if (currentScore < 3000) return 0.88; const steps = Math.floor((currentScore - 2500) / 500) + 1; let factor = 0.92 * Math.pow(0.97, steps); if (factor < 0.65) factor = 0.65; return factor; }
function maxIdleSeconds(speed, s) { const base = s < 1200 ? 1.9 : (s < 3000 ? 1.75 : 1.6); const cut  = Math.min(0.5, Math.max(0, (speed - 220) / 900) * 0.5); return Math.max(1.0, base - cut); }

/* ===== Gaps dynamiques ===== */
function minGapPxForSpeed(speed) { return Math.round(200 + 0.70 * speed); }
function maxGapPxForViewSpeed(viewW, speed) { return Math.max(260, Math.floor(viewW * 0.5) - 20); }

/* ===== API ===== */
async function loadCatalog() {
  try {
    const [o, b] = await Promise.all([
      fetch(`${API_BASE}/obstacles`).then(r => r.json()),
      fetch(`${API_BASE}/bonuses`).then(r => r.json())
    ]);
    OBSTACLE_DEFS = Array.isArray(o.items) && o.items.length ? o.items : FALLBACK_OBSTACLES;
    BONUS_DEFS    = Array.isArray(b.items) && b.items.length ? b.items : FALLBACK_BONUSES;
    setTimeout(loadCatalog, 60000);
  } catch {
    OBSTACLE_DEFS = FALLBACK_OBSTACLES;
    BONUS_DEFS    = FALLBACK_BONUSES;
    setTimeout(loadCatalog, 30000);
  }
}
loadCatalog();
function pickWeighted(defs) { const total = defs.reduce((s,d)=>s+(d.weight||1),0); let r = Math.random()*total; for (const d of defs){ r -= (d.weight||1); if (r<=0) return d; } return defs[0]; }

/* ===== Obstacles : planification ===== */
function scheduleNextGap(currentSpeed) {
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;

  const base  = currentSpeed * (T_AIR * GAP_COEF) + GAP_BASE;
  const extra = GAP_EXTRA_MIN + Math.random() * (GAP_EXTRA_MAX - GAP_EXTRA_MIN);
  const factor = gapFactorByProgress(currentSpeed, score);
  let gap = (base + extra) * factor;

  const minGap = minGapPxForSpeed(currentSpeed);
  const maxGap = maxGapPxForViewSpeed(viewW, currentSpeed);

  gap = Math.max(240, MIN_PATTERN_GAP * factor, gap);
  gap = Math.max(gap, minGap);
  gap = Math.min(gap, maxGap);

  if (Math.random() < LONG_GAP_CHANCE) {
    gap += LONG_GAP_BONUS_MIN + Math.random()*(LONG_GAP_BONUS_MIN);
    gap = Math.min(gap, maxGap);
  }
  nextGapPx = gap;
}

function addBlockAt(x, w, h) { obstacles.push(new Obstacle(x, groundY - h, w, h, 'block')); lastObstacleWasSaucer = false; }

function addSaucerAt(spawnX, w, h) {
  const standingTop = groundY - 2 * PLAYER_R;
  const marginAboveHead = 110;
  const bottom = standingTop - marginAboveHead;
  const y = Math.max(12, bottom - h);
  const extendUp = Math.max(12, y - 6);
  obstacles.push(new Obstacle(spawnX, y, w, h, 'saucer', extendUp));
  lastObstacleWasSaucer = true;
}

/* spawn immédiat d'une soucoupe quand la marge est prête */
function spawnSaucerNow(currentSpeed) {
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;
  const spawnX = Math.floor(viewW + 12);
  const w = 140 + Math.floor(Math.random() * 90);
  const h = 40 + Math.floor(Math.random() * 22);
  addSaucerAt(spawnX, w, h);
  waitingForSaucerPx = 0;
  scheduleNextGap(currentSpeed);
  nextGapPx = Math.max(nextGapPx, minGapPxForSpeed(currentSpeed));
}

function spawnPattern(currentSpeed) {
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;
  const spawnX = Math.floor(viewW + 12);

  const minGap = minGapPxForSpeed(currentSpeed);
  const maxGap = maxGapPxForViewSpeed(viewW, currentSpeed);

  if (Math.random() < 0.40 && !lastObstacleWasSaucer) {
    let pre = Math.max(220 + 0.70 * currentSpeed, minGap);
    pre = Math.min(pre, maxGap);
    if (distSinceSpawn < pre) {
      waitingForSaucerPx = pre;
      nextGapPx = Math.max(nextGapPx, pre);
      return;
    }
    const w = 140 + Math.floor(Math.random() * 90);
    const h = 40 + Math.floor(Math.random() * 22);
    addSaucerAt(spawnX, w, h);
    waitingForSaucerPx = 0;
    scheduleNextGap(currentSpeed);
    nextGapPx = Math.max(nextGapPx, minGap);
    return;
  }

  const defs = OBSTACLE_DEFS || FALLBACK_OBSTACLES;
  const def = pickWeighted(defs);
  let w = Math.floor(def.wMin + Math.random()*(def.wMax-def.wMin+1));
  let h = Math.floor(def.hMin + Math.random()*(def.hMax-def.hMin+1));
  ({ w, h } = adjustBlockForSpeed(currentSpeed, w, h));
  addBlockAt(spawnX, w, h);
  waitingForSaucerPx = 0;
  scheduleNextGap(currentSpeed);
}

/* ===== Coins / Gem ===== */
function bonusStepFor(s) { return s < 1000 ? 300 : (s < 2000 ? 500 : 1000); }
function computeNextBonusScore(s) { const step = bonusStepFor(s); const n = Math.floor(s/step)+1; return n*step; }
function coinValueNow(currentSpeed, base=50) { const mult = Math.min(3, 1 + currentSpeed/1200); return Math.round(base*mult); }
function timeToNextObstacleSpawn(currentSpeed) { const remainingPx = Math.max(0, nextGapPx - distSinceSpawn); return remainingPx / Math.max(1, currentSpeed); }
function ensureNoSpawnBefore(seconds, currentSpeed) { nextGapPx = Math.max(nextGapPx, distSinceSpawn + currentSpeed * seconds); }
function isSafePickupSpawn(spawnX, currentSpeed) {
  if (!player || currentSpeed<=0) return false;
  const time = (spawnX - player.x) / currentSpeed;
  if (time < BONUS_LEAD_TIME*0.6) return false;
  const left = player.x - PICKUP_SAFE_HORIZ;
  const right = player.x + PICKUP_SAFE_HORIZ;
  for (const o of obstacles) {
    const ox = o.x - currentSpeed * time;
    const oRight = ox + o.w;
    if (oRight < left || ox > right) continue;
    return false;
  }
  return true;
}
function coinMarginsByScore(s) {
  if (s < 1000)  return { pre: 0.045, post: 0.060 };
  if (s < 3000)  return { pre: 0.060, post: 0.085 };
  return           { pre: 0.080, post: 0.120 };
}

/* ===== Pièce : version robuste (clearance & gel de spawn) ===== */
function spawnBonusAtThreshold(currentSpeed) {
  const dpr   = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;
  const defs  = BONUS_DEFS || FALLBACK_BONUSES;
  const coin  = (defs.find(d => d.type === 'coin') ?? defs[0]);

  const r = 14;
  const apex = (Math.abs(JUMP_VY) ** 2) / (2 * GRAVITY);
  const maxH = Math.max(BONUS_MIN_H, Math.min(BONUS_MAX_H_CAP, Math.floor(apex - 12)));

  const CLEAR_POST_OBS = Math.max(36, Math.round(0.11 * currentSpeed));
  const MIN_POST_PX_BASE = 200;
  const EXIT_AFTER_BEAM_BASE = 260;

  for (let attempt = 0; attempt < 10; attempt++) {
    const leadX = Math.max(0, currentSpeed * (BONUS_LEAD_TIME + attempt * 0.17));
    let coinX   = Math.floor(viewW + 12 + leadX);
    let hAbove  = BONUS_MIN_H + Math.random() * (maxH - BONUS_MIN_H);
    let coinY   = Math.max(groundY - hAbove, r + 4);

    if (!isSafePickupSpawn(coinX, currentSpeed)) continue;

    let tPickup = (coinX - player.x) / Math.max(1, currentSpeed);

    let forcedGround = false;
    let beamRightAtPickup = -Infinity;
    for (const o of obstacles) {
      if (o.kind !== 'saucer') continue;
      const ox = o.x - currentSpeed * tPickup;
      const top = o.y + o.h;
      const lethalBottom = Math.max(top + 8, groundY - (2 * CROUCH_R + BEAM_CLEAR_MARGIN));
      const bx = ox + o.w * 0.16;
      const bw = o.w * 0.68;
      const by = top, bh = Math.max(8, lethalBottom - top);
      const inX = coinX + r > bx && coinX - r < bx + bw;
      const inY = coinY + r > by && coinY - r < by + bh;
      if (inX && inY) { coinY = groundY - (r + 2); forcedGround = true; }
      beamRightAtPickup = Math.max(beamRightAtPickup, bx + bw);
    }

    let tooCloseToBlock = false;
    for (const o of obstacles) {
      if (o.kind !== 'block') continue;
      const ox = o.x - currentSpeed * tPickup;
      const oRight = ox + o.w;
      if (oRight > player.x && (coinX - oRight) < CLEAR_POST_OBS) { tooCloseToBlock = true; break; }
    }
    if (tooCloseToBlock) continue;

    bonuses.push(new Bonus(coinX, coinY, r, coin.points, 'coin'));

    const m = coinMarginsByScore(score);
    const fallT   = Math.sqrt(2 * Math.max(0, groundY - coinY - PLAYER_R * 0.5) / GRAVITY);
    const landBuf = 0.16;
    const runAfterCrouchPx = forcedGround ? Math.max(280, Math.round(200 + 0.70 * currentSpeed)) : 0;
    const holdSeconds = Math.max(m.pre, landBuf + 0.80 * fallT) + (runAfterCrouchPx / Math.max(1, currentSpeed));

    spawnHoldTimer = Math.max(spawnHoldTimer, holdSeconds);
    const minAfter = distSinceSpawn + currentSpeed * (tPickup + holdSeconds);
    nextGapPx = Math.max(nextGapPx, minAfter);

    const minGap = minGapPxForSpeed(currentSpeed);
    const maxGap = maxGapPxForViewSpeed(viewW, currentSpeed);

    const minPostPxSpeed   = Math.round(200 + 0.65 * currentSpeed);
    const minPostPx        = Math.max(MIN_POST_PX_BASE, minPostPxSpeed);
    const exitAfterBeamPx  = Math.max(EXIT_AFTER_BEAM_BASE, Math.round(220 + 0.85 * currentSpeed));

    let obstacleX = coinX + Math.max(minPostPx, runAfterCrouchPx);
    if (beamRightAtPickup > -Infinity) obstacleX = Math.max(obstacleX, beamRightAtPickup + exitAfterBeamPx);

    const minSpawnX = Math.floor(viewW + 12 + Math.max(0, minGap - distSinceSpawn));
    const maxSpawnX = Math.floor(viewW + 12 + Math.max(0, maxGap - distSinceSpawn));
    obstacleX = Math.max(obstacleX, minSpawnX);
    obstacleX = Math.min(obstacleX, maxSpawnX);

    nextGapPx = Math.max(nextGapPx, obstacleX - 12);
    return;
  }
}

function pickGemTargetScore() { return Math.floor(800 + Math.random() * (2200 - 800 + 1)); }
function trySpawnGem(currentSpeed) {
  if (gemSpawned || score < gemTargetScore || gemTryCooldown > 0) return;
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;

  const defs = BONUS_DEFS || FALLBACK_BONUSES;
  const gemDef = (defs.find(d => d.type === 'gem') ?? { points: 120 });
  const r = 16;
  const apex = (Math.abs(JUMP_VY) ** 2) / (2 * GRAVITY);
  const maxH = Math.max(BONUS_MIN_H, Math.min(BONUS_MAX_H_CAP, Math.floor(apex - 16)));

  for (let attempt = 0; attempt < 8; attempt++) {
    const leadX = Math.max(0, currentSpeed * (Math.max(BONUS_LEAD_TIME, 0.8) + attempt * 0.18));
    const spawnX = Math.floor(viewW + 12 + leadX);
    const hAbove = BONUS_MIN_H + Math.random() * (maxH - BONUS_MIN_H);
    const y = Math.max(groundY - hAbove, r + 4);
    const timeToPickup = (spawnX - player.x) / Math.max(1, currentSpeed);
    if (!isSafePickupSpawn(spawnX, currentSpeed)) continue;
    if (timeToNextObstacleSpawn(currentSpeed) <= timeToPickup + SAFE_TIME_MARGIN) {
      ensureNoSpawnBefore(timeToPickup + SAFE_TIME_MARGIN, currentSpeed);
    }
    bonuses.push(new Bonus(spawnX, y, r, gemDef.points, 'gem'));
    gemSpawned = true;
    return;
  }
  gemTryCooldown = 0.6;
}

/* ===== Collisions ===== */
function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function circleHit(x1,y1,r1,x2,y2,r2) { const dx=x1-x2, dy=y1-y2; return dx*dx + dy*dy <= (r1+r2)*(r1+r2); }

/* ===== États ===== */
function gameOver() { state = 'over'; syncUI(); }

function resetStateCommon() {
  score = 0; t = 0;
  obstacles.length = 0; bonuses.length = 0;
  distSinceSpawn = 0; nextGapPx = 360;
  nextBonusScore = computeNextBonusScore(0);
  gemSpawned = false; gemTargetScore = pickGemTargetScore(); gemTryCooldown = 0;
  lastObstacleWasSaucer = false;
  spawnHoldTimer = 0;
  waitingForSaucerPx = 0;

  if (!player) player = new Player();
  player.setCrouch(false);
  player.snapToGround();

  const speed0 = difficultySpeed(0);
  const minGap0 = minGapPxForSpeed(speed0);
  distSinceSpawn = Math.min(minGap0 - 80, Math.floor(minGap0 * 0.6));
}

function resetGame() { resetStateCommon(); state = 'running'; syncUI(); }
function startFromMenu() { resetStateCommon(); state = 'running'; syncUI(); }

/* ===== Boucle ===== */
let last = performance.now();
function loop(now = performance.now()) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  const speed = difficultySpeed(t);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintBackdrop(dt, state === 'running' ? speed : 0);

  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;

  if (state === 'running') {
    t += dt;
    score += dt * (10 + speed * 0.03);
    player.update(dt);

    distSinceSpawn += speed * dt;

    if (spawnHoldTimer > 0) {
      spawnHoldTimer -= dt;
    } else {
      const idleMaxPx = speed * maxIdleSeconds(speed, score);
      const minGap = minGapPxForSpeed(speed);
      const maxGap = maxGapPxForViewSpeed(viewW, speed);

      let thresholdPx = nextGapPx;
      if (waitingForSaucerPx === 0) thresholdPx = Math.min(nextGapPx, idleMaxPx);
      thresholdPx = Math.max(thresholdPx, minGap);
      thresholdPx = Math.min(thresholdPx, maxGap);

      if (distSinceSpawn >= thresholdPx) {
        if (waitingForSaucerPx > 0 && distSinceSpawn >= waitingForSaucerPx) {
          spawnSaucerNow(speed);
          distSinceSpawn = 0;
        } else {
          distSinceSpawn = 0;
          spawnPattern(speed);
        }
      }
    }

    if (Math.floor(score) >= nextBonusScore) {
      spawnBonusAtThreshold(speed);
      nextBonusScore = computeNextBonusScore(score);
    }

    if (gemTryCooldown > 0) gemTryCooldown -= dt;
    trySpawnGem(speed);

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.update(dt, speed);
      if (o.kind === 'saucer') {
        const beam = o.beamRect && o.beamRect();
        if (beam && hit(player.getAABB(), beam) && !player.crouching) { gameOver(); break; }
      }
      o.draw(ctx);
      if (o.off()) { obstacles.splice(i, 1); continue; }
      if (hit(player.getAABB(), o.aabb())) { gameOver(); break; }
    }

    for (let i = bonuses.length - 1; i >= 0; i--) {
      const b = bonuses[i];
      b.update(dt, speed); b.draw(ctx);
      if (b.off()) { bonuses.splice(i, 1); continue; }
      if (circleHit(player.x, player.y, player.r, b.x, b.y, b.r)) {
        const base = b.points;
        const gain = b.type === 'coin' ? coinValueNow(speed, base) : base;
        score += gain;
        bonuses.splice(i, 1);
      }
    }
  } else {
    for (const o of obstacles) o.draw(ctx);
    for (const b of bonuses) b.draw(ctx);
    if (state === 'over') {
      const w = canvas.width / (window.devicePixelRatio || 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, w, groundY);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 32px system-ui,sans-serif'; ctx.fillText('Game Over', w / 2, groundY - 84);
      ctx.font = '16px system-ui,sans-serif'; ctx.fillText('Espace pour rejouer', w / 2, groundY - 52);
    }
  }

  player.draw(ctx);
  $score.textContent = String(Math.floor(score));
  $speed.textContent = String(Math.round(speed));

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ===== Entrées ===== */
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
  if (e.code === 'ControlLeft') {
    if (state === 'running') player.setCrouch(true);
  }
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (state === 'menu') startFromMenu();
    else if (state === 'running') player.jump();
    else if (state === 'over') resetGame();
  }
}, { passive: false });

window.addEventListener('keyup', (e) => {
  if (e.code === 'ControlLeft') {
    if (state === 'running') player.setCrouch(false);
  }
});
window.addEventListener('touchstart', () => {
  if (state === 'menu') startFromMenu();
  else if (state === 'running') player.jump();
  else if (state === 'over') resetGame();
}, { passive: true });

syncUI();
