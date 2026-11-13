import * as THREE from 'three';
import { PLAYER, WEAPONS as WSTATS, MAPS, ECO, TEAMS, MATCH, RECOIL } from './shared.js';

/* =====================================================
   BLOCKY STRIKE  -  Paso 3: multijugador
   Modos:  'solo' = práctica contra bots
           'mp'   = online con otros jugadores (el servidor valida disparos y daño)
   ===================================================== */

const CFG = {
  speed: 6.2, walkSpeed: 3.2, jump: 8.2, gravity: 24,
  radius: PLAYER.radius, height: PLAYER.height, eye: PLAYER.eye, step: PLAYER.step,
  playerRespawn: PLAYER.respawn, killHeal: PLAYER.killHeal,
  // modo solo (ajusta estos valores para hacerlo más fácil o difícil)
  bots: 6, botHp: 100, botDamage: 9, botSpeed: 3.6, botRespawn: 5,
};

const $ = id => document.getElementById(id);
const overlay = $('overlay'), hitEl = $('hit'), msgEl = $('msg'), dmgEl = $('dmg');
const deathEl = $('death'), deathTxt = $('deathtxt'), feedEl = $('feed');
const boardEl = $('board'), chatLog = $('chatlog'), chatIn = $('chatin');
const r3 = v => Math.round(v * 1000) / 1000;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let mode = 'menu';   // 'menu' | 'solo' | 'mp' | 'ended'

/* ---------- Escena ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e0);
scene.fog = new THREE.Fog(0x87b8e0, 55, 150);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

// Iluminación más rica (cielo + sol + relleno)
const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x6b5a40, 0.85);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x404850, 0.22);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff0d4, 1.45);
sun.position.set(35, 55, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 150 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9bb8e0, 0.35);
fill.position.set(-25, 18, -15);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe0b0, 0.15);
rim.position.set(0, 10, 40);
scene.add(rim);

// Cielo en gradiente (esfera grande)
function makeSky(skyHex) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  const top = new THREE.Color(skyHex).offsetHSL(0.02, 0.05, 0.12);
  const mid = new THREE.Color(skyHex);
  const bot = new THREE.Color(skyHex).offsetHSL(-0.02, -0.05, -0.08);
  g.addColorStop(0, '#' + top.getHexString());
  g.addColorStop(0.45, '#' + mid.getHexString());
  g.addColorStop(1, '#' + bot.getHexString());
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false })
  );
  sky.name = 'sky';
  return sky;
}
let skyMesh = makeSky(0x87b8e0);
scene.add(skyMesh);

// Textura procedural del suelo (ruido suave)
function makeGroundTex(baseHex) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const v = (Math.random() - 0.5) * 28;
    const col = base.clone().offsetHSL(0, 0, v / 255);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  // rejilla suave
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function matWorld(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.82, metalness: 0.04,
  });
}
function matChar(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.7, metalness: 0.08,
  });
}

// Calidad gráfica: 0 baja (más FPS), 1 media, 2 alta
let gfxQuality = 2;
try {
  const g = parseInt(localStorage.getItem('bs_gfx'), 10);
  if (g === 0 || g === 1 || g === 2) gfxQuality = g;
} catch (e) {}

function applyGfxQuality(q) {
  gfxQuality = q;
  const pr = q === 0 ? Math.min(devicePixelRatio, 1) : q === 1 ? Math.min(devicePixelRatio, 1.75) : Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  const shadows = q > 0;
  renderer.shadowMap.enabled = shadows;
  sun.castShadow = shadows;
  if (shadows) {
    const size = q === 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    renderer.shadowMap.type = q === 2 ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  }
  renderer.toneMappingExposure = q === 0 ? 1.08 : q === 1 ? 1.18 : 1.28;
  hemi.intensity = q === 0 ? 0.7 : 0.85;
  sun.intensity = q === 0 ? 1.1 : q === 1 ? 1.3 : 1.45;
  try { localStorage.setItem('bs_gfx', String(q)); } catch (e) {}
  const sel = $('gfxsel');
  if (sel) sel.value = String(q);
}
applyGfxQuality(gfxQuality);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- Mapa (los datos vienen de shared.js, igual que en el servidor) ---------- */
const solids = [];       // cajas de colisión
const worldMeshes = [];  // mallas del mundo (para disparos y línea de visión)
const decals = [];       // marcas de bala (máx. MAX_HOLES)
let rayTargets = [];     // mundo + bots + jugadores (para raycast de disparos)

function addBox(cx, cz, w, d, h, color, y0 = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    matWorld(color)
  );
  mesh.position.set(cx, y0 + h / 2, cz);
  mesh.castShadow = mesh.receiveShadow = true;
  // variación sutil para que no se vea todo igual
  mesh.material.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
  mesh.material.roughness = 0.75 + Math.random() * 0.18;
  scene.add(mesh);
  worldMeshes.push(mesh);
  solids.push({ x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 });
}

let MAP = MAPS.dust;
let groundMesh = null;
let bombState = null; // { state, carrier, x, z, site, explodesAt, plantProg, defuseProg }
let bombMesh = null;
let siteMarkers = [];
let bombBeepT = 0;   // temporizador del pitido acelerado de la bomba

// Construye (o reconstruye) el mundo con el mapa elegido
function loadMap(key) {
  MAP = MAPS[key] || MAPS.dust;
  for (const m of worldMeshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  worldMeshes.length = 0;
  solids.length = 0;
  // limpiar marcas de bala al cambiar de mapa
  for (const d of decals) { scene.remove(d); d.material.dispose(); }
  decals.length = 0;
  scene.background = new THREE.Color(MAP.sky);
  scene.fog = new THREE.Fog(MAP.sky, 55, 155);
  // cielo en gradiente
  if (skyMesh) { scene.remove(skyMesh); skyMesh.material.map?.dispose(); skyMesh.material.dispose(); skyMesh.geometry.dispose(); }
  skyMesh = makeSky(MAP.sky);
  scene.add(skyMesh);
  const gTex = makeGroundTex(MAP.ground);
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ map: gTex, color: 0xffffff, roughness: 0.92, metalness: 0.0 })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  worldMeshes.push(groundMesh);
  for (const b of MAP.boxes) addBox(...b);
  buildSiteMarkers();
  bombState = null;
  bombBeepT = 0;
  if (bombMesh) bombMesh.visible = false;
  rayTargets = [...worldMeshes];
}
loadMap('dust');

/* ---------- Física compartida (jugador y bots) ---------- */
function hits(x, y, z) {
  const r = CFG.radius, h = CFG.height;
  for (const b of solids) {
    if (x + r > b.x0 && x - r < b.x1 &&
        y + h > b.y0 && y < b.y1 - 0.001 &&
        z + r > b.z0 && z - r < b.z1) return b;
  }
  return null;
}

// e = { pos, vx, vy, vz, onGround }
function slide(e, axis, d) {
  const p = e.pos;
  const nx = axis === 'x' ? p.x + d : p.x;
  const nz = axis === 'z' ? p.z + d : p.z;
  const b = hits(nx, p.y, nz);
  if (!b) { p.x = nx; p.z = nz; return; }
  // intentar subir un escalón
  if (e.onGround && b.y1 - p.y <= CFG.step && !hits(nx, b.y1, nz)) {
    p.x = nx; p.z = nz; p.y = b.y1;
  } else if (axis === 'x') e.vx = 0;
  else e.vz = 0;
}

function gravityStep(e, dt) {
  const p = e.pos;
  e.vy -= CFG.gravity * dt;
  const ny = p.y + e.vy * dt;
  const b = hits(p.x, ny, p.z);
  if (b) {
    if (e.vy < 0) { p.y = b.y1; e.onGround = true; }
    e.vy = 0;
  } else { p.y = ny; e.onGround = false; }
  if (p.y <= 0) { p.y = 0; e.vy = 0; e.onGround = true; }
}

/* ---------- Jugador ---------- */
const bots = [];
const player = {
  pos: new THREE.Vector3(), vx: 0, vy: 0, vz: 0, onGround: false,
  yaw: 0, pitch: 0, hp: 100, kills: 0, deaths: 0,
  dead: false, respawnT: 0, killer: '',
};

function pickPlayerSpawn() {
  let best = MAP.spawns[0], bestD = -1;
  for (const s of MAP.spawns) {
    let md = 1e9;
    for (const b of bots) if (b.alive) md = Math.min(md, Math.hypot(s[0] - b.pos.x, s[1] - b.pos.z));
    if (md > bestD) { bestD = md; best = s; }
  }
  return best;
}

function placePlayer() {
  const s = pickPlayerSpawn();
  player.pos.set(s[0], 0, s[1]);
  player.vx = player.vy = player.vz = 0;
  player.yaw = s[1] > 0 ? 0 : Math.PI;
  player.pitch = 0;
  player.hp = 100;
}
placePlayer();

const keys = {};
let locked = false, mouseDown = false, trigger = false;

/* ---------- Armas (estadísticas en shared.js, aspecto y sonido aquí) ---------- */
const LOOKS = [
  // 0 knife
  { recoil: 0.01, kick: 0.6, vol: 0.15, rate2: 1.2, muzzleZ: -0.4,
    parts: [[0.04, 0.02, 0.28, 0, 0.02, -0.05, 0xcccccc], [0.05, 0.08, 0.1, 0, -0.02, 0.12, 0x4a3320]] },
  // 1 pistol
  { recoil: 0.025, kick: 1.3, vol: 0.28, rate2: 1.3, muzzleZ: -0.34,
    parts: [[0.05, 0.09, 0.3, 0, 0, 0, 0x2b2b2b], [0.045, 0.05, 0.28, 0, 0.07, -0.02, 0x3a3a3a],
            [0.05, 0.14, 0.07, 0, -0.1, 0.1, 0x4a3320]] },
  // 2 smg
  { recoil: 0.014, kick: 0.85, vol: 0.22, rate2: 1.5, muzzleZ: -0.42,
    parts: [[0.06, 0.09, 0.36, 0, 0, 0, 0x2b2b2b], [0.035, 0.035, 0.18, 0, 0.01, -0.27, 0x1a1a1a],
            [0.04, 0.17, 0.05, 0, -0.13, 0.02, 0x1a1a1a], [0.05, 0.12, 0.07, 0, -0.1, 0.12, 0x3a3a3a]] },
  // 3 rifle
  { recoil: 0.018, kick: 1.15, vol: 0.32, rate2: 1, muzzleZ: -0.6,
    parts: [[0.07, 0.1, 0.55, 0, 0, 0, 0x2b2b2b], [0.04, 0.04, 0.3, 0, 0.01, -0.4, 0x1a1a1a],
            [0.06, 0.16, 0.08, 0, -0.12, 0.05, 0x4a3320], [0.05, 0.14, 0.08, 0, -0.12, -0.12, 0x1a1a1a]] },
  // 4 shotgun
  { recoil: 0.07, kick: 2.4, vol: 0.48, rate2: 0.7, muzzleZ: -0.78,
    parts: [[0.07, 0.09, 0.55, 0, 0, 0, 0x3a3a3a], [0.05, 0.05, 0.6, 0, 0.02, -0.5, 0x1a1a1a],
            [0.075, 0.07, 0.22, 0, -0.06, -0.25, 0x6b4a2b], [0.06, 0.13, 0.3, 0, -0.04, 0.38, 0x6b4a2b]] },
  // 5 sniper
  { recoil: 0.055, kick: 2.8, vol: 0.55, rate2: 0.55, muzzleZ: -0.95,
    parts: [[0.06, 0.09, 0.8, 0, 0, 0, 0x2f3a2f], [0.035, 0.035, 0.5, 0, 0.01, -0.62, 0x1a1a1a],
            [0.05, 0.07, 0.2, 0, 0.09, -0.05, 0x111111], [0.06, 0.14, 0.3, 0, -0.04, 0.45, 0x4a3320]] },
  // 6 HE
  { recoil: 0, kick: 0.4, vol: 0.2, rate2: 1, muzzleZ: -0.2,
    parts: [[0.1, 0.14, 0.1, 0, -0.02, -0.05, 0x3a5a2a], [0.04, 0.06, 0.04, 0, 0.08, -0.05, 0x888888]] },
  // 7 Flash
  { recoil: 0, kick: 0.4, vol: 0.2, rate2: 1, muzzleZ: -0.2,
    parts: [[0.09, 0.13, 0.09, 0, -0.02, -0.05, 0xc8b060], [0.04, 0.05, 0.04, 0, 0.07, -0.05, 0x666666]] },
  // 8 Smoke
  { recoil: 0, kick: 0.4, vol: 0.2, rate2: 1, muzzleZ: -0.2,
    parts: [[0.1, 0.14, 0.1, 0, -0.02, -0.05, 0x4a6a8a], [0.04, 0.06, 0.04, 0, 0.08, -0.05, 0x888888]] },
];
const WEAPONS = WSTATS.map((s, i) => ({ ...s, ...(LOOKS[i] || { recoil: 0, kick: 0.3, vol: 0.2, rate2: 1, muzzleZ: -0.2, parts: [[0.1, 0.12, 0.1, 0, 0, 0, 0x555555]] }) }));

const guns = WEAPONS.map(w => {
  const g = new THREE.Group();
  for (const [a, b, c, x, y, z, col] of w.parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), new THREE.MeshStandardMaterial({
      color: col, roughness: 0.45, metalness: 0.35
    }));
    m.position.set(x, y, z);
    g.add(m);
  }
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcc33 }));
  flash.position.set(0, 0.01, w.muzzleZ || -0.4);
  flash.visible = false;
  g.add(flash);
  g.position.set(0.22, -0.2, -0.5);
  g.visible = false;
  camera.add(g);
  return { group: g, flash };
});

let cur = 1;                                   // 0 cuchillo, 1 pistola, ...
const ammo = WEAPONS.map(w => w.mag);
let owned = WEAPONS.map((_, i) => i <= 1);     // cuchillo + pistola
let myMoney = ECO.startMoney;
let myTeam = 0;
let teamScore = [0, 0];
let reloading = false, reloadT = 0, fireCd = 0, gunKick = 0, flashT = 0, msgT = 0, drawT = 0, dmgFlash = 0;
let buyOpen = false;
let bombHold = false; // manteniendo E
let bombActAcc = 0;
let recoilPitch = 0, recoilYaw = 0;

// Cosméticos del jugador (inventario). Valores guardados en localStorage.
function loadCos(key, max, def = 0) {
  try {
    const v = parseInt(localStorage.getItem(key), 10);
    if (v >= 0 && v <= max) return v;
  } catch (e) {}
  return def;
}
function saveCos(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
let cosFace = loadCos('bs_face', 3, 0);
let cosShirt = loadCos('bs_skin', 3, 0);   // 0 soldado, 1 instituto, 2 negro, 3 rojo
let cosPants = loadCos('bs_pants', 3, 0);  // 0 militar, 1 azul, 2 camo, 3 negro
let cosTone = loadCos('bs_tone', 4, 0);
const myFace = () => cosFace;
const mySkin = () => cosShirt;
const myPants = () => cosPants;
const myTone = () => cosTone;
// sincronizar selects ocultos (por si algo los lee)
function syncCosSelects() {
  if ($('facesel')) $('facesel').value = String(cosFace);
  if ($('skinsel')) $('skinsel').value = String(cosShirt);
  if ($('tonesel')) $('tonesel').value = String(cosTone);
  if ($('pantsel')) $('pantsel').value = String(cosPants);
}
syncCosSelects();

// Tercera persona (tecla V): para ver tu propio personaje y su skin
let thirdP = false, selfChar = null, selfSkin = -1;
function placeCamera(p) {
  if (!thirdP) {
    if (selfChar) selfChar.visible = false;
    camera.position.set(p.x, p.y + CFG.eye, p.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    guns[cur].group.visible = true;
    return;
  }
  const sk = mySkin(), fc = myFace(), tn = myTone(), pt = myPants();
  const key = sk * 10 + fc + tn * 100 + pt * 10000 + myTeam * 1000;
  if (!selfChar || selfSkin !== key) {
    if (selfChar) scene.remove(selfChar);
    selfChar = makeCharacter(TEAMS[myTeam]?.color ?? 0x3b82f6, sk, fc, myTeam, tn, pt);
    selfSkin = key;
    scene.add(selfChar);
  }
  selfChar.visible = true;
  selfChar.position.set(p.x, p.y, p.z);
  selfChar.rotation.set(0, player.yaw + Math.PI, 0);
  camera.position.set(p.x + Math.sin(player.yaw) * 3, p.y + CFG.eye + 0.5, p.z + Math.cos(player.yaw) * 3);
  camera.rotation.set(player.pitch, player.yaw, 0);
  guns[cur].group.visible = false;
}

function showGun() { for (let i = 0; i < guns.length; i++) guns[i].group.visible = i === cur; }

function selectWeapon(i) {
  if (i === cur || player.dead) return;
  if (i > 1 && !owned[i]) { say('No tienes esa arma — pulsa B para comprar', 1.5); return; }
  guns[cur].group.visible = false;
  cur = i;
  guns[cur].group.visible = true;
  reloading = false; fireCd = 0.3; drawT = 1; trigger = false; zoomed = false;
  msgEl.textContent = ''; msgT = 0;
  beep(420, 0.04, 0.06);

  updateHud();
}

/* ---------- Opciones (sensibilidad + volumen) ---------- */
let sensMult = 1, masterVol = 0.8;
try {
  const s = parseInt(localStorage.getItem('bs_sens'), 10);
  if (s >= 20 && s <= 200) sensMult = s / 100;
  const v = parseInt(localStorage.getItem('bs_vol'), 10);
  if (v >= 0 && v <= 100) masterVol = v / 100;
} catch (e) { /* sin almacenamiento */ }

/* ---------- Sonido ---------- */
let actx = null, shotBuf = null;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    shotBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.16), actx.sampleRate);
    const d = shotBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  } catch (e) { actx = null; }
}
function sfxShot(vol = 0.3, rate = 1) {
  if (!actx || masterVol <= 0) return;
  const src = actx.createBufferSource();
  const g = actx.createGain();
  src.buffer = shotBuf; src.playbackRate.value = rate; g.gain.value = vol * masterVol;
  src.connect(g); g.connect(actx.destination); src.start();
}
let stepAcc = 0;
function sfxStep(vol = 0.06) {
  if (!actx || masterVol <= 0) return;
  const src = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 500;
  src.buffer = shotBuf; src.playbackRate.value = 0.35 + Math.random() * 0.1; g.gain.value = vol * masterVol;
  src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
}
function sfxReloadEnd() { beep(520, 0.04, 0.08); setTimeout(() => beep(780, 0.05, 0.08), 70); }
function beep(freq, dur, vol = 0.12) {
  if (!actx || masterVol <= 0) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = freq; o.type = 'square'; g.gain.value = vol * masterVol;
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}

/* ---------- Personaje en bloques ---------- */
function shade(c, f) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// Soldado de bloques: botas, chaleco, mochila, arma y equipo según el bando. Mira hacia +z.
// team 0 (Alpha, defensores): casco con linterna, chaleco, radio y kit de desactivación.
// team 1 (Bravo, atacantes): gorro, pañuelo en la cara, ropa camuflada y correaje de municiones.
// Los nombres de parte (head/body/arm/legs) los usa el daño por zona: no cambiarlos.
// tone: 0 claro … 4 muy oscuro
const SKIN_TONES = [0xf0c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3317];
const PANTS_COLORS = [0x2f3444, 0x1e3a6e, 0x3a4a30, 0x1a1a1e]; // militar, azul, camo, negro
function makeCharacter(color, skin = 0, face = 0, team = -1, tone = 0, pants = 0) {
  const g = new THREE.Group();
  const add = (name, w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matChar(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.part = name;
    g.add(m);
    return m;
  };
  const PANTS = PANTS_COLORS[Math.max(0, Math.min(3, pants | 0))] || PANTS_COLORS[0];
  const BOOT = 0x1c1c20, SKIN = SKIN_TONES[Math.max(0, Math.min(4, tone | 0))] || SKIN_TONES[0], GLOVE = 0x24262c;
  const dark = shade(color, 0.55), mid = shade(color, 0.78);
  // skin: 0 soldado (color equipo), 1 instituto, 2 negro, 3 rojo
  const shirtMap = { 0: color, 1: 0x1d4ea0, 2: 0x1a1a1e, 3: 0x8b1a1a };
  const polo = skin === 1;
  const shirt = shirtMap[skin] != null ? shirtMap[skin] : color;
  // piernas y botas
  for (const sx of [-1, 1]) {
    add('legs', 0.23, 0.6, 0.27, sx * 0.14, 0.44, 0, PANTS);
    add('legs', 0.25, 0.14, 0.36, sx * 0.14, 0.07, 0.05, BOOT);
    add('legs', 0.26, 0.1, 0.3, sx * 0.14, 0.62, 0.03, shade(PANTS, 0.8)); // rodillera
  }
  // torso
  add('body', 0.64, 0.1, 0.38, 0, 0.8, 0, 0x151518);          // cinturón
  add('body', 0.62, 0.58, 0.36, 0, 1.14, 0, shirt);            // camisa
  if (polo) {
    add('body', 0.64, 0.07, 0.38, 0, 1.2, 0, 0xffffff);          // franja blanca en el pecho
    add('body', 0.12, 0.12, 0.03, 0.15, 1.3, 0.19, 0xffffff);    // parche
    add('body', 0.34, 0.07, 0.3, 0, 1.43, 0.02, 0xffffff);       // cuello de la camiseta
  } else if (skin === 2 || skin === 3) {
    // ropa casual: cuello simple
    add('body', 0.3, 0.06, 0.28, 0, 1.42, 0.02, shade(shirt, 0.7));
  } else if (team === 1) {
    // atacantes: manchas de camuflaje, correaje cruzado y cargadores
    for (const [cx, cy, w, h, k] of [[-0.18, 1.3, 0.2, 0.16, 0.6], [0.2, 1.22, 0.16, 0.2, 1.3], [-0.12, 1.02, 0.22, 0.14, 1.25], [0.16, 1.04, 0.14, 0.12, 0.62]])
      add('body', w, h, 0.02, cx, cy, 0.19, shade(color, k));
    const strap = add('body', 0.09, 0.62, 0.04, 0.02, 1.17, 0.2, 0x2a2118);   // correaje en diagonal
    strap.rotation.z = 0.7;
    add('body', 0.1, 0.12, 0.07, -0.16, 0.98, 0.22, 0x3a2f20);   // cargadores
    add('body', 0.1, 0.12, 0.07, 0.0, 0.98, 0.22, 0x3a2f20);
    add('body', 0.1, 0.12, 0.07, 0.16, 0.98, 0.22, 0x3a2f20);
  } else {
    add('body', 0.5, 0.42, 0.07, 0, 1.18, 0.2, dark);            // chaleco (frente)
    add('body', 0.14, 0.12, 0.08, -0.14, 1.04, 0.22, mid);       // bolsillos
    add('body', 0.14, 0.12, 0.08, 0.14, 1.04, 0.22, mid);
    if (team === 0) {
      add('body', 0.16, 0.18, 0.1, -0.36, 0.76, 0.04, 0x3d8b3d);  // kit de desactivación en la cadera
      add('body', 0.06, 0.14, 0.05, 0.28, 1.54, 0.1, 0x202024);   // radio en el hombro
      add('body', 0.015, 0.14, 0.015, 0.28, 1.66, 0.1, 0x202024); // antena
    }
  }
  add('body', 0.42, 0.44, 0.14, 0, 1.16, -0.25, team === 1 ? 0x4a3b28 : dark);   // mochila
  add('body', 0.18, 0.1, 0.16, 0, 1.43, 0, SKIN);              // cuello
  // brazos: manga + guante + hombrera
  for (const sx of [-1, 1]) {
    const z = sx > 0 ? 0.12 : 0.02;
    add('arm', 0.18, 0.5, 0.18, sx * 0.4, 1.15, z, shirt);
    if (polo) add('arm', 0.2, 0.06, 0.2, sx * 0.4, 1.0, z, 0xffffff);   // franja en la manga
    add('arm', 0.16, 0.14, 0.16, sx * 0.4, 0.83, z + 0.03, GLOVE);
    add('arm', 0.22, 0.12, 0.28, sx * 0.4, 1.44, 0, mid);
  }
  // cabeza, casco y lentes
  add('head', 0.36, 0.36, 0.36, 0, 1.69, 0, SKIN);
  if (team === 1) {
    add('head', 0.41, 0.15, 0.41, 0, 1.86, -0.01, shade(color, 0.4));   // gorro
    add('head', 0.34, 0.12, 0.34, 0, 1.45, 0, 0x222226);                // pañuelo al cuello
    if (!face) add('head', 0.37, 0.15, 0.04, 0, 1.6, 0.19, 0x1b1b1f);   // cubre la parte baja de la cara
  } else {
    add('head', 0.42, 0.16, 0.42, 0, 1.86, -0.01, dark);         // casco
    add('head', 0.42, 0.06, 0.1, 0, 1.78, 0.2, dark);            // visera
    if (team === 0) add('head', 0.06, 0.06, 0.06, 0.22, 1.86, 0.12, 0xfff2a0);   // linterna del casco
  }
  if (!face) {
    add('head', 0.38, 0.08, 0.04, 0, 1.71, 0.19, 0x15151a);      // banda de lentes
    add('head', 0.1, 0.06, 0.05, -0.09, 1.71, 0.2, 0x66ccff);    // lentes
    add('head', 0.1, 0.06, 0.05, 0.09, 1.71, 0.2, 0x66ccff);
  } else {
    // caras: 1 enojado, 2 agresivo, 3 sonriente. Las cejas se inclinan hacia el centro cuando hay enojo.
    const ang = face === 3 ? 0.25 : face === 2 ? 0.62 : 0.45;
    for (const sx of [-1, 1]) {
      add('head', 0.1, 0.075, 0.03, sx * 0.09, 1.69, 0.185, face === 2 ? 0xffffff : 0xfafafa);   // ojo
      add('head', 0.045, 0.06, 0.035, sx * 0.09 - sx * 0.01, 1.685, 0.195, face === 2 ? 0xd01818 : 0x111111); // pupila
      const brow = add('head', 0.14, face === 2 ? 0.055 : 0.04, 0.04, sx * 0.09, face === 3 ? 1.76 : 1.74, 0.19, 0x2a1a10);
      brow.rotation.z = face === 3 ? sx * ang : -sx * ang;
    }
    if (face === 3) {                                  // sonrisa
      add('head', 0.16, 0.035, 0.03, 0, 1.585, 0.185, 0x5a1d1d);
      add('head', 0.035, 0.035, 0.03, -0.1, 1.6, 0.185, 0x5a1d1d);
      add('head', 0.035, 0.035, 0.03, 0.1, 1.6, 0.185, 0x5a1d1d);
    } else if (face === 1) {                           // boca de enojo (hacia abajo)
      add('head', 0.15, 0.035, 0.03, 0, 1.58, 0.185, 0x5a1d1d);
      add('head', 0.035, 0.035, 0.03, -0.09, 1.565, 0.185, 0x5a1d1d);
      add('head', 0.035, 0.035, 0.03, 0.09, 1.565, 0.185, 0x5a1d1d);
    } else {                                           // agresivo: dientes apretados y cicatriz
      add('head', 0.18, 0.07, 0.03, 0, 1.58, 0.185, 0xf4f0e6);
      add('head', 0.18, 0.012, 0.035, 0, 1.58, 0.19, 0x3a1010);
      for (const dx of [-0.04, 0.0, 0.04]) add('head', 0.012, 0.07, 0.035, dx, 1.58, 0.19, 0x3a1010);
      const sc = add('head', 0.14, 0.02, 0.03, 0.09, 1.63, 0.185, 0x9c2a2a); sc.rotation.z = 0.9;   // cicatriz
    }
  }
  // arma: cañón, cuerpo, culata y cargador
  add('gun', 0.07, 0.09, 0.62, 0.4, 1.12, 0.5, 0x2a2a2e);
  add('gun', 0.09, 0.13, 0.26, 0.4, 1.1, 0.2, 0x1a1a1d);
  add('gun', 0.06, 0.12, 0.1, 0.4, 1.0, 0.4, 0x3a3a40);
  return g;
}

function makeTag(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, Arial';
  g.textAlign = 'center';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.fillStyle = '#fff';
  g.strokeText(text, 128, 42);
  g.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  s.scale.set(2, 0.5, 1);
  s.position.set(0, 2.35, 0);
  return s;
}

// posición de la boca del arma de un personaje (yaw = rotación del modelo)
function gunWorld(pos, yaw, out) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  return out.set(pos.x + 0.42 * cy + 0.9 * sy, pos.y + 1.25, pos.z - 0.42 * sy + 0.9 * cy);
}

function setLit(o, lit) {
  if (lit === o.lit) return;
  o.lit = lit;
  for (const m of o.meshes) m.material.emissive.setHex(lit ? 0x992222 : 0x000000);
}

/* ---------- Efectos ---------- */
const fx = [];
const pGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const holeGeo = new THREE.PlaneGeometry(0.12, 0.12);
const casingGeo = new THREE.BoxGeometry(0.04, 0.02, 0.08);
const MAX_HOLES = 80;

function puff(pt, color, n = 6, scale = 1) {
  // en calidad baja, menos partículas = más FPS
  const maxN = gfxQuality === 0 ? Math.min(n, 4) : gfxQuality === 1 ? Math.min(n, 12) : n;
  for (let i = 0; i < maxN; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pt);
    m.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
    scene.add(m);
    fx.push({
      obj: m, life: 0.35 + Math.random() * 0.35,
      vel: new THREE.Vector3((Math.random() - .5) * 4 * scale, Math.random() * 4 * scale, (Math.random() - .5) * 4 * scale)
    });
  }
}
function tracer(a, b) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a, b]),
    new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 })
  );
  scene.add(line);
  fx.push({ obj: line, life: 0.05, line: true });
}
function bulletHole(pt, normal) {
  if (gfxQuality === 0) return; // en baja no hay marcas (ahorra FPS)
  const maxH = gfxQuality === 2 ? MAX_HOLES : 40;
  while (decals.length >= maxH) {
    const old = decals.shift();
    scene.remove(old);
    old.material.dispose();
  }
  const m = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({
    color: 0x1a1510, transparent: true, opacity: 0.85, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1
  }));
  m.position.copy(pt).addScaledVector(normal, 0.015);
  m.lookAt(pt.clone().add(normal));
  scene.add(m);
  decals.push(m);
}
function ejectCasing() {
  if (!camera) return;
  const m = new THREE.Mesh(casingGeo, new THREE.MeshBasicMaterial({ color: 0xc9a227 }));
  const side = (Math.random() > 0.5 ? 1 : -1);
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(pos);
  camera.getWorldDirection(dir);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  m.position.copy(pos).addScaledVector(right, 0.25 * side).addScaledVector(dir, 0.35);
  m.position.y -= 0.15;
  scene.add(m);
  const vel = right.multiplyScalar((1.5 + Math.random()) * side)
    .add(new THREE.Vector3(0, 1.8 + Math.random(), 0))
    .addScaledVector(dir, 0.4);
  fx.push({ obj: m, life: 1.2 + Math.random() * 0.6, vel, spin: true });
}
function bigExplosion(pt) {
  puff(pt, 0xff6622, 28, 2.2);
  puff(pt, 0xffaa33, 18, 1.6);
  puff(pt, 0x333333, 12, 1.4);
  dmgFlash = 1.2;
  // sacudida de cámara
  player.pitch += (Math.random() - 0.5) * 0.12;
  player.yaw += (Math.random() - 0.5) * 0.1;
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.vel) {
      f.obj.position.addScaledVector(f.vel, dt);
      f.vel.y -= 12 * dt;
      if (f.spin) f.obj.rotation.x += dt * 8;
    }
    if (f.life <= 0) {
      scene.remove(f.obj);
      if (f.line) f.obj.geometry.dispose();
      f.obj.material.dispose();
      fx.splice(i, 1);
    }
  }
}

let hitTimer = 0;
function showHit(kill) {
  hitEl.style.color = kill ? '#ff3b3b' : '#fff';
  hitEl.style.opacity = 1;
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => (hitEl.style.opacity = 0), 130);
  beep(kill ? 900 : 600, 0.06);
}

/* ---------- Granadas ---------- */
const activeNades = [];
let blindT = 0; // cegado por flashbang
const nadeGeo = new THREE.SphereGeometry(0.12, 8, 8);

function throwGrenade(w) {
  if (!w.grenade || ammo[cur] <= 0) return;
  ammo[cur]--;
  fireCd = w.rate;
  updateHud();
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(pos);
  camera.getWorldDirection(dir);
  pos.addScaledVector(dir, 0.5);
  pos.y = Math.max(pos.y, player.pos.y + 1.2);
  // velocidad de lanzamiento (más fuerte mirando arriba)
  const power = 14 + Math.max(0, player.pitch) * 6;
  const vel = dir.clone().multiplyScalar(power);
  vel.y += 3.5 + Math.max(0, -player.pitch) * 2;
  const mesh = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({
    color: w.gtype === 'he' ? 0x3a5a2a : w.gtype === 'flash' ? 0xc8b060 : 0x4a6a8a
  }));
  mesh.position.copy(pos);
  scene.add(mesh);
  const nade = {
    mesh, pos, vel, fuse: w.fuse || 1.5, type: w.gtype, radius: w.radius || 5,
    damage: w.damage || 0, owner: myId, bounced: 0
  };
  activeNades.push(nade);
  beep(180, 0.04, 0.1);
  if (mode === 'mp') {
    netSend({ t: 'nade', type: w.gtype, x: r3(pos.x), y: r3(pos.y), z: r3(pos.z),
              vx: r3(vel.x), vy: r3(vel.y), vz: r3(vel.z), fuse: w.fuse });
  }
  // si se acaba, volver a pistola
  if (ammo[cur] <= 0) setTimeout(() => { if (ammo[cur] <= 0 && WEAPONS[cur]?.grenade) selectWeapon(1); }, 200);
}

function spawnRemoteNade(m) {
  const pos = new THREE.Vector3(m.x, m.y, m.z);
  const vel = new THREE.Vector3(m.vx, m.vy, m.vz);
  const color = m.type === 'he' ? 0x3a5a2a : m.type === 'flash' ? 0xc8b060 : 0x4a6a8a;
  const mesh = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.copy(pos);
  scene.add(mesh);
  activeNades.push({
    mesh, pos, vel, fuse: m.fuse || 1.5, type: m.type, radius: m.type === 'flash' ? 9 : m.type === 'smoke' ? 4.5 : 5.5,
    damage: m.type === 'he' ? 98 : 0, owner: m.id || 0, bounced: 0, remote: true
  });
}

function updateNades(dt) {
  for (let i = activeNades.length - 1; i >= 0; i--) {
    const n = activeNades[i];
    n.fuse -= dt;
    // física simple
    n.vel.y -= 18 * dt;
    const nx = n.pos.x + n.vel.x * dt;
    const ny = n.pos.y + n.vel.y * dt;
    const nz = n.pos.z + n.vel.z * dt;
    // suelo
    if (ny < 0.12) {
      n.pos.y = 0.12;
      n.vel.y *= -0.35;
      n.vel.x *= 0.7;
      n.vel.z *= 0.7;
      n.bounced++;
      if (Math.abs(n.vel.y) < 1) n.vel.y = 0;
    } else {
      n.pos.y = ny;
    }
    // paredes (AABB simples del mapa)
    let blocked = false;
    for (const s of solids) {
      if (nx > s.x0 - 0.12 && nx < s.x1 + 0.12 && n.pos.y > s.y0 && n.pos.y < s.y1 &&
          n.pos.z > s.z0 - 0.12 && n.pos.z < s.z1 + 0.12) {
        n.vel.x *= -0.4; blocked = true; break;
      }
      if (n.pos.x > s.x0 - 0.12 && n.pos.x < s.x1 + 0.12 && n.pos.y > s.y0 && n.pos.y < s.y1 &&
          nz > s.z0 - 0.12 && nz < s.z1 + 0.12) {
        n.vel.z *= -0.4; blocked = true; break;
      }
    }
    if (!blocked) { n.pos.x = nx; n.pos.z = nz; }
    n.mesh.position.copy(n.pos);
    n.mesh.rotation.x += dt * 4;
    n.mesh.rotation.z += dt * 3;

    if (n.fuse <= 0) {
      detonateNade(n);
      scene.remove(n.mesh);
      n.mesh.material.dispose();
      activeNades.splice(i, 1);
    }
  }
  if (blindT > 0) {
    blindT = Math.max(0, blindT - dt);
    const el = $('flash');
    if (el) el.style.opacity = Math.min(1, blindT > 0.5 ? 1 : blindT / 0.5);
  } else {
    const el = $('flash');
    if (el) el.style.opacity = 0;
  }
}

function detonateNade(n) {
  const pt = n.pos.clone();
  if (n.type === 'he') {
    puff(pt, 0xff6622, 22, 1.8);
    puff(pt, 0xffaa33, 14, 1.2);
    beep(70, 0.35, 0.35);
    // daño local a bots y a ti (si no eres el remoto que solo ve)
    if (!n.remote || mode === 'solo') {
      for (const b of bots) {
        if (!b.alive) continue;
        const d = Math.hypot(b.pos.x - pt.x, b.pos.y + 0.9 - pt.y, b.pos.z - pt.z);
        if (d < n.radius) {
          const falloff = 1 - d / n.radius;
          const dmg = Math.ceil(n.damage * falloff * falloff);
          if (dmg > 0) damageBot(b, 'body', { damage: dmg, head: 1, id: 'he' }, d);
        }
      }
    }
    // daño a ti mismo
    if (!player.dead) {
      const d = Math.hypot(player.pos.x - pt.x, player.pos.y + 1 - pt.y, player.pos.z - pt.z);
      if (d < n.radius) {
        const falloff = 1 - d / n.radius;
        const dmg = Math.ceil(n.damage * falloff * falloff * 0.85);
        if (dmg > 0) {
          player.hp = Math.max(0, player.hp - dmg);
          dmgFlash = Math.min(1, dmg / 40);
          if (player.hp <= 0) playerDied('Granada');
          updateHud();
        }
      }
    }
    // online: el servidor aplica daño a jugadores si enviamos la posición
    if (mode === 'mp' && !n.remote) {
      netSend({ t: 'nadeboom', type: 'he', x: r3(pt.x), y: r3(pt.y), z: r3(pt.z), radius: n.radius, damage: n.damage });
    }
  } else if (n.type === 'flash') {
    puff(pt, 0xffffee, 16, 1.5);
    beep(1200, 0.15, 0.25);
    // si estás mirando hacia la granada o cerca, te ciega
    if (!player.dead) {
      const toN = new THREE.Vector3(pt.x - player.pos.x, pt.y - (player.pos.y + 1.5), pt.z - player.pos.z);
      const dist = toN.length();
      if (dist < n.radius) {
        toN.normalize();
        const look = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), -Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
        const dot = look.dot(toN);
        // de frente = más ceguera; de espaldas casi nada
        const facing = Math.max(0, dot);
        const prox = 1 - dist / n.radius;
        const strength = facing * 0.85 + prox * 0.35;
        if (strength > 0.2) blindT = Math.max(blindT, 1.2 + strength * 2.5);
      }
    }
  } else if (n.type === 'smoke') {
    // nube de humo persistente
    for (let k = 0; k < 40; k++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.6 + Math.random() * 0.8, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x9aa3a8, transparent: true, opacity: 0.35 })
      );
      m.position.set(
        pt.x + (Math.random() - 0.5) * n.radius * 1.4,
        0.4 + Math.random() * 2.2,
        pt.z + (Math.random() - 0.5) * n.radius * 1.4
      );
      scene.add(m);
      fx.push({ obj: m, life: 12 + Math.random() * 6, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3) });
    }
    beep(90, 0.2, 0.15);
  }
}

function say(text, t = 1.2) { msgEl.textContent = text; msgT = t; }

function feed(text) {
  const el = document.createElement('div');
  el.textContent = text;
  feedEl.appendChild(el);
  while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
  setTimeout(() => el.remove(), 4500);
}

/* =====================================================
   MODO SOLO: bots con IA
   ===================================================== */
const BOT_NAMES = ['Ráfaga', 'Sombra', 'Tigre', 'Víbora', 'Roca', 'Lobo', 'Halcón', 'Cobra'];
const BOT_COLORS = [0xb03a2e, 0xa04030, 0xc0492f, 0x9c3b3b];

function makeBot(i, team = 1) {
  const col = (team === 0 || team === 1) ? TEAMS[team].color : BOT_COLORS[i % BOT_COLORS.length];
  const g = makeCharacter(col, 0, 0, team);
  scene.add(g);
  const b = {
    name: BOT_NAMES[i % BOT_NAMES.length], g, pos: g.position, team,
    vx: 0, vy: 0, vz: 0, onGround: true,
    hp: CFG.botHp, alive: false, yaw: 0, fall: 0, respawn: 0,
    flash: 0, lit: false, meshes: [],
    sees: false, seeT: Math.random() * 0.2, alert: 0, lastSeen: new THREE.Vector3(),
    react: 0, fireCd: 0, strafe: 1, strafeT: 0, side: Math.random() < 0.5 ? 1 : -1,
    wp: null, wantsMove: false, stuckT: 1, stuckPos: new THREE.Vector3(),
  };
  g.traverse(o => {
    if (o.isMesh) { o.userData.bot = b; b.meshes.push(o); rayTargets.push(o); }
  });
  bots.push(b);
  return b;
}

function spawnBot(b) {
  let candidates = MAP.waypoints || [[0, 0]];
  if (mode === 'practice' && MAP.teamSpawns && MAP.teamSpawns[b.team]) {
    candidates = MAP.teamSpawns[b.team];
  }
  let best = null, bestD = -1;
  for (let k = 0; k < 8; k++) {
    const w = candidates[Math.floor(Math.random() * candidates.length)];
    if (bots.some(o => o !== b && o.alive && Math.hypot(o.pos.x - w[0], o.pos.z - w[1]) < 3)) continue;
    const d = Math.hypot(w[0] - player.pos.x, w[1] - player.pos.z);
    if (d > bestD) { bestD = d; best = w; }
  }
  if (!best) best = candidates[0] || MAP.waypoints[0];
  b.pos.set(best[0], 0, best[1]);
  b.vx = b.vy = b.vz = 0;
  b.hp = CFG.botHp; b.alive = true; b.fall = 0;
  b.sees = false; b.alert = 0; b.wp = null; b.react = 0; b.fireCd = 0;
  b.yaw = Math.random() * Math.PI * 2;
  b.g.rotation.set(0, b.yaw, 0);
}

const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _mz = new THREE.Vector3(), _e = new THREE.Vector3();
const losRay = new THREE.Raycaster();

function lineOfSight(b) {
  _a.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
  _t.set(player.pos.x, player.pos.y + 1.2, player.pos.z).sub(_a);
  const d = _t.length();
  _t.normalize();
  losRay.set(_a, _t);
  losRay.far = d;
  return losRay.intersectObjects(worldMeshes, false).length === 0;
}

function turnTo(b, target, dt, rate) {
  let d = target - b.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  b.yaw += d * Math.min(1, dt * rate);
}

// Camina hacia (dx,dz) esquivando paredes: prueba varios ángulos hasta encontrar paso libre
const ANGLES = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4];
function steer(b, dx, dz, speed, dt) {
  const len = Math.hypot(dx, dz);
  let tvx = 0, tvz = 0;
  if (len > 0.01 && speed > 0) {
    b.wantsMove = true;
    const base = Math.atan2(dx, dz);
    for (const a of ANGLES) {
      const ang = base + a * b.side;
      const sx = Math.sin(ang), sz = Math.cos(ang);
      if (!hits(b.pos.x + sx * 0.9, b.pos.y + 0.65, b.pos.z + sz * 0.9)) { tvx = sx * speed; tvz = sz * speed; break; }
    }
  }
  const k = Math.min(1, dt * 8);
  b.vx += (tvx - b.vx) * k;
  b.vz += (tvz - b.vz) * k;
  slide(b, 'x', b.vx * dt);
  slide(b, 'z', b.vz * dt);
}

function faceMove(b, dt) {
  if (Math.hypot(b.vx, b.vz) > 0.5) turnTo(b, Math.atan2(b.vx, b.vz), dt, 6);
}

function botShoot(b, dist) {
  gunWorld(b.pos, b.yaw, _mz);
  const moving = Math.hypot(player.vx, player.vz) > 2.5 ? 0.7 : 1;
  const chance = Math.max(0.1, Math.min(0.55, 0.62 - dist * 0.014)) * moving;
  const hit = Math.random() < chance;
  _e.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  if (!hit) _e.add(new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .5) * 2, (Math.random() - .5) * 3));
  tracer(_mz.clone(), _e.clone());
  puff(_mz, 0xffdd66, 2);
  sfxShot(0.3 / (1 + dist * 0.08), 1.1);
  if (hit) damagePlayer(CFG.botDamage, b);
}

function updateBot(b, dt) {
  const p = b.pos;

  if (!b.alive) {
    b.fall = Math.min(1, b.fall + dt * 4);
    b.g.rotation.x = -Math.PI / 2 * b.fall;
    p.y = 0.2 * b.fall;
    b.respawn -= dt;
    if (b.flash > 0) b.flash -= dt;
    setLit(b, b.flash > 0);
    if (b.respawn <= 0) spawnBot(b);
    return;
  }

  b.wantsMove = false;
  const isEnemyOfPlayer = (mode !== 'practice') || (b.team !== myTeam);
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
  const dist = Math.hypot(dx, dz);

  // visión (cada ~0.2 s para no gastar rendimiento)
  b.seeT -= dt;
  if (b.seeT <= 0) {
    b.seeT = 0.2 + Math.random() * 0.1;
    const was = b.sees;
    b.sees = isEnemyOfPlayer && !player.dead && dist < 40 && lineOfSight(b);
    if (b.sees) {
      if (!was) b.react = 0.5 + Math.random() * 0.5;   // tiempo de reacción
      b.alert = 6;
      b.lastSeen.copy(player.pos);
    }
  }
  b.alert = Math.max(0, b.alert - dt);

  // en práctica: defensores van al site si hay bomba plantada
  if (mode === 'practice' && bombState && (bombState.state === 'planted' || bombState.state === 'defusing') && b.team === MATCH.defenderTeam) {
    const tx = bombState.x - p.x, tz = bombState.z - p.z;
    if (Math.hypot(tx, tz) > 2) steer(b, tx, tz, CFG.botSpeed * 1.1, dt);
    else steer(b, 0, 0, 0, dt);
    faceMove(b, dt);
  } else if (b.sees && !player.dead && isEnemyOfPlayer) {
    // combate: mirar al jugador, mantener distancia, moverse de lado y disparar
    turnTo(b, Math.atan2(dx, dz), dt, 10);
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = 1 + Math.random() * 1.8; b.strafe = Math.random() < 0.5 ? -1 : 1; }
    const nx = dx / dist, nz = dz / dist;
    let mx = 0, mz = 0;
    if (dist > 13) { mx = nx; mz = nz; } else if (dist < 6) { mx = -nx; mz = -nz; }
    mx += -nz * b.strafe * 0.8;
    mz += nx * b.strafe * 0.8;
    steer(b, mx, mz, CFG.botSpeed * 0.8, dt);
    b.react -= dt; b.fireCd -= dt;
    if (b.react <= 0 && b.fireCd <= 0) { botShoot(b, dist); b.fireCd = 0.3 + Math.random() * 0.25; }
  } else if (b.alert > 0 && isEnemyOfPlayer) {
    // buscar: ir hacia donde te vio por última vez
    const tx = b.lastSeen.x - p.x, tz = b.lastSeen.z - p.z;
    if (Math.hypot(tx, tz) > 1.8) steer(b, tx, tz, CFG.botSpeed * 1.15, dt);
    else steer(b, 0, 0, 0, dt);
    faceMove(b, dt);
  } else {
    // patrullar entre puntos del mapa
    if (!b.wp || Math.hypot(b.wp[0] - p.x, b.wp[1] - p.z) < 1.6) {
      b.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)];
    }
    steer(b, b.wp[0] - p.x, b.wp[1] - p.z, CFG.botSpeed, dt);
    faceMove(b, dt);
  }

  gravityStep(b, dt);

  // detectar si se quedó atascado
  b.stuckT -= dt;
  if (b.stuckT <= 0) {
    b.stuckT = 1;
    if (b.wantsMove && Math.hypot(p.x - b.stuckPos.x, p.z - b.stuckPos.z) < 0.4) {
      b.side *= -1; b.strafe *= -1; b.wp = null;
    }
    b.stuckPos.copy(p);
  }

  b.g.rotation.y = b.yaw;
  if (b.flash > 0) b.flash -= dt;
  setLit(b, b.flash > 0);
}

function updateBots(dt) { for (const b of bots) updateBot(b, dt); }

function damageBot(b, part, w, dist) {
  // sin fuego amigo en práctica
  if (mode === 'practice' && b.team === myTeam) return false;
  let dmg = w.damage * (part === 'head' ? w.head : 1);
  if (w.pellets > 1) dmg *= Math.max(0.25, 1 - dist / 20);   // la escopeta pierde daño con la distancia
  b.hp -= dmg;
  b.flash = 0.08;
  b.alert = 8; b.lastSeen.copy(player.pos);
  if (b.hp > 0) return false;
  b.alive = false; b.respawn = CFG.botRespawn; b.fall = 0;
  player.kills++;
  player.hp = Math.min(100, player.hp + CFG.killHeal);
  feed('Tú  ➜  ' + b.name);
  updateHud();
  return true;
}

function damagePlayer(n, bot) {
  if (player.dead) return;
  player.hp = Math.max(0, player.hp - n);
  dmgFlash = 1;
  beep(120, 0.08, 0.15);
  if (player.hp <= 0) {
    player.deaths++;
    feed(bot.name + '  ➜  Tú');
    playerDied(bot.name);
  }
  updateHud();
}

function respawnPlayer() {
  placePlayer();
  reviveLocal();
}

/* =====================================================
   Muerte / reaparición del jugador (común a solo y online)
   ===================================================== */
// Espectador: al morir en multijugador puedes mirar a compañeros vivos
let specIdx = 0, specTargets = [], specYaw = 0, specPitch = 0.15;

function playerDied(killerName) {
  player.dead = true;
  player.respawnT = mode === 'practice' ? 3 : (mode === 'solo' ? 2.5 : CFG.playerRespawn);
  player.killer = killerName;
  mouseDown = false; trigger = false; reloading = false; zoomed = false;
  guns[cur].group.visible = false;
  deathEl.style.display = 'flex';
  beep(80, 0.3, 0.2);
  // si llevabas la bomba en práctica, cae al suelo
  if (mode === 'practice' && bombState && bombState.state === 'carried' && bombState.carrier === 'local') {
    bombState.state = 'dropped';
    bombState.carrier = null;
    bombState.x = player.pos.x;
    bombState.z = player.pos.z;
    updateBombVisual();
    say('La bomba cayó al suelo', 2);
  }
  // arrancar espectador en mp
  if (mode === 'mp') {
    refreshSpecTargets();
    specIdx = 0;
    specYaw = player.yaw;
    specPitch = 0.2;
    updateDeathTxt();
  }
}

function reviveLocal() {
  player.dead = false;
  player.hp = 100;
  for (let i = 0; i < WEAPONS.length; i++) {
    ammo[i] = (i <= 1 || owned[i]) ? WEAPONS[i].mag : 0;
  }
  if (cur > 1 && !owned[cur]) { selectWeapon(1); }
  guns[cur].group.visible = true;
  deathEl.style.display = 'none';
  camera.rotation.z = 0;
  drawT = 1;
  updateHud();
  specTargets = [];
}

function refreshSpecTargets() {
  // Preferir compañeros del mismo equipo vivos; si no hay, cualquier vivo
  const allies = [], others = [];
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    if (r.team === myTeam) allies.push(r);
    else others.push(r);
  }
  specTargets = allies.length ? allies : others;
  if (specIdx >= specTargets.length) specIdx = 0;
}

function nextSpectator(dir = 1) {
  refreshSpecTargets();
  if (!specTargets.length) return;
  specIdx = (specIdx + dir + specTargets.length) % specTargets.length;
  updateDeathTxt();
}

function updateDeathTxt() {
  if (!player.dead) return;
  if (mode === 'solo') {
    deathTxt.textContent = 'Te eliminó ' + player.killer + ' — reapareces en ' + Math.max(1, Math.ceil(player.respawnT));
    return;
  }
  refreshSpecTargets();
  let msg = 'Te eliminó ' + player.killer;
  if (specTargets.length) {
    const t = specTargets[specIdx];
    msg += ' — Mirando a ' + (t.name || 'jugador') + '  ·  Espacio / clic = cambiar';
  } else {
    msg += ' — esperando siguiente ronda (nadie vivo para mirar)';
  }
  deathTxt.textContent = msg;
}

function updateSpectator(dt) {
  refreshSpecTargets();
  // permitir mirar con el ratón mientras estás muerto
  camera.rotation.z *= Math.max(0, 1 - dt * 4); // recuperar inclinación de muerte
  if (specTargets.length) {
    const t = specTargets[specIdx];
    if (!t || !t.alive) { nextSpectator(1); return; }
    const gx = t.g.position.x, gy = t.g.position.y, gz = t.g.position.z;
    // cámara detrás y un poco arriba (estilo espectador CS)
    const dist = 3.2;
    const tx = gx + Math.sin(specYaw) * dist;
    const tz = gz + Math.cos(specYaw) * dist;
    const ty = gy + 1.7 + Math.sin(specPitch) * 1.2;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 8);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 8);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 8);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = specYaw + Math.PI;
    camera.rotation.x = -specPitch * 0.6;
  } else {
    // nadie vivo: cámara fija sobre tu cadáver
    const p = player.pos;
    camera.position.x += (p.x - camera.position.x) * Math.min(1, dt * 3);
    camera.position.y += ((p.y + 4) - camera.position.y) * Math.min(1, dt * 3);
    camera.position.z += (p.z - camera.position.z) * Math.min(1, dt * 3);
    camera.lookAt(p.x, p.y + 0.5, p.z);
  }
}

/* =====================================================
   MODO ONLINE
   ===================================================== */
let ws = null, myId = 0, mpReady = false, netError = '', myPing = 0, pingTimer = 0, stateT = 0;
let roomCode = '', connectTimer = 0, retryTimer = 0, connectT0 = 0, joinMsg = null;
const WAKE_SECONDS = 75;   // cuánto se espera a que despierte un servidor dormido
const isLocalHost = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(location.hostname || '');
const remotes = new Map();   // id -> jugador remoto
const roster = new Map();    // id -> { name, kills, deaths }
const PALETTE = [0x2e6db0, 0x2e9e5b, 0xd98a1f, 0x8e44ad, 0x16a0a0, 0xc2579f, 0x7f8c8d, 0xb7a21a, 0x3b5bdb, 0xe67e22];

function nameOf(id) {
  if (id === myId) return 'Tú';
  const r = remotes.get(id);
  if (r) return r.name;
  const q = roster.get(id);
  return q ? q.name : 'Jugador';
}

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const col = (p.team === 0 || p.team === 1) ? TEAMS[p.team].color : PALETTE[p.id % PALETTE.length];
  const g = makeCharacter(col, (p.skin | 0) || 0, p.face | 0, (p.team === 0 || p.team === 1) ? p.team : -1, p.tone | 0, p.pants | 0);
  g.position.set(p.x, p.y, p.z);
  g.add(makeTag(p.name));
  scene.add(g);
  const r = {
    id: p.id, name: p.name, team: p.team, g, tx: p.x, ty: p.y, tz: p.z, tyaw: p.yaw || 0,
    yaw: (p.yaw || 0) + Math.PI, alive: p.alive !== false, fall: 0, flash: 0, lit: false, meshes: [],
  };
  g.rotation.set(0, r.yaw, 0);
  g.traverse(o => {
    if (o.isMesh) { o.userData.remote = r; r.meshes.push(o); rayTargets.push(o); }
  });
  remotes.set(p.id, r);
  if (!r.alive) { r.fall = 1; g.rotation.x = -Math.PI / 2; g.position.y = 0.2; }
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.g);
  rayTargets = rayTargets.filter(o => o.userData.remote !== r);
  remotes.delete(id);
}

function updateRemotes(dt) {
  for (const r of remotes.values()) {
    if (r.alive) {
      const k = 1 - Math.exp(-dt * 14);           // suavizado del movimiento
      const p = r.g.position;
      const ox = p.x, oz = p.z;
      p.x += (r.tx - p.x) * k; p.y += (r.ty - p.y) * k; p.z += (r.tz - p.z) * k;
      r.stepAcc = (r.stepAcc || 0) + Math.hypot(p.x - ox, p.z - oz);
      if (r.stepAcc > 2.3) {
        r.stepAcc = 0;
        const dist = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
        if (dist < 28 && p.y < 0.3) sfxStep(0.07 * (1 - dist / 28));
      }
      let d = r.tyaw + Math.PI - r.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.yaw += d * k;
      r.g.rotation.set(0, r.yaw, 0);
    } else {
      r.fall = Math.min(1, r.fall + dt * 4);
      r.g.rotation.x = -Math.PI / 2 * r.fall;
      r.g.position.y = 0.2 * r.fall;
    }
    if (r.flash > 0) r.flash -= dt;
    setLit(r, r.flash > 0);
    const ghost = performance.now() < (r.prot || 0);       // protegido al reaparecer: se ve semitransparente
    if (ghost !== !!r.ghost) {
      r.ghost = ghost;
      for (const m of r.meshes) { m.material.transparent = ghost; m.material.opacity = ghost ? 0.4 : 1; m.material.needsUpdate = true; }
    }
  }
}

function updateRoomInfo() {
  $('map').textContent = mode === 'mp'
    ? 'Sala ' + roomCode + ' · ' + (remotes.size + 1) + ' jugadores · ' + myPing + ' ms'
    : 'Mapa: ' + MAP.name;
}

// create = true: crea una sala nueva · false: se une a la sala cuyo código está escrito en el menú
function startMulti(create) {
  const name = ($('name').value || '').trim().slice(0, 14);
  const code = ($('code').value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (!create && code.length !== 4) { $('menuerr').textContent = 'Escribe el código de 4 letras que te pasó tu amigo.'; return; }
  try { localStorage.setItem('bs_name', name); } catch (e) { /* sin almacenamiento */ }
  resetKeys();
  initAudio();
  mode = 'mp'; mpReady = false; netError = ''; roomCode = '';
  $('menuerr').textContent = '';
  joinMsg = { t: 'join', name, create: !!create, room: create ? '' : code, map: $('mapsel').value, skin: mySkin(), face: myFace(), tone: myTone(), pants: myPants() };
  canvas.requestPointerLock();
  say('Conectando...', 999);
  connectT0 = Date.now();
  clearTimeout(retryTimer);
  connectAttempt();

  // Tope total de espera; y el aviso de "despertando" si tarda más de 4 s
  clearInterval(connectTimer);
  connectTimer = setInterval(() => {
    if (mode !== 'mp' || mpReady) { clearInterval(connectTimer); return; }
    const s = (Date.now() - connectT0) / 1000;
    if (s > WAKE_SECONDS) { netFail('El servidor no respondió. Si estaba dormido, espera un minuto e inténtalo de nuevo.'); return; }
    if (s > 4) wakeNote();
  }, 1000);
}

function wakeNote() {
  say('Despertando el servidor... puede tardar hasta un minuto (' + Math.round((Date.now() - connectT0) / 1000) + ' s)', 999);
}

// Un intento de conexión. En internet (hosting gratis) el servidor puede estar dormido: mientras despierta,
// la conexión falla enseguida, así que se reintenta sola cada 3 s hasta WAKE_SECONDS.
// En tu PC o red local no se reintenta: si no conecta es que el servidor no está encendido.
function connectAttempt() {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let sock;
  try { sock = new WebSocket(url); } catch (e) { netFail('No se pudo conectar al servidor.'); return; }
  ws = sock;
  let opened = false, over = false;
  const giveUp = setTimeout(() => { if (!opened) { try { sock.close(); } catch (e) { /* ya cerrado */ } } }, 12000);   // saludo colgado
  sock.onopen = () => { opened = true; clearTimeout(giveUp); sock.send(JSON.stringify(joinMsg)); };
  sock.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    onNet(m);
  };
  const ended = () => {
    clearTimeout(giveUp);
    if (over) return;
    over = true;
    if (sock !== ws || mode !== 'mp') return;
    if (mpReady) { netFail('Se perdió la conexión con el servidor.'); return; }
    if (!opened && !isLocalHost && (Date.now() - connectT0) / 1000 < WAKE_SECONDS) {
      wakeNote();
      retryTimer = setTimeout(() => { if (mode === 'mp' && !mpReady && ws === sock) connectAttempt(); }, 3000);
      return;
    }
    netFail(opened ? 'El servidor cerró la conexión antes de entrar.'
          : isLocalHost ? 'No se pudo conectar. ¿Está encendido el servidor (node server.js)?'
          : 'El servidor no respondió. Si estaba dormido, espera un minuto e inténtalo de nuevo.');
  };
  sock.onerror = () => { if (!opened) ended(); };   // algunos navegadores solo avisan con "error" si no logra conectar
  sock.onclose = ended;
}

function netFail(msg) {
  const wasReady = mpReady;
  mpReady = false;
  clearInterval(pingTimer); clearInterval(connectTimer); clearTimeout(retryTimer);
  const old = ws; ws = null;
  try { if (old) old.close(); } catch (e) { /* ya estaba cerrado */ }
  msgEl.textContent = ''; msgT = 0;
  if (!wasReady) { mode = 'menu'; roomCode = ''; $('menuerr').textContent = msg; }
  else { mode = 'ended'; netError = msg; }
  deathEl.style.display = 'none';
  document.exitPointerLock();
  showOverlay();
}

function netSend(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function onNet(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id; mpReady = true;
      myTeam = m.team ?? 0;
      myMoney = m.money ?? ECO.startMoney;
      owned = WEAPONS.map((_, i) => i <= 1);
      loadMap(m.map || 'dust');
      player.pos.set(m.spawn.x, m.spawn.y, m.spawn.z);
      player.vx = player.vy = player.vz = 0;
      player.yaw = m.spawn.yaw; player.pitch = 0;
      player.kills = 0; player.deaths = 0;
      for (const p of m.players) addRemote(p);
      reviveLocal();
      showGun();
      msgEl.textContent = ''; msgT = 0;
      roomCode = m.room;
      feed('Sala ' + roomCode + ' · Equipo ' + (TEAMS[myTeam]?.name || '?') + ' · B comprar · Enter chat · V verte');
      clearInterval(pingTimer);
      pingTimer = setInterval(() => netSend({ t: 'ping', ts: Date.now(), rtt: myPing }), 2000);
      netSend({ t: 'ping', ts: Date.now(), rtt: myPing });
      shieldUntil = performance.now() + 1500;
      updateRoomInfo();
      updateHud();
      break;
    }
    case 'join':
      addRemote(m.p);
      { const nr = remotes.get(m.p.id); if (nr) nr.prot = performance.now() + 1500; }
      feed(m.p.name + ' entró a la partida');
      updateRoomInfo();
      break;
    case 'leave':
      removeRemote(m.id);
      roster.delete(m.id);
      feed(m.name + ' salió');
      updateRoomInfo();
      break;
    case 'state':
      for (const s of m.p) {
        if (s[0] === myId) continue;
        const r = remotes.get(s[0]);
        if (r) { r.tx = s[1]; r.ty = s[2]; r.tz = s[3]; r.tyaw = s[4]; }
      }
      break;
    case 'shot': {
      const r = remotes.get(m.id);
      if (!r) break;
      gunWorld(r.g.position, r.yaw, _mz);
      for (const e of m.e) { _e.set(e[0], e[1], e[2]); tracer(_mz.clone(), _e.clone()); puff(_e, 0xb8a888, 2); }
      const w = WEAPONS[m.w] || WEAPONS[1];
      const d = Math.hypot(r.g.position.x - player.pos.x, r.g.position.z - player.pos.z);
      sfxShot(w.vol / (1 + d * 0.08), w.rate2);
      break;
    }
    case 'nade': {
      spawnRemoteNade(m);
      break;
    }
    case 'hit': {
      const me = m.v === myId, mine = m.s === myId;
      if (me) { player.hp = m.hp; dmgFlash = 1; beep(120, 0.08, 0.15); }
      else { const r = remotes.get(m.v); if (r) r.flash = 0.08; }
      if (mine) { showHit(m.kill); player.hp = m.sh; }
      if (m.kill) {
        feed(nameOf(m.s) + '  ➜  ' + nameOf(m.v));
        if (me) playerDied(nameOf(m.s));
        else { const r = remotes.get(m.v); if (r) { r.alive = false; r.fall = 0; } }
      }
      updateHud();
      break;
    }
    case 'respawn': {
      if (m.id === myId) {
        shieldUntil = performance.now() + 1500;
        player.pos.set(m.x, m.y, m.z);
        player.vx = player.vy = player.vz = 0;
        player.yaw = m.yaw; player.pitch = 0;
        reviveLocal();
      } else {
        const r = remotes.get(m.id);
        if (r) {
          r.alive = true; r.fall = 0; r.prot = performance.now() + 1500;
          r.g.position.set(m.x, m.y, m.z);
          r.tx = m.x; r.ty = m.y; r.tz = m.z; r.tyaw = m.yaw; r.yaw = m.yaw + Math.PI;
          r.g.rotation.set(0, r.yaw, 0);
        }
      }
      break;
    }
    case 'correct':
      player.pos.set(m.x, m.y, m.z);
      player.vx = player.vy = player.vz = 0;
      break;
    case 'scores':
      roster.clear();
      if (m.teamScore) teamScore = m.teamScore;
      for (const row of m.l) {
        // [id, name, team, kills, deaths, money, alive]
        const [id, name, team, k, d, money, alive] = row;
        roster.set(id, { name, team, kills: k, deaths: d, money, alive });
      }
      if (roster.has(myId)) {
        player.kills = roster.get(myId).kills;
        player.deaths = roster.get(myId).deaths;
      }
      updateHud();
      if (boardEl.style.display === 'block') renderBoard();
      break;
    case 'money':
      myMoney = m.money;
      if (m.owned) owned = m.owned;
      if (m.bought != null) {
        const bw = WEAPONS[m.bought];
        if (bw) {
          if (bw.grenade) ammo[m.bought] = Math.min(bw.mag, (ammo[m.bought] || 0) + 1);
          else ammo[m.bought] = bw.mag;
        }
        selectWeapon(m.bought);
        say('Compraste ' + (bw?.name || 'arma'), 1.2);
      }
      updateHud();
      if (buyOpen) renderBuyMenu();
      break;
    case 'buyfail':
      say(m.reason === 'dinero' ? 'No tienes suficiente dinero' : 'No se puede comprar ahora', 1.5);
      break;
    case 'pong':
      myPing = Math.max(0, Date.now() - m.ts);
      updateRoomInfo();
      break;
    case 'phase':
      onPhase(m);
      break;
    case 'chat':
      addChat(m.n, m.text, m.team);
      break;
    case 'bomb': {
      if (m.state === 'clear') { bombState = null; updateBombVisual(); break; }
      bombState = {
        state: m.state,
        carrier: m.carrier,
        x: m.x, z: m.z, site: m.site,
        explodesAt: m.explodesAt,
        plantProg: m.plantProg || 0,
        defuseProg: m.defuseProg || 0,
        defuser: m.defuser,
      };
      updateBombVisual();
      if (m.state === 'planted') {
        say('¡BOMBA PLANTADA en ' + (m.site || '?') + '!', 2.5);
        // “Bomb planted” aproximado con tonos
        beep(180, 0.08, 0.18); setTimeout(() => beep(220, 0.08, 0.18), 90);
        setTimeout(() => beep(280, 0.12, 0.2), 200); setTimeout(() => beep(360, 0.18, 0.22), 340);
        bombBeepT = 0;
      }
      if (m.state === 'defused') {
        say('Bomba desactivada', 2);
        beep(520, 0.1, 0.18); setTimeout(() => beep(620, 0.1, 0.18), 100);
        setTimeout(() => beep(780, 0.2, 0.22), 220);
      }
      if (m.state === 'explode') {
        say('¡BOOM!', 2);
        beep(60, 0.5, 0.4); setTimeout(() => beep(40, 0.4, 0.3), 120);
        if (bombState) bigExplosion(new THREE.Vector3(bombState.x, 0.5, bombState.z));
        else dmgFlash = 1.2;
      }
      if (m.state === 'carried' && m.carrier === myId) say('Tienes la bomba — planta en A o B (E)', 2.5);
      break;
    }
    case 'full':
      netFail('La sala está llena (máximo 12 jugadores).');
      break;
    case 'noroom':
      netFail('No existe una sala con ese código. Revisa las 4 letras o crea una sala nueva.');
      break;
    case 'busy':
      netFail('El servidor tiene demasiadas salas abiertas. Inténtalo de nuevo en unos minutos.');
      break;
  }
}

// envía tu posición al servidor 20 veces por segundo (también en pausa)
function netTick(dt) {
  if (mode !== 'mp' || !mpReady || player.dead) return;
  stateT += dt;
  if (stateT < 0.05) return;
  stateT = 0;
  netSend({ t: 'state', x: r3(player.pos.x), y: r3(player.pos.y), z: r3(player.pos.z),
            yaw: r3(player.yaw), pitch: r3(player.pitch), w: cur });
}

/* ---------- Marcador (Tab) y chat (Enter) ---------- */
function renderBoard() {
  const rows = [...roster.entries()].sort((a, b) => (a[1].team - b[1].team) || b[1].kills - a[1].kills || a[1].deaths - b[1].deaths);
  let h = '<h3>Sala ' + esc(roomCode) + ' · <span style="color:#3b82f6">' + teamScore[0] + '</span> - <span style="color:#ef4444">' + teamScore[1] + '</span></h3>';
  h += '<table><tr><th>Nombre</th><th>Equipo</th><th>Bajas</th><th>Muertes</th><th>$</th></tr>';
  for (const [id, r] of rows) {
    const col = TEAMS[r.team]?.hex || '#fff';
    const dead = r.alive === false ? ' opacity:.5' : '';
    h += '<tr class="' + (id === myId ? 'me' : '') + '" style="' + dead + '"><td>' + esc(r.name) + '</td><td style="color:' + col + '">' + (TEAMS[r.team]?.name || '?') + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td><td>' + (r.money ?? '—') + '</td></tr>';
  }
  h += '</table><div class="ping">Tu ping: ' + myPing + ' ms · Equipo: ' + (TEAMS[myTeam]?.name || '?') + '</div>';
  boardEl.innerHTML = h;
}
function showBoard(on) {
  const show = on && mode === 'mp';
  boardEl.style.display = show ? 'block' : 'none';
  if (show) renderBoard();
}

let chatOpen = false;
function openChat() {
  chatOpen = true;
  chatIn.style.display = 'block';
  chatIn.value = '';
  chatIn.focus();
  resetKeys();
}
function closeChat() {
  chatOpen = false;
  chatIn.style.display = 'none';
  chatIn.blur();
}
chatIn.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const text = chatIn.value.trim();
    if (text) netSend({ t: 'chat', text });
    closeChat();
  } else if (e.key === 'Escape') closeChat();
});
const muted = new Set();      // nombres silenciados en el chat (solo para ti)
function addChat(name, text, team) {
  if (muted.has(name)) return;
  const el = document.createElement('div');
  const nm = document.createElement('b');
  nm.textContent = name + ': ';
  if (TEAMS[team]) nm.style.color = TEAMS[team].hex;
  el.appendChild(nm);
  el.appendChild(document.createTextNode(text));
  chatLog.appendChild(el);
  while (chatLog.children.length > 6) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => el.remove(), 9000);
}


/* =====================================================
   Bomba (Defuse)
   ===================================================== */
function clearSiteMarkers() {
  for (const m of siteMarkers) { scene.remove(m); m.geometry?.dispose(); m.material?.dispose(); }
  siteMarkers = [];
}
function buildSiteMarkers() {
  clearSiteMarkers();
  if (!MAP.sites) return;
  for (const [name, arr] of Object.entries(MAP.sites)) {
    const [x, z, rad] = arr;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(rad - 0.15, rad, 32),
      new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    scene.add(ring);
    siteMarkers.push(ring);
    // letra A/B
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5a623'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85 }));
    spr.scale.set(1.8, 1.8, 1); spr.position.set(x, 2.2, z);
    scene.add(spr); siteMarkers.push(spr);
  }
}
function ensureBombMesh() {
  if (bombMesh) return bombMesh;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.5), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  body.position.y = 0.12; g.add(body);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  light.position.set(0.12, 0.22, 0.15); g.add(light);
  g.visible = false; scene.add(g); bombMesh = g; return g;
}
function updateBombVisual() {
  const m = ensureBombMesh();
  if (!bombState || bombState.state === 'clear' || bombState.state === 'carried') {
    m.visible = false; return;
  }
  if (bombState.state === 'dropped' || bombState.state === 'planted' || bombState.state === 'defusing') {
    m.visible = true;
    m.position.set(bombState.x, 0, bombState.z);
    // parpadeo más rápido cuando queda poco
    if (bombState.explodesAt) {
      const left = (bombState.explodesAt - Date.now()) / 1000;
      const blink = left < 10 ? (Math.sin(Date.now() * 0.02) > 0) : (Math.sin(Date.now() * 0.008) > 0);
      m.children[1].material.color.set(blink ? 0xff2222 : 0x440000);
    }
  }
}

/** Pitido de la bomba que se acelera según el tiempo restante (estilo CS) */
function tickBombBeep(dt) {
  if (!bombState || (bombState.state !== 'planted' && bombState.state !== 'defusing') || !bombState.explodesAt) return;
  const left = Math.max(0, (bombState.explodesAt - Date.now()) / 1000);
  // intervalo: ~1.0 s al principio → ~0.12 s al final
  const interval = Math.max(0.12, 0.12 + (left / 40) * 0.9);
  bombBeepT -= dt;
  if (bombBeepT <= 0) {
    bombBeepT = interval;
    const pitch = left < 8 ? 280 : 200;
    beep(pitch, 0.05, left < 5 ? 0.22 : 0.14);
  }
}
function bombPrompt() {
  if (player.dead) return '';
  if (mode === 'mp' && (!mpReady || phase.ph !== 'play')) return '';
  if (mode !== 'mp' && mode !== 'practice') return '';
  const b = bombState;
  if (!b) return '';
  const carrierOk = mode === 'practice' ? (b.carrier === 'local') : (b.carrier === myId);
  // ¿Puedo plantar?
  if (b.state === 'carried' && carrierOk && myTeam === MATCH.attackerTeam) {
    if (!MAP.sites) return '';
    for (const [name, arr] of Object.entries(MAP.sites)) {
      const [sx, sz, rad] = arr;
      if (Math.hypot(player.pos.x - sx, player.pos.z - sz) <= rad) {
        const prog = Math.min(1, (b.plantProg || 0) / MATCH.plantSec);
        return prog > 0 ? ('Plantando ' + name + '… ' + Math.floor(prog * 100) + '%') : ('Mantén E para plantar en ' + name);
      }
    }
  }
  // ¿Puedo desactivar?
  if ((b.state === 'planted' || b.state === 'defusing') && myTeam === MATCH.defenderTeam) {
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) <= MATCH.bombRadius + 0.6) {
      const prog = Math.min(1, (b.defuseProg || 0) / MATCH.defuseSec);
      return prog > 0 ? ('Desactivando… ' + Math.floor(prog * 100) + '%') : 'Mantén E para desactivar la bomba';
    }
  }
  // ¿Puedo recoger?
  if (b.state === 'dropped' && myTeam === MATCH.attackerTeam) {
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < 1.5) return 'Pasa cerca para recoger la bomba';
  }
  return '';
}
function tickBombHold(dt) {
  if (!bombHold || player.dead) return;
  if (mode === 'mp') {
    if (!mpReady || phase.ph !== 'play') return;
    bombActAcc += dt;
    if (bombActAcc < 0.12) return;
    bombActAcc = 0;
    const b = bombState;
    if (!b) return;
    if (b.state === 'carried' && b.carrier === myId && myTeam === MATCH.attackerTeam) {
      if (!MAP.sites) return;
      for (const [name, arr] of Object.entries(MAP.sites)) {
        const [sx, sz, rad] = arr;
        if (Math.hypot(player.pos.x - sx, player.pos.z - sz) <= rad) {
          netSend({ t: 'bombact', act: 'plant', site: name });
          return;
        }
      }
      netSend({ t: 'bombact', act: 'stop' });
    } else if ((b.state === 'planted' || b.state === 'defusing') && myTeam === MATCH.defenderTeam) {
      if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) <= MATCH.bombRadius + 0.6) {
        netSend({ t: 'bombact', act: 'defuse' });
      } else {
        netSend({ t: 'bombact', act: 'stop' });
      }
    }
    return;
  }
  // ----- práctica local -----
  if (mode !== 'practice' || !bombState) return;
  const b = bombState;
  if (b.state === 'carried' && b.carrier === 'local' && myTeam === MATCH.attackerTeam && MAP.sites) {
    let onSite = null, sx = 0, sz = 0;
    for (const [name, arr] of Object.entries(MAP.sites)) {
      const [x, z, rad] = arr;
      if (Math.hypot(player.pos.x - x, player.pos.z - z) <= rad) { onSite = name; sx = x; sz = z; break; }
    }
    if (onSite) {
      b.plantProg = (b.plantProg || 0) + dt;
      if (b.plantProg >= MATCH.plantSec) {
        b.state = 'planted'; b.site = onSite; b.x = sx; b.z = sz; b.carrier = null;
        b.plantProg = 0; b.explodesAt = Date.now() + MATCH.bombTimerSec * 1000;
        bombBeepT = 0;
        say('¡BOMBA PLANTADA en ' + onSite + '!', 2.5);
        beep(180, 0.08, 0.18); setTimeout(() => beep(220, 0.08, 0.18), 90);
        setTimeout(() => beep(280, 0.12, 0.2), 200);
        updateBombVisual();
      }
    } else {
      b.plantProg = 0;
    }
  } else if ((b.state === 'planted' || b.state === 'defusing') && myTeam === MATCH.defenderTeam) {
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) <= MATCH.bombRadius + 0.6) {
      b.state = 'defusing';
      b.defuseProg = (b.defuseProg || 0) + dt;
      if (b.defuseProg >= MATCH.defuseSec) {
        say('Bomba desactivada', 2);
        beep(520, 0.1, 0.18); setTimeout(() => beep(780, 0.2, 0.22), 220);
        bombState = null;
        updateBombVisual();
        practiceRoundEnd('defuse');
      }
    } else {
      b.defuseProg = 0;
      if (b.state === 'defusing') b.state = 'planted';
    }
  }
}

let practiceResetT = 0;
function practiceRoundEnd(reason) {
  if (mode !== 'practice') return;
  if (reason === 'explode') {
    say('¡BOOM! — nueva ronda en 4 s', 3);
    if (bombState) bigExplosion(new THREE.Vector3(bombState.x, 0.5, bombState.z));
  } else if (reason === 'defuse') {
    say('Desactivada — nueva ronda en 4 s', 3);
  } else {
    say('Nueva ronda en 4 s', 2);
  }
  practiceResetT = 4;
  bombState = null;
  updateBombVisual();
}

function tickPractice(dt) {
  if (mode !== 'practice') return;
  // explosión de bomba
  if (bombState && bombState.state === 'planted' && bombState.explodesAt && Date.now() >= bombState.explodesAt) {
    practiceRoundEnd('explode');
  }
  // recoger bomba del suelo
  if (bombState && bombState.state === 'dropped' && myTeam === MATCH.attackerTeam && !player.dead) {
    if (Math.hypot(player.pos.x - bombState.x, player.pos.z - bombState.z) < 1.4) {
      bombState.state = 'carried'; bombState.carrier = 'local';
      say('Tienes la bomba — planta en A o B (E)', 2);
      updateBombVisual();
    }
  }
  if (practiceResetT > 0) {
    practiceResetT -= dt;
    if (practiceResetT <= 0) resetPracticeRound();
  }
}

function resetPracticeRound() {
  // revivir jugador y bots, dar bomba de nuevo
  placePlayer();
  reviveLocal();
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  for (const b of bots) {
    b.alive = false; b.respawn = 0.1;
  }
  bombState = {
    state: 'carried', carrier: 'local', plantProg: 0, defuseProg: 0,
    x: 0, z: 0, site: null, explodesAt: 0
  };
  updateBombVisual();
  say('Ronda de práctica — eres Bravo, planta la bomba (E en A/B)', 3);
  updateHud();
}

/* =====================================================
   Disparo del jugador
   ===================================================== */
const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3(), fwd = new THREE.Vector3(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3();

function shoot() {
  const w = WEAPONS[cur];
  // las fases de ronda (freeze, descanso...) solo existen en línea; contra bots siempre se puede disparar
  if (mode === 'mp' && (phase.ph === 'freeze' || phase.ph === 'break' || phase.ph === 'final' || phase.ph === 'wait')) return;
  if (w.grenade) { throwGrenade(w); return; }
  if (!w.melee && ammo[cur] <= 0) { say('Sin munición — R para recargar'); return; }
  if (!w.melee) ammo[cur]--;
  fireCd = w.rate;
  gunKick = w.kick; flashT = 0.04; guns[cur].flash.visible = !w.melee;
  sfxShot(w.vol, w.rate2);

  camera.updateMatrixWorld(true);
  // Precisión estilo CS: muy preciso quieto, impreciso al correr/saltar
  const spd = Math.hypot(player.vx, player.vz);
  let spread = w.spread || 0;
  if (w.melee) spread = 0.015;
  else {
    if (!player.onGround) spread += 0.08;
    else if (spd > 3.5) spread += 0.045;
    else if (spd > 1.2) spread += 0.018;
    if (keys.ShiftLeft || keys.ShiftRight) spread *= 0.55;
  }
  camera.getWorldDirection(fwd);
  camera.getWorldPosition(origin);
  guns[cur].flash.getWorldPosition(muzzle);

  let anyHit = false, anyKill = false;
  const dirs = [];
  for (let i = 0; i < w.pellets; i++) {
    dir.copy(fwd);
    dir.x += (Math.random() - .5) * spread * 2;
    dir.y += (Math.random() - .5) * spread * 2;
    dir.z += (Math.random() - .5) * spread * 2;
    dir.normalize();
    dirs.push([r3(dir.x), r3(dir.y), r3(dir.z)]);
    raycaster.set(origin, dir);
    raycaster.far = w.melee ? 2.2 : 150;
    let end = origin.clone().addScaledVector(dir, 100);
    for (const h of raycaster.intersectObjects(rayTargets, false)) {
      const b = h.object.userData.bot, r = h.object.userData.remote;
      if (b && !b.alive) continue;
      if (r && !r.alive) continue;
      end = h.point;
      if (b) {                                    // solo: el daño se calcula aquí
        anyHit = true;
        if (damageBot(b, h.object.userData.part, w, h.distance)) anyKill = true;
        puff(h.point, 0xcc2222, w.pellets > 1 ? 2 : 6);
      } else if (r) puff(h.point, 0xcc2222, w.pellets > 1 ? 2 : 6);   // online: el servidor decide el daño
      else {
        puff(h.point, 0xb8a888, w.pellets > 1 ? 2 : 4);
        if (!w.melee && h.face) bulletHole(h.point, h.face.normal);
      }
      break;
    }
    if (i < 3) tracer(muzzle.clone(), end);
  }
  if (!w.melee) ejectCasing();
  if (anyHit) showHit(anyKill);
  if (mode === 'mp') netSend({ t: 'shoot', w: cur, dirs });

  // Recoil acumulativo estilo CS
  const rc = RECOIL[w.id] || { up: 0.02, side: 0.01, recover: 5 };
  recoilPitch += rc.up;
  recoilYaw += (Math.random() - 0.5) * rc.side * 2;
  player.pitch += rc.up * 0.85;
  player.yaw += (Math.random() - 0.5) * rc.side;
  updateHud();
}

function reload() {
  const w = WEAPONS[cur];
  if (w.melee || w.grenade || reloading || ammo[cur] === w.mag || player.dead) return;
  reloading = true; reloadT = w.reload;
  say('Recargando...', w.reload);
  beep(300, 0.06, 0.1); setTimeout(() => beep(220, 0.05, 0.1), 90);
  if (mode === 'mp') netSend({ t: 'reload', w: cur });
}

/* ---------- HUD ---------- */
function updateHud() {
  const w = WEAPONS[cur];
  $('hptxt').textContent = Math.ceil(player.hp);
  const fill = $('hpfill');
  fill.style.width = player.hp + '%';
  fill.style.background = player.hp > 50 ? '#3ddc5a' : player.hp > 25 ? '#f5c542' : '#e5483b';
  if (w.melee) $('ammo').innerHTML = '∞';
  else $('ammo').innerHTML = ammo[cur] + ' <small>/ ' + w.mag + '</small>';
  const teamName = TEAMS[myTeam]?.name || '';
  const teamCol = TEAMS[myTeam]?.hex || '#fff';
  $('score').innerHTML = '<span style="color:' + teamCol + '">' + teamName + '</span> · $' + myMoney
    + ' · <span style="color:#3b82f6">' + teamScore[0] + '</span>-<span style="color:#ef4444">' + teamScore[1] + '</span>'
    + ' · K/D ' + player.kills + '/' + player.deaths;
  for (let i = 0; i < WEAPONS.length; i++) {
    const el = $('w' + i);
    if (!el) continue;
    el.classList.toggle('on', i === cur);
    const has = i <= 1 || (owned[i] && (!WEAPONS[i].grenade || ammo[i] > 0));
    el.style.opacity = has ? (i === cur ? '1' : '0.75') : '0.3';
  }
}
updateHud();

/* ---------- Menú de compra (B) ---------- */
function toggleBuy() {
  if (mode !== 'mp' || !mpReady) return;
  if (phase.ph !== 'freeze' && phase.ph !== 'break') {
    say('Solo puedes comprar en freeze o descanso', 1.5);
    return;
  }
  buyOpen = !buyOpen;
  const el = $('buymenu');
  if (!el) return;
  el.style.display = buyOpen ? 'block' : 'none';
  if (buyOpen) {
    document.exitPointerLock();
    renderBuyMenu();
  } else if (!player.dead) {
    canvas.requestPointerLock();
  }
}
function renderBuyMenu() {
  const el = $('buymenu');
  if (!el) return;
  let h = '<h2>TIENDA · $' + myMoney + '</h2><p style="opacity:.7;margin-bottom:10px">Pulsa B para cerrar · 7/8/9 granadas · G ciclar</p>';
  for (let i = 2; i < WEAPONS.length; i++) {
    const w = WEAPONS[i];
    const isNade = !!w.grenade;
    const full = isNade ? (ammo[i] >= w.mag) : owned[i];
    const can = myMoney >= w.price && !full;
    const have = owned[i] && (!isNade || ammo[i] > 0);
    h += '<button class="buybtn' + (have ? ' have' : '') + '" data-w="' + i + '" ' + (can || (have && !isNade) ? '' : (can ? '' : 'disabled')) + '>'
      + (i + 1) + ' ' + w.name + ' — $' + w.price
      + (isNade ? (ammo[i] ? ' ×' + ammo[i] : '') : (owned[i] ? ' ✓' : ''))
      + '</button>';
  }
  el.innerHTML = h;
  el.querySelectorAll('.buybtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wi = +btn.dataset.w;
      const w = WEAPONS[wi];
      if (owned[wi] && !w.grenade) { selectWeapon(wi); toggleBuy(); return; }
      if (w.grenade && ammo[wi] >= w.mag) { selectWeapon(wi); toggleBuy(); return; }
      netSend({ t: 'buy', w: wi });
    });
  });
}


/* =====================================================
   Tutorial interactivo (primera vez / botón del menú)
   ===================================================== */
const TUTORIAL_STEPS = [
  {
    title: '¡Bienvenido a Blocky Strike!',
    body: 'Es un shooter en equipos inspirado en el estilo de Counter-Strike.<br><br><b>Alpha (azul)</b> defiende · <b>Bravo (rojo)</b> ataca y planta la bomba.<br><br>En 1 minuto sabrás jugar.',
  },
  {
    title: 'Moverte y mirar',
    body: '<b>W A S D</b> para moverte<br><b>Mouse</b> para mirar<br><b>Espacio</b> para saltar<br><b>Shift</b> para caminar (más preciso y silencioso)<br><b>V</b> para verte en tercera persona<br><br>Quédate quieto o camina al disparar: si corres, fallas más.',
  },
  {
    title: 'Disparar y armas',
    body: '<b>Clic izquierdo</b> dispara<br><b>R</b> recarga<br><b>1</b> cuchillo · <b>2</b> pistola · <b>3</b> SMG · <b>4</b> rifle · <b>5</b> escopeta · <b>6</b> sniper<br><b>Clic derecho</b> zoom del francotirador<br><br>El rifle y el SMG tienen retroceso: suelta el gatillo para recuperar precisión.',
  },
  {
    title: 'Equipos y rondas',
    body: 'Cada ronda empieza con <b>freeze</b> (unos segundos sin moverte).<br><br>Si mueres, <b>no reapareces</b> hasta la siguiente ronda.<br>Gana el equipo que elimina al otro o cumple el objetivo de la bomba.<br><br>Partida a 12 rondas. Marcador con <b>Tab</b>.',
  },
  {
    title: 'Economía y compra',
    body: 'Empiezas con <b>$800</b>. Ganas dinero por kills y por ganar/perder rondas.<br><br>Durante el freeze o el descanso pulsa <b>B</b> para abrir la tienda y comprar armas mejores.<br><br>La pistola y el cuchillo son gratis. El resto se paga.',
  },
  {
    title: 'La bomba (Defuse)',
    body: '<b>Bravo</b> recibe la bomba. Llévala a un sitio <b>A</b> o <b>B</b> (anillos naranjas) y mantén <b>E</b> para plantar.<br><br><b>Alpha</b> debe encontrar la bomba y mantener <b>E</b> para desactivarla antes de que explote (40 s).<br><br>Si el portador muere, la bomba cae y otro atacante puede recogerla.',
  },
  {
    title: 'Listo para jugar',
    body: 'Practica primero con <b>Jugar contra bots</b>.<br>Cuando quieras, <b>Crear sala</b> y comparte el código de 4 letras con tus amigos.<br><br>Controles rápidos: <b>B</b> tienda · <b>E</b> bomba · <b>Tab</b> marcador · <b>Enter</b> chat · <b>V</b> verte · <b>Esc</b> pausa.<br><br>¡Buena suerte, soldado!',
  },
];

let tutStep = 0;
let tutForced = false;

function hasSeenTutorial() {
  try { return localStorage.getItem('bs_tut_v2') === '1'; } catch { return false; }
}
function markTutorialSeen() {
  try { localStorage.setItem('bs_tut_v2', '1'); } catch {}
}

function openTutorial(fromMenu) {
  tutStep = 0;
  tutForced = !fromMenu;
  const el = $('tutorial');
  if (!el) return;
  el.style.display = 'flex';
  renderTutorialStep();
}

function closeTutorial(mark) {
  const el = $('tutorial');
  if (el) el.style.display = 'none';
  if (mark) markTutorialSeen();
}

function renderTutorialStep() {
  const s = TUTORIAL_STEPS[tutStep];
  if (!s) { closeTutorial(true); return; }
  $('tstepnum').textContent = 'Paso ' + (tutStep + 1) + ' de ' + TUTORIAL_STEPS.length;
  $('ttitle').textContent = s.title;
  $('tbody').innerHTML = s.body;
  const prog = $('tprogress');
  prog.innerHTML = TUTORIAL_STEPS.map((_, i) => '<i class="' + (i <= tutStep ? 'on' : '') + '"></i>').join('');
  $('tNext').textContent = tutStep >= TUTORIAL_STEPS.length - 1 ? '¡A jugar!' : 'Siguiente';
  $('tSkip').style.display = tutStep >= TUTORIAL_STEPS.length - 1 ? 'none' : 'inline-block';
}

function tutorialNext() {
  if (tutStep >= TUTORIAL_STEPS.length - 1) {
    closeTutorial(true);
    return;
  }
  tutStep++;
  renderTutorialStep();
}

// Auto-abrir la primera vez
try {
  if (!hasSeenTutorial()) {
    // pequeño delay para que cargue el DOM
    setTimeout(() => openTutorial(false), 400);
  }
} catch {}


/* =====================================================
   Menú, pausa y entrada
   ===================================================== */
function resetKeys() { for (const k in keys) keys[k] = false; mouseDown = false; trigger = false; }

function showOverlay() {
  overlay.style.display = 'flex';
  const menu = mode === 'menu';
  $('menu').style.display = menu ? 'block' : 'none';
  $('pause').style.display = menu ? 'none' : 'block';
  $('pausemsg').textContent = netError || 'Juego en pausa';
  $('btnResume').style.display = netError ? 'none' : 'inline-block';
  $('roominfo').style.display = (mode === 'mp' && roomCode && !netError) ? 'block' : 'none';
  if (!menu) renderMuteList();
  $('roomcode').textContent = roomCode;
  // sincronizar controles de opciones
  const sr = $('sensrange'), sv = $('sensval'), vr = $('volrange'), vv = $('volval');
  if (sr) { sr.value = Math.round(sensMult * 100); if (sv) sv.textContent = sr.value + '%'; }
  if (vr) { vr.value = Math.round(masterVol * 100); if (vv) vv.textContent = vr.value + '%'; }
  if ($('gfxsel')) $('gfxsel').value = String(gfxQuality);
}

function startSolo() {
  loadMap($('mapsel').value);
  resetKeys();
  initAudio();
  mode = 'solo';
  myTeam = 0;
  updateRoomInfo();
  placePlayer();
  for (let i = 0; i < CFG.bots; i++) spawnBot(makeBot(i, 1));
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  reviveLocal();
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  showGun();
  updateHud();
  canvas.requestPointerLock();
}

function startPractice() {
  loadMap($('mapsel').value);
  resetKeys();
  initAudio();
  mode = 'practice';
  myTeam = MATCH.attackerTeam; // Bravo = planta
  updateRoomInfo();
  // spawns del equipo atacante
  if (MAP.teamSpawns && MAP.teamSpawns[myTeam]) {
    const s = MAP.teamSpawns[myTeam][0];
    player.pos.set(s[0], 0, s[1]);
    player.yaw = s[1] > 0 ? Math.PI : 0;
  } else {
    placePlayer();
  }
  // limpiar bots viejos
  for (const b of bots) {
    scene.remove(b.g);
    rayTargets = rayTargets.filter(o => o.userData.bot !== b);
  }
  bots.length = 0;
  // 3 defensores (Alpha) + 2 compañeros (Bravo)
  for (let i = 0; i < 3; i++) spawnBot(makeBot(i, MATCH.defenderTeam));
  for (let i = 0; i < 2; i++) spawnBot(makeBot(3 + i, MATCH.attackerTeam));
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  reviveLocal();
  for (let i = 6; i <= 8; i++) { owned[i] = true; ammo[i] = WEAPONS[i].mag; }
  bombState = {
    state: 'carried', carrier: 'local', plantProg: 0, defuseProg: 0,
    x: 0, z: 0, site: null, explodesAt: 0
  };
  practiceResetT = 0;
  showGun();
  updateHud();
  updateBombVisual();
  say('Práctica: eres Bravo. Planta en A/B (E). Los azules defienden.', 4);
  canvas.requestPointerLock();
}

try { $('name').value = localStorage.getItem('bs_name') || ''; } catch (e) { /* sin almacenamiento */ }
$('btnSolo').addEventListener('click', startSolo);
$('btnPractice')?.addEventListener('click', startPractice);
$('btnTutorial')?.addEventListener('click', () => openTutorial(true));
$('btnTutPause')?.addEventListener('click', () => { openTutorial(true); });
$('tNext')?.addEventListener('click', tutorialNext);
$('tSkip')?.addEventListener('click', () => closeTutorial(true));
$('mapsel').addEventListener('change', () => loadMap($('mapsel').value));

/* ---------- Selector de mapas con plano real ---------- */
const MAP_DESC = {
  dust: 'Arena abierta con contenedores, cajas y plataformas.',
  almacen: 'Pasillos industriales, estantes y pasarela elevada.',
  cruce: 'Cuatro edificios en las esquinas y fuente central.',
};
let pendingMapKey = 'dust';

function drawMapPreview(canvas, key) {
  const map = MAPS[key];
  if (!map || !canvas) return;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const ground = map.ground || 0x888888;
  const sky = map.sky || 0x88aacc;
  ctx.fillStyle = '#' + new THREE.Color(sky).getHexString();
  ctx.fillRect(0, 0, W, H * 0.22);
  ctx.fillStyle = '#' + new THREE.Color(ground).getHexString();
  ctx.fillRect(0, H * 0.22, W, H);
  const scale = Math.min(W, H) / 68;
  const ox = W / 2, oy = H / 2 + H * 0.06;
  const boxes = map.boxes || [];
  const sorted = boxes.slice().sort((a, b) => (a[1] + (a[6] || 0)) - (b[1] + (b[6] || 0)));
  for (const box of sorted) {
    const [cx, cz, w, d, h, color, y0 = 0] = box;
    const x = ox + (cx - w / 2) * scale;
    const y = oy + (cz - d / 2) * scale;
    const bw = Math.max(1, w * scale);
    const bd = Math.max(1, d * scale);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 1.5, y + 1.5, bw, bd);
    const col = new THREE.Color(color);
    if (h > 3) col.offsetHSL(0, 0, 0.06);
    else if (y0 > 0) col.offsetHSL(0, 0, 0.04);
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(x, y, bw, bd);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x, y, bw, bd);
  }
  if (map.sites) {
    for (const [name, arr] of Object.entries(map.sites)) {
      const [sx, sz] = arr;
      const x = ox + sx * scale, y = oy + sz * scale;
      ctx.fillStyle = name === 'A' ? '#3b82f6' : '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x, y);
    }
  }
}

function buildMapBrowser() {
  const grid = $('mapGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const key of Object.keys(MAPS)) {
    const map = MAPS[key];
    const card = document.createElement('div');
    card.className = 'mcard' + (key === pendingMapKey ? ' on' : '');
    card.dataset.map = key;
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 300;
    drawMapPreview(cv, key);
    const lab = document.createElement('div');
    lab.className = 'lab';
    lab.textContent = map.name;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = MAP_DESC[key] || '';
    card.appendChild(cv);
    card.appendChild(lab);
    card.appendChild(desc);
    card.addEventListener('click', () => {
      pendingMapKey = key;
      grid.querySelectorAll('.mcard').forEach(c => c.classList.toggle('on', c === card));
      $('mapsel').value = key;
      loadMap(key);
    });
    grid.appendChild(card);
  }
}

function openMapBrowser() {
  pendingMapKey = $('mapsel')?.value || 'dust';
  buildMapBrowser();
  const el = $('mapBrowser');
  if (el) el.classList.add('open');
  loadMap(pendingMapKey);
}

function closeMapBrowser(apply) {
  const el = $('mapBrowser');
  if (el) el.classList.remove('open');
  if (apply) {
    $('mapsel').value = pendingMapKey;
    loadMap(pendingMapKey);
    const lab = $('mapLabel');
    if (lab) lab.textContent = MAPS[pendingMapKey]?.name || pendingMapKey;
  } else {
    // restaurar el mapa que estaba elegido antes
    const cur = $('mapsel')?.value || 'dust';
    loadMap(cur);
  }
}

$('btnMaps')?.addEventListener('click', openMapBrowser);
$('btnMapOk')?.addEventListener('click', () => closeMapBrowser(true));
$('btnMapBack')?.addEventListener('click', () => closeMapBrowser(false));
if ($('mapLabel')) $('mapLabel').textContent = MAPS[$('mapsel')?.value || 'dust']?.name || 'Dust Blocks';

/* ---------- Inventario (cara / ropa / pantalones / piel) ---------- */
const INV_CATS = {
  face: [
    { id: 0, name: 'Lentes', color: '#66ccff' },
    { id: 1, name: 'Enojado', color: '#c45a3a' },
    { id: 2, name: 'Agresivo', color: '#d01818' },
    { id: 3, name: 'Sonriente', color: '#f0c060' },
  ],
  shirt: [
    { id: 0, name: 'Soldado', color: '#3b82f6' },
    { id: 1, name: 'Instituto', color: '#1d4ea0' },
    { id: 2, name: 'Negro', color: '#1a1a1e' },
    { id: 3, name: 'Rojo', color: '#8b1a1a' },
  ],
  pants: [
    { id: 0, name: 'Militar', color: '#2f3444' },
    { id: 1, name: 'Azul', color: '#1e3a6e' },
    { id: 2, name: 'Camo', color: '#3a4a30' },
    { id: 3, name: 'Negro', color: '#1a1a1e' },
  ],
  tone: [
    { id: 0, name: 'Claro', color: '#f0c9a0' },
    { id: 1, name: 'Medio-claro', color: '#e0ac69' },
    { id: 2, name: 'Medio', color: '#c68642' },
    { id: 3, name: 'Oscuro', color: '#8d5524' },
    { id: 4, name: 'Muy oscuro', color: '#5c3317' },
  ],
};
let invTab = 'face';
let invDraft = { face: cosFace, shirt: cosShirt, pants: cosPants, tone: cosTone };

function drawInvPreview() {
  const cv = $('invCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0e1218';
  ctx.fillRect(0, 0, W, H);
  // colores actuales
  const skin = INV_CATS.tone[invDraft.tone]?.color || '#e0ac69';
  const shirt = INV_CATS.shirt[invDraft.shirt]?.color || '#3b82f6';
  const pants = INV_CATS.pants[invDraft.pants]?.color || '#2f3444';
  const cx = W / 2;
  // botas
  ctx.fillStyle = '#1c1c20';
  ctx.fillRect(cx - 28, H - 28, 22, 14); ctx.fillRect(cx + 6, H - 28, 22, 14);
  // pantalones
  ctx.fillStyle = pants;
  ctx.fillRect(cx - 26, H - 100, 22, 74); ctx.fillRect(cx + 4, H - 100, 22, 74);
  // torso
  ctx.fillStyle = shirt;
  ctx.fillRect(cx - 32, H - 165, 64, 68);
  // brazos
  ctx.fillRect(cx - 48, H - 160, 16, 55); ctx.fillRect(cx + 32, H - 160, 16, 55);
  // cuello + cabeza
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 10, H - 178, 20, 14);
  ctx.fillRect(cx - 22, H - 220, 44, 44);
  // cara simple
  const face = invDraft.face;
  if (face === 0) {
    ctx.fillStyle = '#15151a'; ctx.fillRect(cx - 18, H - 202, 36, 8);
    ctx.fillStyle = '#66ccff'; ctx.fillRect(cx - 14, H - 200, 10, 6); ctx.fillRect(cx + 4, H - 200, 10, 6);
  } else {
    ctx.fillStyle = face === 2 ? '#ffffff' : '#fafafa';
    ctx.fillRect(cx - 14, H - 204, 10, 8); ctx.fillRect(cx + 4, H - 204, 10, 8);
    ctx.fillStyle = face === 2 ? '#d01818' : '#111';
    ctx.fillRect(cx - 11, H - 202, 4, 5); ctx.fillRect(cx + 7, H - 202, 4, 5);
    ctx.fillStyle = '#5a1d1d';
    if (face === 3) ctx.fillRect(cx - 10, H - 186, 20, 4);
    else if (face === 1) ctx.fillRect(cx - 8, H - 184, 16, 4);
    else { ctx.fillStyle = '#f4f0e6'; ctx.fillRect(cx - 12, H - 188, 24, 8); }
  }
  // casco / gorro
  ctx.fillStyle = '#2a3040';
  ctx.fillRect(cx - 24, H - 228, 48, 12);
  const pn = $('invPname');
  if (pn) pn.textContent = [
    INV_CATS.face[invDraft.face]?.name,
    INV_CATS.shirt[invDraft.shirt]?.name,
    INV_CATS.pants[invDraft.pants]?.name,
  ].filter(Boolean).join(' · ');
}

function renderInvGrid() {
  const grid = $('invGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const list = INV_CATS[invTab] || [];
  const cur = invDraft[invTab];
  for (const it of list) {
    const el = document.createElement('div');
    el.className = 'item' + (it.id === cur ? ' on' : '');
    el.innerHTML = '<div class="swatch" style="background:' + it.color + '"></div><div>' + it.name + '</div>';
    el.addEventListener('click', () => {
      invDraft[invTab] = it.id;
      renderInvGrid();
      drawInvPreview();
    });
    grid.appendChild(el);
  }
}

function openInventory() {
  invDraft = { face: cosFace, shirt: cosShirt, pants: cosPants, tone: cosTone };
  invTab = 'face';
  document.querySelectorAll('#invTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === invTab));
  renderInvGrid();
  drawInvPreview();
  $('invBrowser')?.classList.add('open');
}

function closeInventory(apply) {
  $('invBrowser')?.classList.remove('open');
  if (apply) {
    cosFace = invDraft.face;
    cosShirt = invDraft.shirt;
    cosPants = invDraft.pants;
    cosTone = invDraft.tone;
    saveCos('bs_face', cosFace);
    saveCos('bs_skin', cosShirt);
    saveCos('bs_pants', cosPants);
    saveCos('bs_tone', cosTone);
    syncCosSelects();
    // forzar reconstrucción del personaje en 3ª persona
    selfSkin = -1;
  }
}

$('btnInv')?.addEventListener('click', openInventory);
$('btnInvOk')?.addEventListener('click', () => closeInventory(true));
$('btnInvBack')?.addEventListener('click', () => closeInventory(false));
document.querySelectorAll('#invTabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    invTab = btn.dataset.tab;
    document.querySelectorAll('#invTabs button').forEach(b => b.classList.toggle('on', b === btn));
    renderInvGrid();
  });
});

const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
$('btnCreate').addEventListener('click', () => startMulti(true));
$('btnJoin').addEventListener('click', () => startMulti(false));
$('code').addEventListener('input', () => { $('code').value = cleanCode($('code').value); });
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') startMulti(false); });
// enlace para amigos: https://.../?sala=ABCD deja el código escrito en el menú
try { const q = new URLSearchParams(location.search).get('sala'); if (q) $('code').value = cleanCode(q); } catch (e) { /* sin parámetros */ }
$('btnCopy').addEventListener('click', async () => {
  const link = location.origin + '/?sala=' + roomCode;
  try { await navigator.clipboard.writeText(link); $('btnCopy').textContent = '¡Enlace copiado!'; }
  catch (e) { $('btnCopy').textContent = link; }
  setTimeout(() => { $('btnCopy').textContent = 'Copiar enlace para amigos'; }, 3000);
});
$('btnResume').addEventListener('click', () => canvas.requestPointerLock());
$('btnExit').addEventListener('click', () => location.reload());
$('btnOpts')?.addEventListener('click', () => {
  const o = $('opts');
  if (!o) return;
  o.style.display = o.style.display === 'block' ? 'none' : 'block';
});
$('sensrange')?.addEventListener('input', () => {
  const v = parseInt($('sensrange').value, 10);
  sensMult = Math.max(0.2, Math.min(2, v / 100));
  if ($('sensval')) $('sensval').textContent = Math.round(sensMult * 100) + '%';
  try { localStorage.setItem('bs_sens', String(Math.round(sensMult * 100))); } catch (e) {}
});
$('volrange')?.addEventListener('input', () => {
  const v = parseInt($('volrange').value, 10);
  masterVol = Math.max(0, Math.min(1, v / 100));
  if ($('volval')) $('volval').textContent = Math.round(masterVol * 100) + '%';
  try { localStorage.setItem('bs_vol', String(Math.round(masterVol * 100))); } catch (e) {}
});
$('gfxsel')?.addEventListener('change', () => {
  const q = parseInt($('gfxsel').value, 10);
  if (q === 0 || q === 1 || q === 2) applyGfxQuality(q);
});

addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;   // escribiendo en el menú o en el chat
  if (e.code === 'Tab' && mode !== 'menu') { e.preventDefault(); if (locked) showBoard(true); return; }
  keys[e.code] = true;
  if (!locked) return;
  // espectador: Espacio o flechas para cambiar de jugador
  if (player.dead && mode === 'mp') {
    if (e.code === 'Space' || e.code === 'KeyQ' || e.code === 'ArrowRight') { e.preventDefault(); nextSpectator(1); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyE') { e.preventDefault(); nextSpectator(-1); return; }
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  if (e.code === 'Enter' && mode === 'mp' && mpReady) { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyB') toggleBuy();
  if (e.code === 'KeyV' && (mode === 'solo' || mode === 'practice' || (mode === 'mp' && mpReady)) && !player.dead) { thirdP = !thirdP; say(thirdP ? 'Tercera persona (V para volver)' : 'Primera persona', 1.2); }
  if (e.code === 'KeyE') bombHold = true;
  if (e.code === 'Digit1') selectWeapon(0); // cuchillo
  if (e.code === 'Digit2') selectWeapon(1); // pistola
  if (e.code === 'Digit3') selectWeapon(2); // smg
  if (e.code === 'Digit4') selectWeapon(3); // rifle
  if (e.code === 'Digit5') selectWeapon(4); // escopeta
  if (e.code === 'Digit6') selectWeapon(5); // sniper
  if (e.code === 'Digit7') selectWeapon(6); // HE
  if (e.code === 'Digit8') selectWeapon(7); // flash
  if (e.code === 'Digit9') selectWeapon(8); // smoke
  if (e.code === 'KeyG') { // ciclar granadas
    const order = [6, 7, 8];
    const has = order.filter(i => owned[i] && ammo[i] > 0);
    if (has.length) {
      const idx = has.indexOf(cur);
      selectWeapon(has[(idx + 1) % has.length]);
    } else say('Sin granadas — cómpralas con B', 1.5);
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') showBoard(false);
  if (e.code === 'KeyE') { bombHold = false; if (mode === 'mp') netSend({ t: 'bombact', act: 'stop' }); }
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) overlay.style.display = 'none';
  else { closeChat(); showBoard(false); resetKeys(); showOverlay(); }
});
document.addEventListener('mousemove', e => {
  if (!locked) return;
  const base = 0.0022 * sensMult;
  if (player.dead && mode === 'mp') {
    // en espectador el ratón gira la cámara libre
    const sens = base * 1.1;
    specYaw -= e.movementX * sens;
    specPitch -= e.movementY * sens;
    specPitch = Math.max(-0.8, Math.min(1.2, specPitch));
    return;
  }
  if (player.dead) return;
  const sens = zoomed ? base / (WEAPONS[cur].zoom || 1) : base;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});
let zoomed = false;
document.addEventListener('contextmenu', e => { if (locked) e.preventDefault(); });
document.addEventListener('mousedown', e => {
  if (locked && player.dead && mode === 'mp' && e.button === 0) { nextSpectator(1); return; }
  if (locked && e.button === 0) { mouseDown = true; trigger = true; }
  if (locked && e.button === 2 && WEAPONS[cur].zoom && !player.dead) zoomed = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) zoomed = false;
});

/* ---------- Actualización del jugador ---------- */
function updatePlayer(dt) {
  const p = player.pos;
  if (mode === 'mp' && !mpReady) return;

  if (player.dead) {
    player.respawnT -= dt;
    if (mode === 'solo' || mode === 'practice') {
      deathTxt.textContent = 'Te eliminó ' + player.killer + ' — reapareces en ' + Math.max(1, Math.ceil(player.respawnT));
      camera.position.y += ((p.y + 0.3) - camera.position.y) * Math.min(1, dt * 3);
      camera.rotation.z += (0.9 - camera.rotation.z) * Math.min(1, dt * 3);
      if (player.respawnT <= 0) respawnPlayer();
    } else {
      updateSpectator(dt);
      // refrescar texto de vez en cuando por si alguien muere/revive
      if ((player.respawnT * 10 | 0) % 5 === 0) updateDeathTxt();
    }
    return;
  }

  // Freeze time: no te puedes mover
  if (mode === 'mp' && phase.ph === 'freeze') {
    player.vx = player.vz = 0;
    placeCamera(p);
    return;
  }

  const fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sp = (keys.ShiftLeft || keys.ShiftRight) ? CFG.walkSpeed : CFG.speed;

  let mx = 0, mz = 0;
  if (fw || str) {
    const len = Math.hypot(fw, str);
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    mx = (-sy * fw + cy * str) / len * sp;
    mz = (-cy * fw - sy * str) / len * sp;
  }
  const k = Math.min(1, dt * (player.onGround ? 14 : 3));
  player.vx += (mx - player.vx) * k;
  player.vz += (mz - player.vz) * k;

  slide(player, 'x', player.vx * dt);
  slide(player, 'z', player.vz * dt);

  if (keys.Space && player.onGround) { player.vy = CFG.jump; player.onGround = false; }
  gravityStep(player, dt);

  // pasos (con Shift caminas en silencio)
  const spd = Math.hypot(player.vx, player.vz);
  if (player.onGround && spd > 1.5 && !(keys.ShiftLeft || keys.ShiftRight)) {
    stepAcc += spd * dt;
    if (stepAcc > 2.3) { stepAcc = 0; sfxStep(0.06); }
  }

  // disparo
  const w = WEAPONS[cur];
  fireCd -= dt;
  const wantFire = w.auto ? mouseDown : trigger;
  if (wantFire && fireCd <= 0 && !reloading) {
    if (w.melee || ammo[cur] > 0) shoot();
    else reload();
  }
  trigger = false;

  if (reloading) {
    reloadT -= dt;
    if (reloadT <= 0) { reloading = false; ammo[cur] = w.mag; updateHud(); sfxReloadEnd(); }
  }

  placeCamera(p);
}

function updateGun(dt) {
  gunKick = Math.max(0, gunKick - dt * 12);
  drawT = Math.max(0, drawT - dt * 5);
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) guns[cur].flash.visible = false; }
  let dip = 0;
  if (reloading) dip = Math.sin((1 - reloadT / WEAPONS[cur].reload) * Math.PI);
  const g = guns[cur].group;
  g.position.z = -0.5 + gunKick * 0.05;
  g.position.y = -0.2 - dip * 0.15 - drawT * 0.35;
  g.rotation.x = gunKick * 0.08 - dip * 0.7;
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.textContent = ''; }
}

/* ---------- Escudo, rondas, minimapa y silenciar (v0.8) ---------- */
let shieldUntil = 0;
let phase = { ph: 'wait', round: 0, rounds: 5, endsAt: 0 };
let bannerTimer = 0, lastBar = '';

function onPhase(m) {
  phase = { ph: m.ph, round: m.round, rounds: m.rounds, endsAt: Date.now() + (m.left || 0) * 1000 };
  if (m.teamScore) teamScore = m.teamScore;
  const b = $('banner');
  clearTimeout(bannerTimer);
  let h = '';
  const teamLabel = (t) => TEAMS[t] ? TEAMS[t].name : '?';
  if (m.ph === 'break') {
    h = '<h2>Ronda ' + m.round + ' — Gana <span style="color:' + (TEAMS[m.winnerTeam]?.hex || '#fff') + '">' + esc(m.winnerName || teamLabel(m.winnerTeam)) + '</span></h2>'
      + (m.reason ? '<p style="opacity:.8">' + esc(m.reason) + '</p>' : '')
      + '<p style="opacity:.8">Marcador: Alpha ' + (m.teamScore?.[0] ?? teamScore[0]) + ' — ' + (m.teamScore?.[1] ?? teamScore[1]) + ' Bravo</p>'
      + '<table><tr><th>Nombre</th><th>Eq</th><th>Bajas</th><th>Muertes</th></tr>'
      + (m.rows || []).map(r => '<tr><td>' + esc(r[0]) + '</td><td style="color:' + (TEAMS[r[1]]?.hex || '#fff') + '">' + teamLabel(r[1]) + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>').join('') + '</table>'
      + '<p style="margin-top:8px;opacity:.7">Pulsa <b>B</b> para comprar armas</p>';
  } else if (m.ph === 'final') {
    h = '<h2>¡Fin de la partida!</h2><p>Ganador: <b style="color:' + (TEAMS[m.winnerTeam]?.hex || '#fff') + '">' + esc(m.winnerName || '') + '</b></p>'
      + '<p>Marcador final: ' + (m.teamScore?.[0] ?? 0) + ' — ' + (m.teamScore?.[1] ?? 0) + '</p>'
      + '<table><tr><th>Nombre</th><th>Eq</th><th>Rondas</th><th>Bajas</th><th>Muertes</th></tr>'
      + (m.rows || []).map(r => '<tr><td>' + esc(r[0]) + '</td><td style="color:' + (TEAMS[r[1]]?.hex || '#fff') + '">' + teamLabel(r[1]) + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td></tr>').join('') + '</table>';
  } else if (m.ph === 'freeze') {
    h = '<h2>Ronda ' + m.round + ' de ' + m.rounds + '</h2><p>¡Freeze! Prepara tu compra (B)</p>';
    bannerTimer = setTimeout(() => { b.style.display = 'none'; }, 2500);
  } else if (m.ph === 'play' && m.round > 0) {
    h = '<h2>¡A jugar!</h2>';
    bannerTimer = setTimeout(() => { b.style.display = 'none'; }, 1500);
  }
  b.innerHTML = h;
  b.style.display = h ? 'block' : 'none';
  updateHud();
}

function updateRoundBar() {
  const el = $('roundbar');
  if (mode !== 'mp' || !mpReady) { el.style.display = 'none'; return; }
  const left = Math.max(0, Math.ceil((phase.endsAt - Date.now()) / 1000));
  const t = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  const sc = ' · <span style="color:#3b82f6">' + teamScore[0] + '</span>-<span style="color:#ef4444">' + teamScore[1] + '</span>';
  let bombTxt = '';
  if (phase.ph === 'play' && bombState) {
    if (bombState.state === 'planted' || bombState.state === 'defusing') {
      const bl = Math.max(0, Math.ceil((bombState.explodesAt - Date.now()) / 1000));
      bombTxt = ' · <span style="color:#ff4444">BOMBA ' + bl + 's</span>';
    } else if (bombState.state === 'carried' && bombState.carrier === myId) bombTxt = ' · <span style="color:#f5a623">LLEVAS LA BOMBA</span>';
    else if (bombState.state === 'dropped') bombTxt = ' · <span style="color:#f5a623">BOMBA EN EL SUELO</span>';
  }
  const txt = phase.ph === 'wait' ? 'Esperando jugadores (mínimo 2)'
    : phase.ph === 'freeze' ? 'FREEZE · Ronda ' + phase.round + '/' + phase.rounds + ' · ' + left + 's' + sc
    : phase.ph === 'play' ? 'Ronda ' + phase.round + '/' + phase.rounds + ' · ' + t + sc + bombTxt
    : phase.ph === 'break' ? 'Descanso · ' + left + 's' + sc
    : 'Nueva partida en ' + left;
  if (txt !== lastBar) { lastBar = txt; el.innerHTML = txt; }
  el.style.display = 'block';
}

const mmEl = $('minimap'), mmc = mmEl.getContext('2d');
const hex6 = n => '#' + n.toString(16).padStart(6, '0');
function drawMinimap() {
  if (mode === 'menu') { mmEl.style.display = 'none'; return; }
  mmEl.style.display = 'block';
  const W = mmEl.width, s = W / 62, X = x => (x + 31) * s, Z = z => (z + 31) * s;
  mmc.clearRect(0, 0, W, W);
  mmc.fillStyle = 'rgba(0,0,0,.5)'; mmc.fillRect(0, 0, W, W);
  for (const [cx, cz, w, d, , col, y0 = 0] of MAP.boxes) {
    mmc.globalAlpha = y0 > 0 ? 0.55 : 0.9;
    mmc.fillStyle = hex6(col);
    mmc.fillRect(X(cx - w / 2), Z(cz - d / 2), w * s, d * s);
  }
  mmc.globalAlpha = 1;
  // radar estilo CS: aliados siempre (azul), enemigos solo cerca (rojo)
  const px = player.pos.x, pz = player.pos.z, RANGE = 22;
  const dot = (x, z, color, always) => {
    if (!always && Math.hypot(x - px, z - pz) > RANGE) return;
    mmc.fillStyle = color;
    mmc.beginPath(); mmc.arc(X(x), Z(z), 3, 0, 6.2832); mmc.fill();
  };
  if (mode === 'mp') {
    for (const r of remotes.values()) {
      if (!r.alive) continue;
      const ally = r.team === myTeam;
      dot(r.g.position.x, r.g.position.z, ally ? '#3b82f6' : '#ef4444', ally);
    }
  } else {
    for (const b of bots) { if (b.alive) dot(b.pos.x, b.pos.z, '#ef4444', false); }
  }
  // tú: triángulo que apunta hacia donde miras
  const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw), cx = X(px), cz = Z(pz);
  mmc.fillStyle = '#ffffff';
  mmc.beginPath();
  mmc.moveTo(cx + dx * 7, cz + dz * 7);
  mmc.lineTo(cx - dx * 4 - dz * 4, cz - dz * 4 + dx * 4);
  mmc.lineTo(cx - dx * 4 + dz * 4, cz - dz * 4 - dx * 4);
  mmc.closePath(); mmc.fill();
}

function renderMuteList() {
  const box = $('mutelist');
  box.textContent = '';
  if (mode !== 'mp' || !remotes.size) return;
  const lbl = document.createElement('div');
  lbl.textContent = 'Silenciar en el chat:';
  box.appendChild(lbl);
  for (const r of remotes.values()) {
    const b = document.createElement('button');
    b.className = 'ghost';
    const paint = () => { b.textContent = (muted.has(r.name) ? '🔇 ' : '🔊 ') + r.name; };
    paint();
    b.addEventListener('click', () => { if (muted.has(r.name)) muted.delete(r.name); else muted.add(r.name); paint(); });
    box.appendChild(b);
  }
}

/* ---------- Bucle principal ---------- */
let last = performance.now(), menuT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (mode === 'menu') {                         // cámara cinemática de vista previa (estilo Krunker)
    menuT += dt * 0.08;
    const r = 20, h = 7.5 + Math.sin(menuT * 0.6) * 1.2;
    camera.position.set(Math.sin(menuT) * r, h, Math.cos(menuT) * r);
    camera.lookAt(0, 1.5, 0);
  } else if (locked) {
    updatePlayer(dt);
    if (mode === 'solo' || mode === 'practice') updateBots(dt);
  }
  updateRemotes(dt);
  netTick(dt);
  updateGun(dt);
  tickBombHold(dt);
  updateBombVisual();
  tickBombBeep(dt);
  updateNades(dt);
  tickPractice(dt);
  // Recuperación de recoil
  {
    const w = WEAPONS[cur];
    const rc = RECOIL[w?.id] || { recover: 5 };
    const k = Math.min(1, dt * rc.recover);
    recoilPitch *= (1 - k);
    recoilYaw *= (1 - k);
  }
  // Prompt de bomba
  {
    const pr = bombPrompt();
    if (pr) { msgEl.textContent = pr; msgT = 0.3; }
  }
  {
    const z = zoomed && WEAPONS[cur].zoom && mode !== 'menu' ? WEAPONS[cur].zoom : 1;
    const target = 75 / z;
    if (Math.abs(camera.fov - target) > 0.05) {
      camera.fov += (target - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
    $('scope').style.display = z > 1 ? 'block' : 'none';
    $('cross').style.display = z > 1 ? 'none' : 'block';
    for (let i = 0; i < guns.length; i++) if (i === cur) guns[i].group.visible = z === 1 && !player.dead && mode !== 'menu';
  }
  updateFx(dt);
  drawMinimap();
  updateRoundBar();
  $('shield').style.display = (performance.now() < shieldUntil && !player.dead && mode !== 'menu') ? 'block' : 'none';
  dmgFlash = Math.max(0, dmgFlash - dt * 1.4);
  dmgEl.style.opacity = dmgFlash;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
