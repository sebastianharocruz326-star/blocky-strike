// Datos compartidos entre el navegador (game.js) y el servidor (server.js).
// Así los dos usan EXACTAMENTE el mismo mapa y las mismas armas.

export const PLAYER = { radius: 0.4, height: 1.8, eye: 1.65, maxHp: 100, killHeal: 0, respawn: 0, step: 0.6 };
// killHeal 0 y respawn 0 = estilo CS: no curas al matar y no reapareces hasta la siguiente ronda

// Estadísticas de armas (estilo CS: preciso quieto, impreciso en movimiento)
// knife es el índice 0
export const WEAPONS = [
  { id: 'knife',   name: 'Cuchillo',     mag: 0,  rate: 0.55, auto: false, damage: 45, head: 1.6, pellets: 1, spread: 0,     reload: 0,   melee: true, price: 0 },
  { id: 'pistol',  name: 'Pistola',      mag: 12, rate: 0.20, auto: false, damage: 35, head: 2.2, pellets: 1, spread: 0.002, reload: 1.2, price: 0 },
  { id: 'smg',     name: 'Subfusil',     mag: 30, rate: 0.065,auto: true,  damage: 18, head: 1.9, pellets: 1, spread: 0.012, reload: 1.6, price: 1500 },
  { id: 'rifle',   name: 'Rifle',        mag: 30, rate: 0.095,auto: true,  damage: 28, head: 2.1, pellets: 1, spread: 0.003, reload: 1.9, price: 2700 },
  { id: 'shotgun', name: 'Escopeta',     mag: 7,  rate: 0.90, auto: false, damage: 16, head: 1.4, pellets: 9, spread: 0.055, reload: 2.4, price: 1800 },
  { id: 'sniper',  name: 'Francotirador',mag: 5,  rate: 1.35, auto: false, damage: 90, head: 2.0, pellets: 1, spread: 0.0005,reload: 2.9, price: 4750, zoom: 3.4 },
  // Granadas (se tiran, no se disparan)
  { id: 'he',      name: 'Granada HE',   mag: 1,  rate: 0.9,  auto: false, damage: 98, head: 1,   pellets: 1, spread: 0,     reload: 0,   grenade: true, gtype: 'he',    fuse: 1.6, radius: 5.5, price: 300 },
  { id: 'flash',   name: 'Flashbang',    mag: 1,  rate: 0.9,  auto: false, damage: 0,  head: 1,   pellets: 1, spread: 0,     reload: 0,   grenade: true, gtype: 'flash', fuse: 1.2, radius: 9,   price: 200 },
  { id: 'smoke',   name: 'Humo',         mag: 1,  rate: 0.9,  auto: false, damage: 0,  head: 1,   pellets: 1, spread: 0,     reload: 0,   grenade: true, gtype: 'smoke', fuse: 1.5, radius: 4.5, price: 300 },
];

// Economía estilo CS
export const ECO = {
  startMoney: 800,
  maxMoney: 16000,
  kill: 300,
  headshotBonus: 100,
  win: 3250,
  loss: 1400,
  lossStreakBonus: 500,   // +500 por derrota seguida (máx 3)
  plant: 300,
  defuse: 300,
};

// Partida: freeze + buy + play + break (estilo CS) + bomba
export const MATCH = {
  rounds: 12,             // mejor de 12 (como MR12 moderno)
  freezeSec: 6,           // freeze time (no te puedes mover)
  buySec: 12,             // tiempo de compra (incluye freeze)
  roundSec: 115,          // tiempo de ronda una vez empieza el combate
  breakSec: 7,
  finalSec: 12,
  // Bomba
  plantSec: 3.2,          // tiempo manteniendo E para plantar
  defuseSec: 5.0,         // tiempo manteniendo E para desactivar
  bombTimerSec: 40,       // cuenta atrás hasta la explosión
  bombRadius: 1.4,        // distancia al site / bomba para E
  attackerTeam: 1,        // Bravo planta (como T)
  defenderTeam: 0,        // Alpha defiende (como CT)
};

export const TEAMS = {
  0: { id: 0, name: 'Alpha',  color: 0x3b82f6, hex: '#3b82f6' }, // azul = defensores
  1: { id: 1, name: 'Bravo',  color: 0xef4444, hex: '#ef4444' }, // rojo = atacantes (bomba)
};

// Recoil acumulativo por arma (estilo CS: sube al disparar seguido, se recupera al soltar)
// pattern = incremento de pitch por bala; recover = velocidad de recuperación /s
export const RECOIL = {
  knife:  { up: 0.00, side: 0.00, recover: 8 },
  pistol: { up: 0.028, side: 0.012, recover: 6 },
  smg:    { up: 0.018, side: 0.014, recover: 7 },
  rifle:  { up: 0.022, side: 0.010, recover: 5.5 },
  shotgun:{ up: 0.06,  side: 0.03,  recover: 4 },
  sniper: { up: 0.08,  side: 0.02,  recover: 3 },
  he:     { up: 0.00, side: 0.00, recover: 8 },
  flash:  { up: 0.00, side: 0.00, recover: 8 },
  smoke:  { up: 0.00, side: 0.00, recover: 8 },
};

const WALL = 0xc9b78d, CRATE = 0x9b6a3a, DARK = 0x6e6e6e, ROOF = 0x8a7a5a;
const CONC = 0x8d939b, SHELF = 0x4f6a86, ORANGE = 0xc27a2e, STEEL = 0x5a6068, YEL = 0xd4b02a;
const BRICK = 0xa65a47, STONE = 0xb4b0a6, PLAZA = 0xa89f91;
const BLUE = 0x2a6f9e, REDC = 0xa33a2a, GREENC = 0x3a7a4a, SAND = 0xc4a574;
const WHITE = 0xd8d4cc, BLACK = 0x2a2a2e, FENCE = 0x7a8088, CONE = 0xe07020;

function adder(b) { return (cx, cz, w, d, h, color, y0 = 0) => b.push([cx, cz, w, d, h, color, y0]); }
function perimeter(add, color) {
  add(0, -30, 62, 2, 7, color); add(0, 30, 62, 2, 7, color);
  add(-30, 0, 2, 58, 7, color); add(30, 0, 2, 58, 7, color);
}
// Contenedor de carga estilo Krunker
function container(add, cx, cz, color, rot = 0) {
  if (rot) {
    add(cx, cz, 2.6, 6.2, 2.6, color);
    add(cx, cz, 2.4, 6.0, 0.15, DARK, 2.6);
  } else {
    add(cx, cz, 6.2, 2.6, 2.6, color);
    add(cx, cz, 6.0, 2.4, 0.15, DARK, 2.6);
  }
}
// Pila de cajas
function crateStack(add, cx, cz, n = 2) {
  for (let i = 0; i < n; i++) add(cx + (i % 2) * 0.15, cz + (i % 2) * 0.1, 1.8, 1.8, 1.1, CRATE, i * 1.1);
}
// Cono de tráfico
function cone(add, cx, cz) {
  add(cx, cz, 0.35, 0.35, 0.7, CONE);
  add(cx, cz, 0.5, 0.5, 0.08, WHITE);
}

// cada caja: [centroX, centroZ, ancho, profundo, alto, color, y0]
function dustBoxes() {
  const b = [], add = adder(b);
  perimeter(add, WALL);

  // edificio central con puertas (mid)
  add(-5, -6, 6, 1, 4, WALL); add(5, -6, 6, 1, 4, WALL);
  add(-5, 6, 6, 1, 4, WALL);  add(5, 6, 6, 1, 4, WALL);
  add(-8, -4, 1, 4, 4, WALL); add(-8, 4, 1, 4, 4, WALL);
  add(8, 0, 1, 13, 4, WALL);
  add(0, 0, 4, 4, 0.3, SAND); // suelo interior
  crateStack(add, -3, 0, 2); crateStack(add, 3, -2, 2);

  // contenedores de carga (azul / rojo / verde)
  container(add, -16, 8, BLUE); container(add, -16, 11.2, REDC);
  container(add, 16, -8, GREENC, 1); container(add, 19.2, -8, BLUE, 1);
  container(add, 14, 16, ORANGE); container(add, -20, -16, STEEL);

  // muros bajos / coberturas
  add(-18, -12, 8, 0.8, 1.5, DARK); add(10, 18, 0.8, 8, 1.5, DARK);
  add(-6, 14, 6, 0.7, 1.3, DARK); add(6, -14, 0.7, 5, 1.3, DARK);
  add(0, 12, 4, 0.6, 1.2, FENCE); add(0, -12, 4, 0.6, 1.2, FENCE);

  // pilares / torres
  add(-22, -22, 1.6, 1.6, 6, WALL); add(-10, -22, 1.6, 1.6, 6, WALL);
  add(22, 22, 1.6, 1.6, 5, WALL); add(10, 22, 1.4, 1.4, 4.5, CONC);

  // plataforma elevada NE con escaleras
  for (let i = 0; i < 6; i++) add(12.5 + i, -18, 1, 4, 0.5 * (i + 1), ROOF);
  add(23, -18, 10, 10, 3, ROOF);
  add(23, -22.5, 10, 0.5, 1, DARK, 3); add(27.5, -18, 0.5, 8, 1, DARK, 3);
  crateStack(add, 21, -16, 2); cone(add, 19, -20); cone(add, 25, -15);

  // plataforma SO
  add(-17.5, 18, 1, 4, 0.6, ROOF); add(-22, 18, 8, 8, 1.2, ROOF);
  crateStack(add, -20, 16, 3); cone(add, -24, 14);

  // “vehículo” (bloque blanco + negro)
  add(-8, -18, 3.2, 1.6, 1.2, WHITE); add(-8, -18, 3.0, 1.4, 0.5, BLACK, 1.2);
  add(12, 8, 1.6, 3.0, 1.1, WHITE); add(12, 8, 1.4, 2.8, 0.4, BLACK, 1.1);

  // cajas sueltas y palés
  crateStack(add, -15, 10, 2); crateStack(add, -12.5, 10.5, 3);
  crateStack(add, 15, 12, 2); crateStack(add, 18, 14, 2);
  crateStack(add, 4, 20, 2); crateStack(add, -4, -20, 2);
  add(7, 5, 2.5, 1.2, 0.4, CRATE); add(-7, -5, 1.2, 2.5, 0.4, CRATE);

  // valla / alambrada baja
  for (let z = -28; z <= 28; z += 4) {
    add(-28.5, z, 0.15, 0.15, 2.2, FENCE); add(28.5, z, 0.15, 0.15, 2.2, FENCE);
  }
  cone(add, -5, 22); cone(add, 5, -22); cone(add, 22, 5); cone(add, -22, -5);
  return b;
}

// Almacén: estilo industrial Krunker
function warehouseBoxes() {
  const b = [], add = adder(b);
  perimeter(add, CONC);
  // estantes largos
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    add(sx * 18, sz * 15, 12, 1.4, 3.2, SHELF);
    add(sx * 18, sz * 15, 11.5, 1.0, 0.2, DARK, 3.2);
  }
  // contenedores centrales
  container(add, -9, 0, STEEL); container(add, 9, 0, ORANGE);
  container(add, 0, 4, BLUE); container(add, 0, -4, REDC, 1);
  // pilares
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * 8, sz * 8, 1.2, 1.2, 7, CONC);
  // cajas apiladas
  crateStack(add, -25, -4, 3); crateStack(add, -25, -7, 2);
  crateStack(add, 25, 4, 3); crateStack(add, 25, 7, 2);
  crateStack(add, -12, 20, 2); crateStack(add, 12, -20, 2);
  // muros bajos
  add(0, 9, 8, 0.8, 1.2, YEL); add(0, -9, 8, 0.8, 1.2, YEL);
  add(12, 0, 0.8, 6, 1.2, YEL); add(-12, 0, 0.8, 6, 1.2, YEL);
  // pasarela elevada norte
  add(0, -26, 28, 6, 2.4, STEEL);
  for (let i = 0; i < 5; i++) {
    add(18.5 - i, -26, 1, 6, 0.48 * (i + 1), CONC);
    add(-18.5 + i, -26, 1, 6, 0.48 * (i + 1), CONC);
  }
  add(0, -23.2, 28, 0.4, 1, YEL, 2.4);
  // oficina / caseta
  add(-22, 22, 6, 5, 3.5, WHITE); add(-22, 22, 5.6, 4.6, 0.2, DARK, 3.5);
  add(-20, 20, 1.2, 0.2, 1.5, 0x66aacc, 1.2); // ventana
  // conos y props
  cone(add, -6, 6); cone(add, 6, -6); cone(add, 20, 20); cone(add, -20, -20);
  add(15, 12, 2.5, 1.2, 1.0, WHITE); // furgoneta simple
  return b;
}

// Plaza Cruz: edificios de esquina + detalle urbano
function crossBoxes() {
  const b = [], add = adder(b);
  perimeter(add, PLAZA);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(sx * 19, sz * 19, 12, 12, 4, BRICK);
    for (let i = 0; i < 7; i++) add(sx * 16.5, sz * (6.5 + i), 3, 1, 0.5 * (i + 1), STONE);
    add(sx * 13.25, sz * 19, 0.5, 10, 1, DARK, 4);
    add(sx * 21.5, sz * 13.25, 5, 0.5, 1, DARK, 4);
    // antenas / AC en azotea
    add(sx * 19, sz * 19, 0.4, 0.4, 1.5, DARK, 4);
    add(sx * 17, sz * 21, 1.5, 1.0, 0.8, STEEL, 4);
  }
  // fuente central
  add(0, 0, 6, 6, 1, STONE); add(0, 0, 2, 2, 3, BRICK, 1);
  add(0, 0, 3.5, 3.5, 0.3, 0x4a90c8, 1); // agua
  // cajas y contenedores en calles
  crateStack(add, 8, 4, 2); crateStack(add, -8, -4, 2);
  crateStack(add, 4, -8, 2); crateStack(add, -4, 8, 2);
  container(add, 0, 14, BLUE); container(add, 0, -14, REDC);
  container(add, 14, 0, GREENC, 1); container(add, -14, 0, ORANGE, 1);
  // muros de cobertura en cruces
  add(0, 28, 10, 0.8, 1.5, DARK); add(0, -28, 10, 0.8, 1.5, DARK);
  add(28, 0, 0.8, 10, 1.5, DARK); add(-28, 0, 0.8, 10, 1.5, DARK);
  add(8, 8, 3, 0.6, 1.2, FENCE); add(-8, -8, 3, 0.6, 1.2, FENCE);
  cone(add, 10, 0); cone(add, -10, 0); cone(add, 0, 10); cone(add, 0, -10);
  // banco / props
  add(6, -6, 2.2, 0.6, 0.5, CRATE); add(-6, 6, 0.6, 2.2, 0.5, CRATE);
  return b;
}

export const MAPS = {
  dust: {
    name: 'Dust Blocks', sky: 0xa8c8e8, ground: 0xc4a06a,
    // spawns por equipo: 0 = Alpha (norte), 1 = Bravo (sur)
    teamSpawns: {
      0: [[0, 24], [-20, 24.5], [20, 24], [-10, 22], [10, 22], [-24, 20]],
      1: [[0, -26], [-24, -26], [24, -26], [-10, -24], [10, -24], [20, -22]],
    },
    // sitios de bomba [x, z, radio]
    sites: { A: [18, 12, 3.5], B: [-16, -14, 3.5] },
    spawns: [[0, 24], [-20, 24.5], [20, 24], [0, -26], [-24, -26], [24, -26]],
    waypoints: [
      [-24, 24], [0, 24], [24, 24], [-24, 8], [24, -2], [-26, -8], [0, -12], [0, -26],
      [-16, -26], [16, -8], [-12, 0], [12, 0], [0, 0], [5, 3], [-14, 16], [14, 8], [6, 16], [24, -26],
    ],
    boxes: dustBoxes(),
  },
  almacen: {
    name: 'Almacén', sky: 0x9aa8b8, ground: 0x6a7078,
    teamSpawns: {
      0: [[-24, -26], [24, -26], [0, -18], [-18, -22], [18, -22], [0, -26]],
      1: [[-24, 26], [0, 26], [24, 26], [-18, 22], [18, 22], [0, 18]],
    },
    sites: { A: [0, -26, 4], B: [0, 12, 3.5] },
    spawns: [[-24, -26], [24, -26], [-24, 26], [0, 26], [24, 26], [0, -18]],
    waypoints: [
      [-24, -20], [24, -20], [-6, -18], [6, -18], [0, -12], [-14, -6], [14, -6], [-14, 0], [14, 0],
      [0, -4], [0, 4], [-14, 6], [14, 6], [0, 12], [-26, 10], [26, -10], [-26, 24], [0, 22],
      [26, 24], [-6, 20], [6, 20], [-26, -14], [26, 14],
    ],
    boxes: warehouseBoxes(),
  },
  cruce: {
    name: 'Plaza Cruz', sky: 0x90c0e8, ground: 0x9a8f78,
    teamSpawns: {
      0: [[0, 24], [24, 0], [27, 27], [-27, 27], [10, 24], [-10, 24]],
      1: [[0, -24], [-24, 0], [27, -27], [-27, -27], [10, -24], [-10, -24]],
    },
    sites: { A: [19, 19, 3.5], B: [-19, -19, 3.5] },
    spawns: [[0, 24], [0, -24], [24, 0], [-24, 0], [27, 27], [-27, -27]],
    waypoints: [
      [0, 20], [0, -20], [20, 0], [-20, 0], [0, 10], [0, -10], [10, 0], [-10, 0],
      [10, 10], [-10, -10], [10, -10], [-10, 10], [27, 20], [27, -20], [-27, 20], [-27, -20],
      [20, 27], [-20, 27], [20, -27], [-20, -27],
    ],
    boxes: crossBoxes(),
  },
};
export const MAP_KEYS = Object.keys(MAPS);

// list = [{ id, name, team, rk, rd, wins, kills, deaths, money }]
export function roundResult(list) {
  // Ahora se resuelve por equipos: gana el equipo que eliminó al otro o el que más kills de equipo tenga
  const teams = { 0: { kills: 0, alive: 0, players: [] }, 1: { kills: 0, alive: 0, players: [] } };
  for (const p of list) {
    if (p.team !== 0 && p.team !== 1) continue;
    teams[p.team].kills += p.rk;
    teams[p.team].players.push(p);
  }
  // alive se calcula en el servidor al final de ronda
  return { teams, rows: [...list].sort((a, b) => b.rk - a.rk || a.rd - b.rd) };
}

export function finalStandings(list) {
  return [...list].sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.deaths - b.deaths);
}

export function boxesToSolids(boxes) {
  return boxes.map(([cx, cz, w, d, h, , y0 = 0]) => (
    { x0: cx - w / 2, x1: cx + w / 2, y0, y1: y0 + h, z0: cz - d / 2, z1: cz + d / 2 }
  ));
}

// Rayo contra una caja alineada a los ejes. Devuelve la distancia o -1 si no la toca.
export function rayAABB(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

// Elige el punto de aparición más lejos de los demás jugadores. others = [{x, z}]
export function pickSpawn(spawns, others) {
  let best = spawns[0], bestD = -1;
  for (const s of spawns) {
    let md = 1e9;
    for (const o of others) md = Math.min(md, Math.hypot(s[0] - o.x, s[1] - o.z));
    if (md > bestD) { bestD = md; best = s; }
  }
  return best;
}

export function pickTeamSpawn(mapKey, team, others) {
  const map = MAPS[mapKey];
  const list = (map.teamSpawns && map.teamSpawns[team]) || map.spawns;
  return pickSpawn(list, others);
}
