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

/* ===== API (fallback si off) ===== */
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

/* ===== Physique / gameplay ===== */
const GRAVITY = 2200;
const JUMP_VY = -950;
const PLAYER_R = 22;
const CROUCH_SCALE = 0.6;
const CROUCH_R = Math.floor(PLAYER_R * CROUCH_SCALE);
const SAFETY = 18;
const T_AIR = (2 * Math.abs(JUMP_VY)) / GRAVITY;
function difficultySpeed(s) { return 220 + 14 * s; }

/* ===== Réglages soucoupe / rayon ===== */
const BEAM_CLEAR_MARGIN = 6;   // tolérance sous la hitbox du rayon (pour crouch)
const GROUND_BAND_HEIGHT = 10; // doit matcher la bande dans paintBackdrop
const BEAM_GROUND_GAP   = 28;  // espace visuel entre bas du rayon et haut de la bande sol

/* Espacement obstacles */
const GAP_COEF = 0.85, GAP_BASE = 140;
const GAP_EXTRA_MIN = 100, GAP_EXTRA_MAX = 420;
const MIN_PATTERN_GAP = 360;
const LONG_GAP_CHANCE = 0.22;
const LONG_GAP_BONUS_MIN = 160, LONG_GAP_BONUS_MAX = 420;

/* Bonus/pickups */
const BONUS_LEAD_TIME = 0.65;
const BONUS_MIN_H = 50, BONUS_MAX_H_CAP = 150;
const PICKUP_SAFE_HORIZ = PLAYER_R + 28;

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

/* ===== UI ===== */
/* Bandeau "comment jouer" (unique) */
let howtoBar = null;
function ensureHowtoBar() {
  if (howtoBar) return;
  howtoBar = document.createElement('div');
  howtoBar.id = 'howtoBar';
  howtoBar.innerHTML = 'Espace pour <b>sauter</b> • <b>Ctrl gauche</b> pour s’accroupir • <b>P</b> pour pause';
  Object.assign(howtoBar.style, {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: '28px',
    padding: '10px 16px',
    color: '#e6fbff',
    font: '14px system-ui, sans-serif',
    background: 'rgba(15,23,42,0.55)',
    border: '1px solid rgba(148,240,233,0.35)',
    borderRadius: '9999px',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.35), inset 0 0 20px rgba(56,189,248,0.25)',
    zIndex: 50
  });
  document.body.appendChild(howtoBar);
}
function setHowtoVisible(show) {
  ensureHowtoBar();
  howtoBar.style.display = show ? 'block' : 'none';
}
function hideOverlayHelpLine() {
  if (!$overlay) return;
  // on masque les <p> d'aide dans la carte du menu (évite le doublon)
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
  setHowtoVisible(isMenu); // bandeau uniquement sur l'écran de début
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

/* ===== Parallax ===== */
function seedStars() {
  farStars.length = 0; nearStars.length = 0;
  const w = canvas.width / (window.devicePixelRatio || 1);
  for (let i = 0; i < 100; i++)
    farStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 1.5 + 0.2 });
  for (let i = 0; i < 40; i++)
    nearStars.push({ x: Math.random() * w, y: Math.random() * groundY, r: Math.random() * 2 + 0.8 });
}
seedStars();

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

  ctx.fillStyle = 'rgba(103,232,249,0.2)';      // bande cyan (10px)
  ctx.fillRect(0, groundY - GROUND_BAND_HEIGHT, w, GROUND_BAND_HEIGHT);
  ctx.strokeStyle = '#67e8f9'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 8; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
  ctx.shadowBlur = 0;
}

/* ===== Joueur : ASTRONAUTE ===== */
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
    if (!this.onGround && on) return; // pas de duck en l'air
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
    ctx.fill();
    ctx.strokeStyle = '#38bdf8'; ctx.stroke();

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

/* instancier le joueur */
player = new Player();

/* ===== Helper coins arrondis ===== */
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

/* ===== Obstacles ===== */
class Obstacle {
  constructor(x, y, w, h, kind='block', extendUp=0) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.kind = kind;
    this.extendUp = extendUp; // dôme de force au-dessus (anti-saut)
  }
  update(dt, baseSpeed) { this.x -= baseSpeed * dt; }

  draw(ctx) {
    if (this.kind === 'saucer') {
      const hullCx = this.x + this.w/2;
      const hullCy = this.y + this.h/2;

      /* === Rayon : rendu au-dessus du sol, hitbox plus haut (crouch obligatoire) === */
      const top = this.y + this.h;

      // hitbox létale : tu meurs si pas accroupi
      const lethalBottom = Math.max(
        top + 8,
        groundY - (2 * CROUCH_R + BEAM_CLEAR_MARGIN)
      );
      // rendu visuel arrêté AVANT la bande cyan du sol
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

      // scanline
      const phase = (t * 2.0) % 1;
      const sy = top + phase * bh;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(bx + 6, sy, bw - 12, 3);
      ctx.globalAlpha = 1;

      // halo au bas du rayon (au-dessus de la bande)
      ctx.shadowBlur = 12;
      ctx.fillStyle  = 'rgba(56,189,248,0.18)';
      const haloRy = Math.max(3, Math.min(8, BEAM_GROUND_GAP - 6));
      ctx.beginPath();
      ctx.ellipse(bx + bw/2, renderBottom + 2, bw*0.42, haloRy, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      /* === Soucoupe === */
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

      const lamps = 7;
      for (let i=0;i<lamps;i++){
        const px = this.x + this.w*0.10 + (i/(lamps-1)) * this.w*0.80;
        const py = this.y + this.h*0.65;
        ctx.fillStyle = 'rgba(250,250,210,' + (0.6 + 0.4*Math.random()) + ')';
        ctx.beginPath(); ctx.ellipse(px, py, 6, 4, 0, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();

      // dôme visuel au-dessus (anti-saut)
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#67e8f9';
      ctx.beginPath();
      ctx.ellipse(hullCx, this.y - this.extendUp*0.5, this.w*0.55, this.extendUp, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // garder la limite létale pour beamRect()
      this._lethalBottom = lethalBottom;

    } else {
      // Bloc
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
    const lethalBottom = this._lethalBottom ?? Math.max(
      top + 8,
      groundY - (2 * CROUCH_R + BEAM_CLEAR_MARGIN)
    );
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

/* ===== Utilitaires ===== */
function timeAboveHeight(h) {
  const vy = Math.abs(JUMP_VY);
  const disc = vy * vy - 2 * GRAVITY * h;
  if (disc <= 0) return 0;
  return (2 * Math.sqrt(disc)) / GRAVITY;
}
function maxClearableWidth(speed, h) {
  const dt = timeAboveHeight(h);
  if (dt <= 0) return 0;
  const horiz = speed * dt;
  return Math.max(0, horiz - 2 * PLAYER_R - SAFETY);
}
function adjustBlockForSpeed(speed, w, h) {
  let limit = maxClearableWidth(speed, h);
  if (limit < 18) {
    let hh = h;
    while (hh > 12 && maxClearableWidth(speed, hh) < 22) hh -= 6;
    h = Math.max(12, hh);
    limit = maxClearableWidth(speed, h);
  }
  const newW = Math.min(w, Math.max(18, Math.floor(limit)));
  return { w: newW, h };
}
function gapFactorByProgress(currentSpeed, currentScore) {
  if (currentSpeed < 500 || currentScore < 1000) return 0.77;
  if (currentScore < 3000) return 0.88;
  const steps = Math.floor((currentScore - 2500) / 500) + 1;
  let factor = 0.92 * Math.pow(0.97, steps);
  if (factor < 0.65) factor = 0.65;
  return factor;
}

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
function pickWeighted(defs) {
  const total = defs.reduce((s,d)=>s+(d.weight||1),0);
  let r = Math.random() * total;
  for (const d of defs) { r -= (d.weight||1); if (r <= 0) return d; }
  return defs[0];
}

/* ===== Obstacles : génération ===== */
function scheduleNextGap(currentSpeed) {
  const base  = currentSpeed * (T_AIR * GAP_COEF) + GAP_BASE;
  const extra = GAP_EXTRA_MIN + Math.random() * (GAP_EXTRA_MAX - GAP_EXTRA_MIN);
  const factor = gapFactorByProgress(currentSpeed, score);
  let gap = (base + extra) * factor;

  const hardFloor = 240;
  const scaledFloor = MIN_PATTERN_GAP * factor;
  gap = Math.max(hardFloor, scaledFloor, gap);

  if (Math.random() < LONG_GAP_CHANCE) {
    const bonus = LONG_GAP_BONUS_MIN + Math.random() * (LONG_GAP_BONUS_MAX - LONG_GAP_BONUS_MIN);
    gap += bonus;
  }
  nextGapPx = gap;
}

function addBlockAt(x, w, h) {
  const y = groundY - h;
  obstacles.push(new Obstacle(x, y, w, h, 'block'));
}

/* Soucoupe plus haute + large, dôme anti-saut, rayon rendu au-dessus du sol */
function addSaucerAt(spawnX, w, h) {
  // place AU-DESSUS de la tête debout
  const standingTop = groundY - 2 * PLAYER_R;
  const marginAboveHead = 110;
  const bottom = standingTop - marginAboveHead;
  const y = Math.max(12, bottom - h);

  const extendUp = Math.max(12, y - 6); // dôme au-dessus
  obstacles.push(new Obstacle(spawnX, y, w, h, 'saucer', extendUp));
}

function spawnPattern(currentSpeed) {
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;
  const spawnX = Math.floor(viewW + 12);

  if (Math.random() < 0.35) {
    const w = 140 + Math.floor(Math.random() * 90); // 140–230
    const h = 40 + Math.floor(Math.random() * 22);  // 40–62
    addSaucerAt(spawnX, w, h);
    scheduleNextGap(currentSpeed);
    return;
  }

  const defs = OBSTACLE_DEFS || FALLBACK_OBSTACLES;
  const def = pickWeighted(defs);
  let w = Math.floor(def.wMin + Math.random() * (def.wMax - def.wMin + 1));
  let h = Math.floor(def.hMin + Math.random() * (def.hMax - def.hMin + 1));
  ({ w, h } = adjustBlockForSpeed(currentSpeed, w, h));
  addBlockAt(spawnX, w, h);
  scheduleNextGap(currentSpeed);
}

/* ===== Pièces / Gemme ===== */
function bonusStepFor(s) { return s < 1000 ? 300 : (s < 2000 ? 500 : 1000); }
function computeNextBonusScore(s) {
  const step = bonusStepFor(s);
  const n = Math.floor(s / step) + 1;
  return n * step;
}
function coinValueNow(currentSpeed, base = 50) {
  const mult = Math.min(3, 1 + currentSpeed / 1200);
  return Math.round(base * mult);
}

function isSafePickupSpawn(spawnX, currentSpeed) {
  if (!player || currentSpeed <= 0) return false;
  const time = (spawnX - player.x) / currentSpeed;
  if (time < BONUS_LEAD_TIME * 0.6) return false;
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

function spawnBonusAtThreshold(currentSpeed) {
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.width / dpr;

  const defs = BONUS_DEFS || FALLBACK_BONUSES;
  const coin = (defs.find(d => d.type === 'coin') ?? defs[0]);
  const r = 14;
  const apex = (Math.abs(JUMP_VY) ** 2) / (2 * GRAVITY);
  const maxH = Math.max(BONUS_MIN_H, Math.min(BONUS_MAX_H_CAP, Math.floor(apex - 12)));

  for (let attempt = 0; attempt < 6; attempt++) {
    const leadX = Math.max(0, currentSpeed * (BONUS_LEAD_TIME + attempt * 0.15));
    const spawnX = Math.floor(viewW + 12 + leadX);
    const hAbove = BONUS_MIN_H + Math.random() * (maxH - BONUS_MIN_H);
    const y = Math.max(groundY - hAbove, r + 4);
    if (!isSafePickupSpawn(spawnX, currentSpeed)) continue;
    bonuses.push(new Bonus(spawnX, y, r, coin.points, 'coin'));
    return;
  }
}

function pickGemTargetScore() {
  const min = 800, max = 2200;
  return Math.floor(min + Math.random() * (max - min + 1));
}
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
    if (!isSafePickupSpawn(spawnX, currentSpeed)) continue;
    bonuses.push(new Bonus(spawnX, y, r, gemDef.points, 'gem'));
    gemSpawned = true;
    return;
  }
  gemTryCooldown = 0.6;
}

/* ===== Collisions ===== */
function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function circleHit(x1,y1,r1, x2,y2,r2) {
  const dx = x1 - x2, dy = y1 - y2;
  return dx*dx + dy*dy <= (r1 + r2) * (r1 + r2);
}

/* ===== États ===== */
function gameOver() { state = 'over'; syncUI(); }
function resetStateCommon() {
  score = 0; t = 0;
  obstacles.length = 0; bonuses.length = 0;

  distSinceSpawn = 0;
  nextGapPx = 360;
  nextBonusScore = computeNextBonusScore(0);

  gemSpawned = false;
  gemTargetScore = pickGemTargetScore();
  gemTryCooldown = 0;

  if (!player) player = new Player();
  player.setCrouch(false);
  player.snapToGround();
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

  if (state === 'running') {
    t += dt;
    score += dt * (10 + speed * 0.03);
    player.update(dt);

    // Obstacles
    distSinceSpawn += speed * dt;
    if (distSinceSpawn >= nextGapPx) { distSinceSpawn = 0; spawnPattern(speed); }

    // Pièces
    if (Math.floor(score) >= nextBonusScore) {
      spawnBonusAtThreshold(speed);
      nextBonusScore = computeNextBonusScore(score);
    }

    // Gemme
    if (gemTryCooldown > 0) gemTryCooldown -= dt;
    trySpawnGem(speed);

    // Dessin + rayon létal + collisions
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.update(dt, speed);

      if (o.kind === 'saucer') {
        const beam = o.beamRect && o.beamRect();
        if (beam && hit(player.getAABB(), beam)) {
          if (!player.crouching) { gameOver(); break; } // mort si pas accroupi
        }
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

  if (player) player.draw(ctx);
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
  // Crouch : CTRL GAUCHE uniquement
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
