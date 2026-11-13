// Servidor de Blocky Strike: sirve el juego y maneja las partidas multijugador por salas.
// No necesita instalar nada (el WebSocket está implementado aquí mismo).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { MAPS, WEAPONS, PLAYER, MATCH, ECO, TEAMS, boxesToSolids, rayAABB, pickSpawn, pickTeamSpawn, roundResult, finalStandings } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 12;                                            // por sala
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 20;            // salas a la vez en todo el servidor
const MAX_CONNS = 300;                                             // conexiones a la vez en todo el servidor
const ROOM_GRACE_MS = Number(process.env.ROOM_GRACE_MS) || 60000;  // una sala vacía se borra pasado este tiempo
const TICK_MS = 50;           // 20 envíos por segundo
const PROTECT_MS = 1500;      // protección al reaparecer

/* ---------------- Archivos estáticos ---------------- */
// Solo se sirven estos archivos (lista cerrada: nadie puede pedir otros del disco)
const FILES = {
  '/': 'index.html', '/index.html': 'index.html',
  '/privacidad': 'privacidad.html', '/privacidad.html': 'privacidad.html',
  '/game.js': 'game.js', '/shared.js': 'shared.js',
  '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest',
  '/icons/icon-192.png': 'icons/icon-192.png',
  '/icons/icon-512.png': 'icons/icon-512.png',
  '/icons/icon-maskable-512.png': 'icons/icon-maskable-512.png',
  '/vendor/three.module.js': 'vendor/three.module.js',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
};

/* Three.js (la librería 3D): se guarda en vendor/ para no depender de internet.
   Si no se pudo guardar, el navegador la pide al CDN como respaldo. */
const THREE_URL = process.env.THREE_URL || 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const THREE_FILE = path.join(__dirname, 'vendor', 'three.module.js');
const threeOk = () => { try { return fs.statSync(THREE_FILE).size > 100000; } catch { return false; } };

async function ensureThree() {
  if (threeOk()) return;
  try {
    const r = await fetch(THREE_URL, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100000 || !buf.includes("REVISION = '160'")) throw new Error('archivo inesperado');
    fs.mkdirSync(path.dirname(THREE_FILE), { recursive: true });
    fs.writeFileSync(THREE_FILE + '.tmp', buf);
    fs.renameSync(THREE_FILE + '.tmp', THREE_FILE);
    console.log('  Three.js guardado en vendor/ (el juego ya no depende del CDN)\n');
  } catch (e) {
    console.log('  Aviso: no se pudo guardar Three.js (' + e.message + '). Se usará el CDN mientras haya internet.\n');
  }
}

// Compresión gzip (Three.js pesa ~1.2 MB; así baja a ~300 KB por internet)
const gzCache = new Map();   // archivo -> { key, buf }
function serveFile(req, res, file) {
  const full = path.join(__dirname, file);
  fs.stat(full, (e1, st) => {
    if (e1) { res.writeHead(500); return res.end('Error del servidor'); }
    fs.readFile(full, (e2, data) => {
      if (e2) { res.writeHead(500); return res.end('Error del servidor'); }
      const ext = path.extname(file);
      const headers = { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
      const gz = ext !== '.png' && data.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      if (gz) {
        const key = st.size + ':' + st.mtimeMs;
        let c = gzCache.get(file);
        if (!c || c.key !== key) { c = { key, buf: zlib.gzipSync(data, { level: 6 }) }; gzCache.set(file, c); }
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = c.buf.length;
        res.writeHead(200, headers);
        return res.end(c.buf);
      }
      headers['Content-Length'] = data.length;
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = FILES[url];
  if (!file) { res.writeHead(404); return res.end('No encontrado'); }
  if (file.startsWith('vendor/') && !threeOk()) {      // aún no está guardado: respaldo en el CDN
    res.writeHead(302, { Location: THREE_URL, 'Cache-Control': 'no-cache' });
    return res.end();
  }
  serveFile(req, res, file);
});

/* ---------------- WebSocket mínimo (RFC 6455) ---------------- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

class Conn {
  constructor(socket, onMessage, onClose) {
    this.s = socket; this.buf = Buffer.alloc(0); this.closed = false;
    this.onMessage = onMessage; this.onClose = onClose; this.lastMsg = Date.now();
    this.player = null;
    socket.setNoDelay(true);
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => socket.destroy());
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > 1 << 20) return this.destroy();
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const op = b[0] & 0x0f, fin = !!(b[0] & 0x80), masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 65536) return this.destroy();
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let payload;
      if (masked) {
        const mask = b.subarray(off, off + 4);
        payload = Buffer.from(b.subarray(off + 4, need));
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      } else payload = b.subarray(off, need);
      this.buf = b.subarray(need);
      this.lastMsg = Date.now();
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) this.raw(frame(0xA, payload));
      else if (op === 0x1 && fin) this.onMessage(this, payload.toString('utf8'));
    }
  }
  raw(buf) {
    if (this.closed || this.s.destroyed) return;
    if (this.s.writableLength > 1 << 20) return;   // cliente muy lento: se descarta
    this.s.write(buf);
  }
  send(str) { this.raw(frame(0x1, Buffer.from(str))); }
  close() { if (!this.closed) { this.raw(frame(0x8, Buffer.alloc(0))); this.s.end(); } this.finish(); }
  destroy() { this.s.destroy(); this.finish(); }
  finish() { if (this.closed) return; this.closed = true; this.onClose(this); }
}

const conns = new Set();

server.on('upgrade', (req, socket) => {
  const isWs = (req.headers.upgrade || '').toLowerCase() === 'websocket';
  if (req.url.split('?')[0] !== '/ws' || !isWs || !req.headers['sec-websocket-key'] || conns.size >= MAX_CONNS) {
    socket.destroy(); return;
  }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
               'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  conns.add(new Conn(socket, onMessage, onClose));
});

/* ---------------- Salas y jugadores ---------------- */
// Cada sala es una partida independiente: sus jugadores solo ven y se disparan entre ellos.
let nextId = 1;                     // ids únicos en todo el servidor
const rooms = new Map();            // código -> { code, players: Map, emptySince }
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // sin I, L, O (se confunden con 1 y 0)

const r2 = v => Math.round(v * 100) / 100;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pub = p => ({ id: p.id, name: p.name, team: p.team, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), pitch: r2(p.pitch),
                    w: p.w, hp: p.hp, alive: p.alive, money: p.money, skin: p.skin, face: p.face, tone: p.tone, pants: p.pants });

function newCode() {
  for (let i = 0; i < 100; i++) {
    let c = '';
    for (let k = 0; k < 4; k++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function cleanCode(c) { return typeof c === 'string' ? c.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) : ''; }

function send(p, obj) { p.conn.send(JSON.stringify(obj)); }
function broadcast(room, obj, except) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) if (p !== except) p.conn.send(s);
}
function sendScores(room) {
  const teamScore = room.teamScore || [0, 0];
  broadcast(room, {
    t: 'scores',
    teamScore,
    l: [...room.players.values()].map(p => [p.id, p.name, p.team, p.kills, p.deaths, p.money, p.alive]),
  });
}
function cleanName(n) {
  if (typeof n !== 'string') return '';
  return n.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14);
}
function spawnFor(room, p) {
  const others = [...room.players.values()].filter(o => o !== p && o.alive).map(o => ({ x: o.x, z: o.z }));
  if (p && (p.team === 0 || p.team === 1)) return pickTeamSpawn(room.map, p.team, others);
  return pickSpawn(MAPS[room.map].spawns, others);
}
function refill(p) {
  // Cuchillo y pistola siempre; el resto solo si las compró esta ronda o las tiene
  p.ammo = WEAPONS.map((w, i) => (i <= 1 || p.owned[i] ? w.mag : 0));
  p.reloadUntil = 0; p.reloadW = null;
  if (p.w > 1 && !p.owned[p.w]) p.w = 1; // vuelve a pistola si no tiene el arma
}
function balanceTeam(room) {
  let c0 = 0, c1 = 0;
  for (const p of room.players.values()) { if (p.team === 0) c0++; else if (p.team === 1) c1++; }
  return c0 <= c1 ? 0 : 1;
}

function join(conn, m) {
  let room;
  if (m.create === true) {
    const code = rooms.size < MAX_ROOMS ? newCode() : null;
    if (!code) { conn.send(JSON.stringify({ t: 'busy' })); conn.close(); return; }
    const map = MAPS[m.map] ? m.map : 'dust';
    room = {
      code, players: new Map(), emptySince: 0, phase: 'wait', round: 0, until: 0,
      map, solids: boxesToSolids(MAPS[map].boxes), teamScore: [0, 0], lossStreak: [0, 0],
    };
    rooms.set(code, room);
    console.log('* sala nueva', code, '(' + rooms.size + ' salas)');
  } else {
    room = rooms.get(cleanCode(m.room));
    if (!room) { conn.send(JSON.stringify({ t: 'noroom' })); conn.close(); return; }
    if (room.players.size >= MAX_PLAYERS) { conn.send(JSON.stringify({ t: 'full' })); conn.close(); return; }
  }
  const id = nextId++;
  const team = balanceTeam(room);
  const p = {
    id, name: cleanName(m.name) || 'Jugador' + id, conn, room, team,
    skin: (m.skin >= 0 && m.skin <= 3) ? (m.skin | 0) : 0,
    face: (m.face === 1 || m.face === 2 || m.face === 3) ? m.face : 0,
    tone: (m.tone >= 0 && m.tone <= 4) ? (m.tone | 0) : 0,
    pants: (m.pants >= 0 && m.pants <= 3) ? (m.pants | 0) : 0,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, w: 1,
    hp: PLAYER.maxHp, alive: true, kills: 0, deaths: 0,
    money: ECO.startMoney, owned: WEAPONS.map((_, i) => i <= 1), // cuchillo + pistola
    ammo: [], reloadUntil: 0, reloadW: null, lastShot: WEAPONS.map(() => 0),
    respawnAt: 0, protectedUntil: Date.now() + PROTECT_MS, lastState: Date.now(),
    winStart: Date.now(), winCount: 0, lastChat: 0,
    rk: 0, rd: 0, wins: 0, hist: [], rtt: 0,
  };
  const s = spawnFor(room, p);
  p.x = s[0]; p.z = s[1]; p.yaw = s[1] > 0 ? 0 : Math.PI;
  refill(p);
  conn.player = p;
  room.emptySince = 0;
  room.players.set(id, p);
  send(p, {
    t: 'welcome', id, room: room.code, map: room.map, team: p.team, money: p.money,
    spawn: { x: p.x, y: 0, z: p.z, yaw: p.yaw },
    players: [...room.players.values()].filter(o => o !== p).map(pub),
  });
  broadcast(room, { t: 'join', p: pub(p) }, p);
  sendScores(room);
  sendPhase(room, p);
  console.log('+ entra', p.name, 'equipo', TEAMS[team].name, 'en sala', room.code, '(' + room.players.size + ' jugadores)');
}

function onClose(conn) {
  conns.delete(conn);
  const p = conn.player;
  if (!p) return;
  const room = p.room;
  if (!room.players.delete(p.id)) return;
  broadcast(room, { t: 'leave', id: p.id, name: p.name });
  sendScores(room);
  if (room.players.size === 0) room.emptySince = Date.now();
  console.log('- sale ', p.name, 'de sala', room.code, '(' + room.players.size + ' jugadores)');
}

/* ---------------- Mensajes ---------------- */
function onMessage(conn, text) {
  let m;
  try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m.t !== 'string') return;
  const p = conn.player;
  if (!p) { if (m.t === 'join') join(conn, m); return; }

  // límite de mensajes por segundo (anti-spam)
  const now = Date.now();
  if (now - p.winStart > 1000) { p.winStart = now; p.winCount = 0; }
  if (++p.winCount > 200) return;

  switch (m.t) {
    case 'state': return onState(p, m, now);
    case 'shoot': return onShoot(p, m, now);
    case 'reload': return onReload(p, m, now);
    case 'buy': return onBuy(p, m, now);
    case 'bombact': return onBombAct(p, m, now); // { act: 'plant'|'defuse'|'stop', site? }
    case 'nade': return onNade(p, m, now);
    case 'nadeboom': return onNadeBoom(p, m, now);
    case 'ping': { const r = num(m.rtt); if (r !== null) p.rtt = clamp(r, 0, 500); return send(p, { t: 'pong', ts: num(m.ts) || 0 }); }
    case 'chat': {
      if (now - p.lastChat < 500 || typeof m.text !== 'string') return;
      const txt = m.text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
      if (!txt) return;
      p.lastChat = now;
      broadcast(p.room, { t: 'chat', n: p.name, text: txt, team: p.team });
      return;
    }
  }
}

function nearSite(room, p, siteName) {
  const map = MAPS[room.map];
  if (!map.sites || !map.sites[siteName]) return false;
  const [sx, sz, rad] = map.sites[siteName];
  return Math.hypot(p.x - sx, p.z - sz) <= (rad || MATCH.bombRadius);
}
function nearBomb(room, p) {
  const b = room.bomb;
  if (!b || b.state !== 'planted' && b.state !== 'defusing') return false;
  return Math.hypot(p.x - b.x, p.z - b.z) <= MATCH.bombRadius + 0.6;
}
function onBombAct(p, m, now) {
  const room = p.room;
  if (room.phase !== 'play' || !p.alive) return;
  let bomb = room.bomb;
  if (!bomb) return;
  const act = m.act;

  if (act === 'stop') {
    if (bomb.state === 'defusing' && bomb.defuser === p.id) {
      bomb.state = 'planted';
      bomb.defuser = null;
      bomb.defuseProg = 0;
      broadcast(room, { t: 'bomb', state: 'planted', x: bomb.x, z: bomb.z, site: bomb.site, explodesAt: bomb.explodesAt, defuseProg: 0 });
    }
    if (bomb.state === 'carried' && bomb.carrier === p.id) {
      bomb.plantProg = 0;
      broadcast(room, { t: 'bomb', state: 'carried', carrier: p.id, plantProg: 0 });
    }
    return;
  }

  // Plantar (solo atacantes con la bomba, en un site)
  if (act === 'plant') {
    if (p.team !== MATCH.attackerTeam) return;
    if (bomb.state !== 'carried' || bomb.carrier !== p.id) return;
    const site = typeof m.site === 'string' ? m.site : null;
    if (!site || !nearSite(room, p, site)) return;
    bomb.plantProg = (bomb.plantProg || 0) + 0.12; // el cliente manda ~8/s mientras mantiene E
    if (bomb.plantProg >= MATCH.plantSec) {
      const [sx, sz] = MAPS[room.map].sites[site];
      bomb.state = 'planted';
      bomb.site = site;
      bomb.x = sx; bomb.z = sz;
      bomb.carrier = null;
      bomb.plantProg = 0;
      bomb.explodesAt = now + MATCH.bombTimerSec * 1000;
      // Dinero al plantador
      giveMoney(p, ECO.plant);
      send(p, { t: 'money', money: p.money, owned: p.owned });
      broadcast(room, { t: 'bomb', state: 'planted', x: bomb.x, z: bomb.z, site, explodesAt: bomb.explodesAt, planter: p.id });
      // Ampliar el tiempo de ronda si hace falta para que pueda explotar
      const left = bomb.explodesAt - now + 2000;
      if (room.until < now + left) room.until = now + left;
    } else {
      broadcast(room, { t: 'bomb', state: 'carried', carrier: p.id, plantProg: bomb.plantProg, site });
    }
    return;
  }

  // Desactivar (solo defensores, bomba plantada)
  if (act === 'defuse') {
    if (p.team !== MATCH.defenderTeam) return;
    if (bomb.state !== 'planted' && bomb.state !== 'defusing') return;
    if (!nearBomb(room, p)) return;
    if (bomb.state === 'planted') {
      bomb.state = 'defusing';
      bomb.defuser = p.id;
      bomb.defuseProg = 0;
    }
    if (bomb.defuser !== p.id) return; // otro ya está desactivando
    bomb.defuseProg = (bomb.defuseProg || 0) + 0.12;
    if (bomb.defuseProg >= MATCH.defuseSec) {
      // ¡Desactivada!
      giveMoney(p, ECO.defuse);
      send(p, { t: 'money', money: p.money, owned: p.owned });
      broadcast(room, { t: 'bomb', state: 'defused', defuser: p.id, site: bomb.site });
      endRound(room, MATCH.defenderTeam, 'defuse');
      return;
    }
    broadcast(room, { t: 'bomb', state: 'defusing', x: bomb.x, z: bomb.z, site: bomb.site, explodesAt: bomb.explodesAt, defuseProg: bomb.defuseProg, defuser: p.id });
  }
}

function onState(p, m, now) {
  if (!p.alive) return;
  // Durante freeze no se puede mover (solo mirar)
  if (p.room.phase === 'freeze') {
    const yaw = num(m.yaw), pitch = num(m.pitch);
    if (yaw !== null) p.yaw = yaw;
    if (pitch !== null) p.pitch = clamp(pitch, -1.6, 1.6);
    return;
  }
  const x = num(m.x), y = num(m.y), z = num(m.z), yaw = num(m.yaw), pitch = num(m.pitch);
  if (x === null || y === null || z === null || yaw === null || pitch === null) return;
  const dt = clamp((now - p.lastState) / 1000, 0.02, 1);
  p.lastState = now;
  // anti-teletransporte: si se movió demasiado rápido, lo devolvemos
  if (Math.hypot(x - p.x, z - p.z) > 14 * dt + 1.5) {
    send(p, { t: 'correct', x: r2(p.x), y: r2(p.y), z: r2(p.z) });
    return;
  }
  p.x = clamp(x, -31, 31); p.y = clamp(y, 0, 30); p.z = clamp(z, -31, 31);
  p.yaw = yaw; p.pitch = clamp(pitch, -1.6, 1.6);
  record(p, now);
  const w = m.w | 0;
  if (w !== p.w && WEAPONS[w] && (w <= 1 || p.owned[w])) {
    p.w = w; p.reloadUntil = 0; p.reloadW = null;
  }
}

// --- Compensación de latencia: se guarda 1 s de posiciones y, al disparar, se rebobina a donde
// el tirador veía al rival (la mitad de su ping + unos 100 ms de suavizado del navegador).
function record(p, now) {
  p.hist.push([now, p.x, p.y, p.z]);
  while (p.hist.length && now - p.hist[0][0] > 1000) p.hist.shift();
}
function posAt(q, t) {
  const h = q.hist;
  if (!h.length || t >= h[h.length - 1][0]) return { x: q.x, y: q.y, z: q.z };
  if (t <= h[0][0]) return { x: h[0][1], y: h[0][2], z: h[0][3] };
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1][0] <= t) {
      const a = h[i - 1], b = h[i], k = (t - a[0]) / Math.max(1, b[0] - a[0]);
      return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, z: a[3] + (b[3] - a[3]) * k };
    }
  }
  return { x: q.x, y: q.y, z: q.z };
}

// --- Rondas estilo CS: freeze → play → break ---
function sendPhase(room, to) {
  const m = {
    t: 'phase', ph: room.phase, round: room.round, rounds: MATCH.rounds,
    left: Math.max(0, Math.round((room.until - Date.now()) / 1000)),
    teamScore: room.teamScore || [0, 0],
    ...(room.extra || {}),
  };
  if (to) send(to, m); else broadcast(room, m);
}
function resetPlayer(room, p, now) {
  const s = spawnFor(room, p);
  p.x = s[0]; p.y = 0; p.z = s[1]; p.yaw = s[1] > 0 ? 0 : Math.PI; p.pitch = 0;
  p.hp = PLAYER.maxHp; p.alive = true; p.hist = []; p.lastState = now;
  p.protectedUntil = now + PROTECT_MS;
  // Mantener armas compradas; recargar munición
  refill(p);
  send(p, { t: 'money', money: p.money, owned: p.owned });
  broadcast(room, { t: 'respawn', id: p.id, x: p.x, y: 0, z: p.z, yaw: p.yaw, team: p.team });
}
function giveMoney(p, amount) {
  p.money = Math.min(ECO.maxMoney, Math.max(0, p.money + amount));
}
function clearBomb(room) {
  room.bomb = null; // { state:'carried'|'planted'|'defusing', carrier, site, x, z, plantProg, defuseProg, explodesAt, defuser }
}
function assignBomb(room) {
  clearBomb(room);
  // Un atacante vivo al azar lleva la bomba
  const atk = [...room.players.values()].filter(p => p.team === MATCH.attackerTeam && p.alive);
  if (!atk.length) return;
  const carrier = atk[Math.floor(Math.random() * atk.length)];
  room.bomb = { state: 'carried', carrier: carrier.id, site: null, x: 0, z: 0, plantProg: 0, defuseProg: 0, explodesAt: 0, defuser: null };
  broadcast(room, { t: 'bomb', state: 'carried', carrier: carrier.id });
}
function nextRound(room) {
  const now = Date.now();
  room.round++;
  room.phase = 'freeze';
  room.until = now + MATCH.freezeSec * 1000;
  room.extra = null;
  clearBomb(room);
  for (const p of room.players.values()) {
    p.rk = 0; p.rd = 0;
    resetPlayer(room, p, now);
  }
  assignBomb(room);
  sendPhase(room);
  sendScores(room);
}
function startPlay(room) {
  room.phase = 'play';
  room.until = Date.now() + MATCH.roundSec * 1000;
  room.extra = null;
  sendPhase(room);
  if (room.bomb) broadcast(room, { t: 'bomb', state: room.bomb.state, carrier: room.bomb.carrier });
}
function startMatch(room) {
  room.round = 0;
  room.teamScore = [0, 0];
  room.lossStreak = [0, 0];
  for (const p of room.players.values()) {
    p.wins = 0; p.kills = 0; p.deaths = 0;
    p.money = ECO.startMoney;
    p.owned = WEAPONS.map((_, i) => i <= 1);
    p.w = 1;
  }
  sendScores(room);
  nextRound(room);
}
const rowsOf = room => [...room.players.values()].map(p => ({
  id: p.id, name: p.name, team: p.team, rk: p.rk, rd: p.rd,
  wins: p.wins, kills: p.kills, deaths: p.deaths, money: p.money, alive: p.alive,
}));
function endRound(room, winningTeam, reason) {
  if (room.phase === 'break' || room.phase === 'final') return; // evitar doble fin
  const now = Date.now();
  const list = rowsOf(room);
  const bomb = room.bomb;

  // Si no se pasó equipo ganador, calcular por eliminación / bomba / kills
  if (winningTeam !== 0 && winningTeam !== 1) {
    const alive0 = list.filter(p => p.team === 0 && p.alive).length;
    const alive1 = list.filter(p => p.team === 1 && p.alive).length;
    if (bomb && bomb.state === 'planted') {
      // Bomba plantada y se acaba el tiempo de ronda → explota a favor de atacantes si no se desactivó
      winningTeam = MATCH.attackerTeam;
      reason = reason || 'time_planted';
    } else if (alive0 > 0 && alive1 === 0) {
      winningTeam = 0; reason = reason || 'elim';
    } else if (alive1 > 0 && alive0 === 0) {
      // Si la bomba está plantada, los defensores muertos no ganan automáticamente
      if (bomb && (bomb.state === 'planted' || bomb.state === 'defusing')) {
        winningTeam = MATCH.attackerTeam; reason = reason || 'elim_planted';
      } else {
        winningTeam = 1; reason = reason || 'elim';
      }
    } else {
      const k0 = list.filter(p => p.team === 0).reduce((s, p) => s + p.rk, 0);
      const k1 = list.filter(p => p.team === 1).reduce((s, p) => s + p.rk, 0);
      winningTeam = k0 >= k1 ? 0 : 1;
      reason = reason || 'kills';
    }
  }

  clearBomb(room);
  if (!room.teamScore) room.teamScore = [0, 0];
  if (!room.lossStreak) room.lossStreak = [0, 0];
  room.teamScore[winningTeam]++;

  const loser = 1 - winningTeam;
  room.lossStreak[winningTeam] = 0;
  room.lossStreak[loser] = Math.min(3, (room.lossStreak[loser] || 0) + 1);

  for (const p of room.players.values()) {
    if (p.team === winningTeam) {
      giveMoney(p, ECO.win);
      p.wins++;
    } else {
      giveMoney(p, ECO.loss + (room.lossStreak[loser] - 1) * ECO.lossStreakBonus);
    }
    send(p, { t: 'money', money: p.money, owned: p.owned });
  }

  const teamName = TEAMS[winningTeam] ? TEAMS[winningTeam].name : '?';
  const reasonTxt = ({ elim: 'Eliminación', defuse: 'Bomba desactivada', explode: 'Bomba explotó', time_planted: 'Bomba plantada', elim_planted: 'Bomba plantada', kills: 'Más bajas' })[reason] || '';
  if (room.round >= MATCH.rounds || room.teamScore[0] > MATCH.rounds / 2 || room.teamScore[1] > MATCH.rounds / 2) {
    room.phase = 'final';
    room.until = now + MATCH.finalSec * 1000;
    room.extra = {
      winnerTeam: winningTeam, winnerName: teamName, reason: reasonTxt,
      teamScore: room.teamScore,
      rows: finalStandings(list).map(r => [r.name, r.team, r.wins, r.kills, r.deaths]),
    };
  } else {
    room.phase = 'break';
    room.until = now + MATCH.breakSec * 1000;
    room.extra = {
      winnerTeam: winningTeam, winnerName: teamName, reason: reasonTxt,
      teamScore: room.teamScore,
      rows: list.sort((a, b) => b.rk - a.rk).map(r => [r.name, r.team, r.rk, r.rd]),
    };
  }
  sendPhase(room);
  sendScores(room);
  broadcast(room, { t: 'bomb', state: 'clear' });
}

function onBuy(p, m, now) {
  if (!p.alive) return;
  if (p.room.phase !== 'freeze' && p.room.phase !== 'break') return; // solo en freeze o break
  const wi = m.w | 0;
  const w = WEAPONS[wi];
  if (!w || w.melee || w.price <= 0) return;
  // granadas: se pueden comprar de nuevo para recargar 1 unidad
  if (p.owned[wi] && !w.grenade) return;
  if (w.grenade && p.ammo[wi] >= w.mag) return; // ya tiene el máximo
  if (p.money < w.price) {
    send(p, { t: 'buyfail', reason: 'dinero' });
    return;
  }
  p.money -= w.price;
  p.owned[wi] = true;
  p.ammo[wi] = w.grenade ? Math.min(w.mag, (p.ammo[wi] || 0) + 1) : w.mag;
  p.w = wi;
  send(p, { t: 'money', money: p.money, owned: p.owned, bought: wi });
}

function settleReload(p, now) {
  if (p.reloadW !== null && now >= p.reloadUntil) {
    p.ammo[p.reloadW] = WEAPONS[p.reloadW].mag;
    p.reloadW = null; p.reloadUntil = 0;
  }
}

function onReload(p, m, now) {
  if (!p.alive) return;
  settleReload(p, now);
  const wi = m.w | 0, w = WEAPONS[wi];
  if (!w || p.reloadW !== null || p.ammo[wi] >= w.mag) return;
  p.reloadW = wi;
  p.reloadUntil = now + w.reload * 1000 - 80;   // pequeña tolerancia por la latencia
}

function onShoot(p, m, now) {
  if (!p.alive || p.room.phase === 'break' || p.room.phase === 'final' || p.room.phase === 'freeze') return;
  settleReload(p, now);
  const wi = m.w | 0, w = WEAPONS[wi];
  if (!w || p.reloadW !== null) return;
  if (!w.melee && p.ammo[wi] <= 0) return;
  if (w.melee === false && !p.owned[wi] && wi > 1) return;
  if (now - p.lastShot[wi] < w.rate * 1000 * 0.75) return;
  p.lastShot[wi] = now;
  if (!w.melee) p.ammo[wi]--;
  p.w = wi;

  const room = p.room;
  const dirs = Array.isArray(m.dirs) ? m.dirs.slice(0, w.pellets) : [];
  const ox = p.x, oy = p.y + PLAYER.eye, oz = p.z;
  const ends = [];
  const dmgBy = new Map();
  const lag = clamp(p.rtt / 2 + 100, 0, 250);

  for (const d of dirs) {
    if (!Array.isArray(d)) continue;
    let dx = num(d[0]), dy = num(d[1]), dz = num(d[2]);
    if (dx === null || dy === null || dz === null) continue;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) continue;
    dx /= l; dy /= l; dz /= l;

    let best = 150, victim = null, head = false;
    for (const s of room.solids) {                        // paredes y cajas bloquean las balas
      const t = rayAABB(ox, oy, oz, dx, dy, dz, s);
      if (t >= 0 && t < best) { best = t; victim = null; }
    }
    if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; victim = null; } }   // suelo

    for (const q of room.players.values()) {         // solo se puede herir a jugadores de la misma sala
      if (q === p || !q.alive || now < q.protectedUntil) continue;
      const qp = posAt(q, now - lag);                 // dónde estaba el rival cuando el tirador disparó
      const th = rayAABB(ox, oy, oz, dx, dy, dz,
        { x0: qp.x - 0.25, x1: qp.x + 0.25, y0: qp.y + 1.45, y1: qp.y + 1.95, z0: qp.z - 0.25, z1: qp.z + 0.25 });
      if (th >= 0 && th < best) { best = th; victim = q; head = true; }
      const tb = rayAABB(ox, oy, oz, dx, dy, dz,
        { x0: qp.x - 0.4, x1: qp.x + 0.4, y0: qp.y, y1: qp.y + 1.45, z0: qp.z - 0.4, z1: qp.z + 0.4 });
      if (tb >= 0 && tb < best) { best = tb; victim = q; head = false; }
    }

    ends.push([r2(ox + dx * best), r2(oy + dy * best), r2(oz + dz * best)]);
    if (victim) {
      const falloff = w.pellets > 1 ? Math.max(0.25, 1 - best / 20) : 1;   // la escopeta pierde daño con la distancia
      const acc = dmgBy.get(victim) || { dmg: 0, head: false };
      acc.dmg += w.damage * (head ? w.head : 1) * falloff;
      acc.head = acc.head || head;
      dmgBy.set(victim, acc);
    }
  }

  broadcast(room, { t: 'shot', id: p.id, w: wi, e: ends.slice(0, 3) }, p);
  for (const [q, acc] of dmgBy) applyDamage(p, q, Math.max(1, Math.round(acc.dmg)), acc.head);
}

function onNade(p, m, now) {
  if (!p.alive || p.room.phase !== 'play') return;
  const type = m.type === 'flash' || m.type === 'smoke' || m.type === 'he' ? m.type : null;
  if (!type) return;
  // retransmitir a los demás para que simulen la trayectoria
  broadcast(p.room, {
    t: 'nade', id: p.id, type,
    x: num(m.x) ?? p.x, y: num(m.y) ?? 1.2, z: num(m.z) ?? p.z,
    vx: num(m.vx) ?? 0, vy: num(m.vy) ?? 0, vz: num(m.vz) ?? 0,
    fuse: num(m.fuse) ?? 1.5
  }, p);
}

function onNadeBoom(p, m, now) {
  if (!p.alive || p.room.phase !== 'play') return;
  if (m.type !== 'he') return;
  const x = num(m.x), y = num(m.y), z = num(m.z);
  const radius = clamp(num(m.radius) ?? 5.5, 1, 8);
  const maxDmg = clamp(num(m.damage) ?? 98, 1, 120);
  if (x === null || z === null) return;
  for (const q of p.room.players.values()) {
    if (!q.alive || q.team === p.team) continue;
    const d = Math.hypot(q.x - x, (q.y + 1) - (y || 0), q.z - z);
    if (d >= radius) continue;
    const falloff = 1 - d / radius;
    const dmg = Math.max(1, Math.round(maxDmg * falloff * falloff));
    applyDamage(p, q, dmg, false);
  }
}

function applyDamage(shooter, victim, dmg, head) {
  const room = shooter.room;
  // No friendly fire
  if (shooter.team === victim.team) return;
  victim.hp = Math.max(0, victim.hp - dmg);
  const kill = victim.hp <= 0;
  if (kill) {
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = Infinity;
    shooter.kills++; shooter.rk++; victim.rd++;
    giveMoney(shooter, ECO.kill + (head ? ECO.headshotBonus : 0));
    send(shooter, { t: 'money', money: shooter.money, owned: shooter.owned });

    // Si el portador de la bomba muere, la bomba cae al suelo y otro atacante puede recogerla
    const bomb = room.bomb;
    if (bomb && bomb.state === 'carried' && bomb.carrier === victim.id) {
      bomb.carrier = null;
      bomb.x = victim.x; bomb.z = victim.z;
      bomb.state = 'dropped';
      broadcast(room, { t: 'bomb', state: 'dropped', x: bomb.x, z: bomb.z });
    }
  }
  broadcast(room, { t: 'hit', v: victim.id, s: shooter.id, dmg, head, kill, hp: victim.hp, sh: shooter.hp });
  if (kill) {
    sendScores(room);
    if (room.phase === 'play') {
      const alive0 = [...room.players.values()].filter(p => p.team === 0 && p.alive).length;
      const alive1 = [...room.players.values()].filter(p => p.team === 1 && p.alive).length;
      const bomb = room.bomb;
      const planted = bomb && (bomb.state === 'planted' || bomb.state === 'defusing');
      // Defensores eliminados: si hay bomba plantada siguen pudiendo desactivar; si no, ganan atacantes
      if (alive0 === 0 && alive1 > 0) {
        if (!planted) endRound(room, MATCH.attackerTeam, 'elim');
      } else if (alive1 === 0 && alive0 > 0) {
        // Atacantes eliminados: si bomba plantada, la ronda sigue hasta explotar/desactivar
        if (!planted) endRound(room, MATCH.defenderTeam, 'elim');
      }
    }
  }
}

/* ---------------- Bucle del servidor ---------------- */
setInterval(() => {
  const now = Date.now();

  for (const [code, room] of rooms) {
    if (room.players.size === 0) {
      if (now - room.emptySince > ROOM_GRACE_MS) {
        rooms.delete(code);
        console.log('x sala cerrada', code, '(' + rooms.size + ' salas)');
      }
      continue;
    }
    // Sin respawn a mitad de ronda (estilo CS). Solo se revive en nextRound.

    if (room.players.size < 2) {
      if (room.phase !== 'wait') { room.phase = 'wait'; room.round = 0; room.until = 0; room.extra = null; clearBomb(room); sendPhase(room); }
    } else if (room.phase === 'wait') startMatch(room);
    else if (now >= room.until) {
      if (room.phase === 'freeze') startPlay(room);
      else if (room.phase === 'play') endRound(room);
      else if (room.phase === 'break') nextRound(room);
      else startMatch(room); // final → nueva partida
    }

    // Bomba: explosión y recogida del suelo
    if (room.phase === 'play' && room.bomb) {
      const bomb = room.bomb;
      if ((bomb.state === 'planted' || bomb.state === 'defusing') && bomb.explodesAt && now >= bomb.explodesAt) {
        broadcast(room, { t: 'bomb', state: 'explode', x: bomb.x, z: bomb.z, site: bomb.site });
        endRound(room, MATCH.attackerTeam, 'explode');
      } else if (bomb.state === 'dropped') {
        // Cualquier atacante vivo cerca la recoge
        for (const p of room.players.values()) {
          if (!p.alive || p.team !== MATCH.attackerTeam) continue;
          if (Math.hypot(p.x - bomb.x, p.z - bomb.z) < 1.5) {
            bomb.state = 'carried';
            bomb.carrier = p.id;
            bomb.plantProg = 0;
            broadcast(room, { t: 'bomb', state: 'carried', carrier: p.id });
            break;
          }
        }
      }
    }

    if (room.players.size > 1) {
      const list = [];
      for (const p of room.players.values()) if (p.alive) list.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.w, p.team]);
      broadcast(room, { t: 'state', p: list });
    }
  }
}, TICK_MS);

// desconectar a quien lleva 30 s sin enviar nada (también a quien se conectó y nunca entró a una sala)
setInterval(() => {
  const now = Date.now();
  for (const c of [...conns]) if (now - c.lastMsg > 30000) c.destroy();
}, 5000);

process.on('SIGTERM', () => process.exit(0));   // el hosting (Render) apaga el servidor así al actualizar

// En Render hay que escuchar en 0.0.0.0; en tu PC se deja el valor por defecto
const listenArgs = process.env.RENDER ? [PORT, '0.0.0.0'] : [PORT];
server.listen(...listenArgs, () => {
  console.log('\n  BLOCKY STRIKE listo\n');
  console.log('  En esta PC:        http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log('  Amigos (misma red): http://' + i.address + ':' + PORT);
    }
  }
  console.log('\n  Para jugar con amigos: elige "Crear sala" y pásales el código de 4 letras.\n');
  ensureThree();
});
