'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $score = document.getElementById('score');
const $speed = document.getElementById('speed');
const $pause = document.getElementById('pause');
const $restart = document.getElementById('restart');
const $overlay = document.getElementById('overlay');
const $start = document.getElementById('start');

let state = 'menu'; // 'menu' | 'running' | 'paused' | 'over'
let groundY = 0;

function resizeCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.style.width = w+'px';
  canvas.style.height = h+'px';
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  groundY = Math.floor(h * 0.8);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// décor de fond simple
function paintBackdrop(){
  const w = canvas.width/(window.devicePixelRatio||1);
  const h = canvas.height/(window.devicePixelRatio||1);

  // halo doux
  const g = ctx.createRadialGradient(w/2, h*0.2, 50, w/2, h*0.2, h*0.9);
  g.addColorStop(0,'rgba(103,232,249,0.15)');
  g.addColorStop(1,'rgba(244,114,182,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // ligne de sol
  ctx.strokeStyle = '#1f2a44';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
}

function drawFrame(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  paintBackdrop();
}
drawFrame();

// UI
$start.addEventListener('click', ()=>{ state='running'; $overlay.hidden=true; });
$pause.addEventListener('click', ()=>{
  if(state==='running'){ state='paused'; $pause.textContent='Reprendre'; }
  else if(state==='paused'){ state='running'; $pause.textContent='Pause'; }
});
$restart.addEventListener('click', ()=>{ /* câblé plus tard */ });
