const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ── STORAGE ──
const DATA = path.join(__dirname, "data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA);
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return d; } };
const save = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d));
const getUsers = () => load("users.json", {});
const saveUsers = u => save("users.json", u);
const getUser = n => getUsers()[n.toLowerCase()] || null;
const putUser = u => { const all = getUsers(); all[u.username.toLowerCase()] = u; saveUsers(all); };
const getLB = () => load("lb.json", []);
const saveLB = lb => save("lb.json", lb);
const updLB = u => { const lb = getLB(); const i = lb.findIndex(e => e.u === u.username); const e = { u: u.username, e: u.lp, w: u.wins, l: u.losses, a: u.avatar || "🐧" }; if (i >= 0) lb[i] = e; else lb.push(e); lb.sort((a, b) => b.e - a.e); saveLB(lb.slice(0, 100)); };
const getChat = () => load("chat.json", []);
const saveChat = c => save("chat.json", c);

// ── CONSTANTS ──
const IW = 13, IH = 11, GW = IW + 2, GH = IH + 2, CELL = 52;
const FUSE = 3400, EXDUR = 500, RTIME = 120, SDI = 400;
const PUC = 0.4, SR = 2, MOVE_SPD = 1.15, CC = 11;
const TICK = 1000 / 30;
const T = { E: 0, W: 1, B: 2 };
const DR = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const PUTS = ["range", "bombs", "speed", "kick"];
const TIER_NAMES = ["Bronze", "Argent", "Or", "Platine", "Diamant", "Maître"];
const TIER_COLORS = ["#CD7F32", "#C0C0C0", "#FFD700", "#00CED1", "#B9F2FF", "#FF6B6B"];

function rankName(lp) { if (lp >= 2000) return "Maître"; const t = Math.min(4, Math.max(0, Math.floor(lp / 400))); return `${TIER_NAMES[t]} ${4 - Math.floor((lp - t * 400) / 100)}`; }
function rankColor(lp) { if (lp >= 2000) return TIER_COLORS[5]; return TIER_COLORS[Math.min(4, Math.max(0, Math.floor(lp / 400)))]; }
function calcLP(my, op, won) { const b = won ? 28 : -18, s = won ? Math.max(0.6, 1.3 - my / 3e3) : Math.min(1.4, 0.8 + my / 3e3), d = op - my, o = won ? Math.max(0, d / 200) * 5 : Math.min(0, d / 200) * 3; return Math.round(b * s + o); }

function makeGrid() {
  const g = Array.from({ length: GH }, () => Array(GW).fill(T.E));
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (x === 0 || x === GW - 1 || y === 0 || y === GH - 1) g[y][x] = T.W;
  for (let iy = 0; iy < IH; iy++) for (let ix = 0; ix < IW; ix++) if (ix % 2 === 1 && iy % 2 === 1) g[iy + 1][ix + 1] = T.W;
  const sf = new Set(); [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3]].forEach(([x, y]) => sf.add(`${x},${y}`));
  const ax = GW - 2, ay = GH - 2; [[ax, ay], [ax - 1, ay], [ax, ay - 1], [ax - 2, ay], [ax, ay - 2]].forEach(([x, y]) => sf.add(`${x},${y}`));
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) if (g[y][x] === T.E && !sf.has(`${x},${y}`) && Math.random() < 0.6) g[y][x] = T.B;
  return g;
}

function genSpiral() {
  const o = [], v = new Set(); let t = 1, b = GH - 2, l = 1, r = GW - 2;
  while (t <= b && l <= r) {
    for (let x = l; x <= r; x++) { const k = `${x},${t}`; if (!v.has(k)) { v.add(k); o.push({ x, y: t }); } } t++;
    for (let y = t; y <= b; y++) { const k = `${r},${y}`; if (!v.has(k)) { v.add(k); o.push({ x: r, y }); } } r--;
    for (let x = r; x >= l; x--) { const k = `${x},${b}`; if (!v.has(k)) { v.add(k); o.push({ x, y: b }); } } b--;
    for (let y = b; y >= t; y--) { const k = `${l},${y}`; if (!v.has(k)) { v.add(k); o.push({ x: l, y }); } } l++;
  }
  return o;
}

// ── SMOOTH MOVEMENT ──
function isBlocked(grid, px, py, hs) {
  const bl = v => v === T.W || v === T.B;
  const minX = Math.floor((px - hs) / CELL), maxX = Math.floor((px + hs) / CELL);
  const minY = Math.floor((py - hs) / CELL), maxY = Math.floor((py + hs) / CELL);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (bl(grid[y]?.[x])) return true;
  return false;
}

function tryMove(ent, dx, dy, spd, grid, bombs, game) {
  const hs = CELL / 2 - 6;
  let npx = ent.px + dx * spd, npy = ent.py + dy * spd;

  // Lane alignment
  if (dx) { const c = ent.gy * CELL + CELL / 2, d = c - ent.py; if (Math.abs(d) > 0.5) npy = ent.py + Math.sign(d) * Math.min(spd, Math.abs(d)); else npy = c; }
  if (dy) { const c = ent.gx * CELL + CELL / 2, d = c - ent.px; if (Math.abs(d) > 0.5) npx = ent.px + Math.sign(d) * Math.min(spd, Math.abs(d)); else npx = c; }

  if (!isBlocked(grid, npx, npy, hs)) {
    const ngx = Math.floor(npx / CELL), ngy = Math.floor(npy / CELL);
    const onBomb = bombs.some(b => b.gx === ngx && b.gy === ngy);
    const wasOn = bombs.some(b => b.gx === ent.gx && b.gy === ent.gy);
    if (onBomb && !(ngx === ent.gx && ngy === ent.gy) && !wasOn) {
      if (ent.kick) {
        const bomb = bombs.find(b => b.gx === ngx && b.gy === ngy);
        if (bomb && !game.kicked.some(k => k.id === bomb.id)) {
          let fx = ngx, fy = ngy;
          while (true) { const nx = fx + dx, ny = fy + dy; if (nx < 0 || nx >= GW || ny < 0 || ny >= GH || grid[ny][nx] !== T.E || bombs.some(b => b.id !== bomb.id && b.gx === nx && b.gy === ny)) break; fx = nx; fy = ny; }
          if (fx !== ngx || fy !== ngy) game.kicked.push({ id: bomb.id, tx: fx, ty: fy, dx, dy });
        }
      }
      return false;
    }
    ent.px = npx; ent.py = npy; ent.gx = Math.floor(npx / CELL); ent.gy = Math.floor(npy / CELL);
    return true;
  }

  // Corner cutting
  if (dx && !dy) {
    for (const n of [-1, 1]) {
      const tc = Math.round((ent.py + n) / CELL) * CELL + CELL / 2;
      if (Math.abs(ent.py - tc) < CC && !isBlocked(grid, npx, tc, hs)) {
        const ng = Math.floor(npx / CELL), ng2 = Math.floor(tc / CELL);
        if (!bombs.some(b => b.gx === ng && b.gy === ng2)) { ent.px = npx; ent.py = tc; ent.gx = ng; ent.gy = ng2; return true; }
      }
    }
  }
  if (dy && !dx) {
    for (const n of [-1, 1]) {
      const tc = Math.round((ent.px + n) / CELL) * CELL + CELL / 2;
      if (Math.abs(ent.px - tc) < CC && !isBlocked(grid, tc, npy, hs)) {
        const ng = Math.floor(tc / CELL), ng2 = Math.floor(npy / CELL);
        if (!bombs.some(b => b.gx === ng && b.gy === ng2)) { ent.px = tc; ent.py = npy; ent.gx = ng; ent.gy = ng2; return true; }
      }
    }
  }
  return false;
}

// ── MATCHMAKING ──
const queue = [];
const games = new Map();
const playerGame = new Map();
const playerInput = new Map();

function findMatch() {
  if (queue.length < 2) return;
  queue.sort((a, b) => a.lp - b.lp);
  let bi = 0, bd = Infinity;
  for (let i = 0; i < queue.length - 1; i++) { const d = Math.abs(queue[i].lp - queue[i + 1].lp); if (d < bd) { bd = d; bi = i; } }
  const p1 = queue.splice(bi + 1, 1)[0], p2 = queue.splice(bi, 1)[0];
  createGame(p1, p2);
}

function createGame(p1, p2) {
  const gid = `g_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const u1 = getUser(p1.username), u2 = getUser(p2.username);
  const game = {
    id: gid,
    pl: {
      p1: { sock: p1.socket, name: p1.username, lp: p1.lp, skin: u1?.skin || "classic", arena: u1?.arena || "glacier", avatar: u1?.avatar || "🐧" },
      p2: { sock: p2.socket, name: p2.username, lp: p2.lp, skin: u2?.skin || "classic", arena: u2?.arena || "glacier", avatar: u2?.avatar || "🐧" },
    },
    sc: { p1: 0, p2: 0 }, rn: 0, phase: "cd", cd: 3,
    grid: null, ent: null, bombs: [], expl: [], pups: [], kicked: [], emotes: [],
    sd: false, sdO: [], sdI: 0, sdL: 0, rStart: 0,
    tick: null, cdInt: null, curArena: "glacier",
  };
  games.set(gid, game);
  playerGame.set(p1.socket.id, gid);
  playerGame.set(p2.socket.id, gid);
  playerInput.set(p1.socket.id, { dx: 0, dy: 0 });
  playerInput.set(p2.socket.id, { dx: 0, dy: 0 });

  const mkInfo = (u) => ({ username: u?.username, lp: u?.lp, skin: u?.skin, arena: u?.arena, avatar: u?.avatar || "🐧" });
  p1.socket.emit("matchFound", { gid, you: "p1", opp: mkInfo(u2), me: mkInfo(u1) });
  p2.socket.emit("matchFound", { gid, you: "p2", opp: mkInfo(u1), me: mkInfo(u2) });
  startCD(gid);
}

function bc(game, ev, data) { game.pl.p1.sock.emit(ev, data); game.pl.p2.sock.emit(ev, data); }

function startCD(gid) {
  const g = games.get(gid); if (!g) return;
  g.rn++; g.phase = "cd"; g.cd = 3;
  g.curArena = g.rn % 2 === 1 ? g.pl.p1.arena : g.pl.p2.arena;
  bc(g, "roundStart", { round: g.rn, cd: 3, arena: g.curArena });
  g.cdInt = setInterval(() => {
    g.cd--;
    bc(g, "countdown", { v: g.cd });
    if (g.cd <= 0) { clearInterval(g.cdInt); setTimeout(() => startRound(gid), 500); }
  }, 1000);
}

function startRound(gid) {
  const g = games.get(gid); if (!g) return;
  g.grid = makeGrid(); g.bombs = []; g.expl = []; g.pups = []; g.kicked = []; g.emotes = [];
  g.sd = false; g.sdO = genSpiral(); g.sdI = 0; g.sdL = 0; g.rStart = Date.now(); g.phase = "play";

  g.ent = {
    p1: { px: CELL + CELL / 2, py: CELL + CELL / 2, gx: 1, gy: 1, range: SR, mB: 1, bL: 1, spd: 1, kick: false, alive: true, dir: { dx: 1, dy: 0 } },
    p2: { px: CELL * (GW - 2) + CELL / 2, py: CELL * (GH - 2) + CELL / 2, gx: GW - 2, gy: GH - 2, range: SR, mB: 1, bL: 1, spd: 1, kick: false, alive: true, dir: { dx: -1, dy: 0 } },
  };

  playerInput.set(g.pl.p1.sock.id, { dx: 0, dy: 0 });
  playerInput.set(g.pl.p2.sock.id, { dx: 0, dy: 0 });

  bc(g, "roundBegin", { grid: g.grid, ent: sEnt(g.ent), round: g.rn });
  g.tick = setInterval(() => gameTick(gid), TICK);
}

function sEnt(ent) {
  const r = {};
  for (const p of ["p1", "p2"]) {
    const e = ent[p];
    r[p] = { px: e.px, py: e.py, gx: e.gx, gy: e.gy, range: e.range, mB: e.mB, bL: e.bL, spd: e.spd, kick: e.kick, alive: e.alive, dir: e.dir };
  }
  return r;
}

function gameTick(gid) {
  const g = games.get(gid); if (!g || g.phase !== "play") return;
  const now = Date.now();

  // Move players
  for (const pid of ["p1", "p2"]) {
    const e = g.ent[pid]; if (!e.alive) continue;
    const inp = playerInput.get(g.pl[pid].sock.id) || { dx: 0, dy: 0 };
    if (inp.dx || inp.dy) {
      e.dir = { dx: inp.dx, dy: inp.dy };
      const spd = MOVE_SPD * (1 + (e.spd - 1) * 0.3);
      if (tryMove(e, inp.dx, inp.dy, spd, g.grid, g.bombs, g)) {
        // Pickup
        const pi = g.pups.findIndex(p => p.x === e.gx && p.y === e.gy);
        if (pi >= 0) {
          const pu = g.pups[pi];
          if (pu.type === "range") e.range = Math.min(e.range + 1, 8);
          if (pu.type === "bombs") { e.mB++; e.bL++; }
          if (pu.type === "speed") e.spd = Math.min(e.spd + 1, 3);
          if (pu.type === "kick") e.kick = true;
          g.pups.splice(pi, 1);
          bc(g, "pickup", { pid, type: pu.type, x: e.gx, y: e.gy });
        }
      }
    }
  }

  // Timer
  const rem = Math.max(0, RTIME - Math.floor((now - g.rStart) / 1000));

  // Sudden death
  if (rem <= 0 && !g.sd) { g.sd = true; g.sdL = now; bc(g, "suddenDeath", {}); }
  if (g.sd && g.sdI < g.sdO.length && now - g.sdL >= SDI) {
    const c = g.sdO[g.sdI];
    if (g.grid[c.y][c.x] !== T.W) {
      g.grid[c.y][c.x] = T.W;
      g.pups = g.pups.filter(p => !(p.x === c.x && p.y === c.y));
      for (const pid of ["p1", "p2"]) { const e = g.ent[pid]; if (e.alive && e.gx === c.x && e.gy === c.y) e.alive = false; }
      bc(g, "wallPlace", { x: c.x, y: c.y });
    }
    g.sdI++; g.sdL = now;
  }

  // Bombs
  for (const b of [...g.bombs]) if (now >= b.timer) explode(g, b);

  // Kicked bombs
  for (const kb of [...g.kicked]) {
    const bomb = g.bombs.find(b => b.id === kb.id);
    if (!bomb) { g.kicked = g.kicked.filter(k => k.id !== kb.id); continue; }
    const nx = bomb.gx + kb.dx, ny = bomb.gy + kb.dy;
    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && g.grid[ny][nx] === T.E && !g.bombs.some(ob => ob.id !== bomb.id && ob.gx === nx && ob.gy === ny)) {
      bomb.gx = nx; bomb.gy = ny; bomb.px = nx * CELL + CELL / 2; bomb.py = ny * CELL + CELL / 2;
      if (bomb.gx === kb.tx && bomb.gy === kb.ty) g.kicked = g.kicked.filter(k => k.id !== kb.id);
    } else g.kicked = g.kicked.filter(k => k.id !== kb.id);
  }

  // Explosion hit check
  g.expl = g.expl.filter(e => now - e.time < EXDUR);
  for (const ex of g.expl) for (const c of ex.cells) {
    for (const pid of ["p1", "p2"]) { const e = g.ent[pid]; if (e.alive && e.gx === c.x && e.gy === c.y) e.alive = false; }
  }

  // Win check
  if (!g.ent.p1.alive || !g.ent.p2.alive) {
    let w = "draw";
    if (!g.ent.p1.alive && g.ent.p2.alive) w = "p2";
    if (g.ent.p1.alive && !g.ent.p2.alive) w = "p1";
    endRound(gid, w); return;
  }

  // Broadcast
  bc(g, "tick", {
    ent: sEnt(g.ent),
    bombs: g.bombs.map(b => ({ gx: b.gx, gy: b.gy, px: b.px, py: b.py, timer: b.timer, id: b.id, owner: b.owner, range: b.range })),
    pups: g.pups,
    expl: g.expl.map(e => ({ cells: e.cells, time: e.time })),
    grid: g.grid,
    timer: rem,
    emotes: g.emotes,
  });

  g.emotes = g.emotes.filter(e => now - e.time < 2500);
}

function explode(g, bomb) {
  if (!g.bombs.some(b => b.id === bomb.id)) return;
  const owner = g.ent[bomb.owner];
  if (owner) owner.bL = Math.min(owner.bL + 1, owner.mB);
  g.bombs = g.bombs.filter(b => b.id !== bomb.id);
  g.kicked = g.kicked.filter(k => k.id !== bomb.id);

  const cells = [{ x: bomb.gx, y: bomb.gy }];
  const newP = new Set();

  for (const [dx, dy] of DR) {
    for (let i = 1; i <= bomb.range; i++) {
      const nx = bomb.gx + dx * i, ny = bomb.gy + dy * i;
      if (nx < 0 || nx >= GW || ny < 0 || ny >= GH || g.grid[ny][nx] === T.W) break;
      if (g.grid[ny][nx] === T.B) {
        g.grid[ny][nx] = T.E;
        cells.push({ x: nx, y: ny });
        if (Math.random() < PUC) {
          const pid = Math.random().toString(36);
          g.pups.push({ x: nx, y: ny, type: PUTS[Math.floor(Math.random() * 4)], id: pid });
          newP.add(pid);
        }
        break;
      }
      cells.push({ x: nx, y: ny });
      const chain = g.bombs.find(b => b.gx === nx && b.gy === ny);
      if (chain) { setTimeout(() => explode(g, chain), 80); break; }
    }
  }

  g.pups = g.pups.filter(p => { if (newP.has(p.id)) return true; return !cells.some(c => c.x === p.x && c.y === p.y); });
  g.expl.push({ cells, time: Date.now() });
  for (const pid of ["p1", "p2"]) { const e = g.ent[pid]; if (e.alive && cells.some(c => c.x === e.gx && c.y === e.gy)) e.alive = false; }
  bc(g, "explosion", { cells, bx: bomb.gx, by: bomb.gy });
}

function endRound(gid, winner) {
  const g = games.get(gid); if (!g || g.phase !== "play") return;
  clearInterval(g.tick); g.phase = "rEnd";
  if (winner === "p1") g.sc.p1++; else if (winner === "p2") g.sc.p2++;
  bc(g, "roundEnd", { winner, sc: g.sc });
  if (g.sc.p1 >= 3 || g.sc.p2 >= 3) setTimeout(() => endMatch(gid), 2000);
  else setTimeout(() => startCD(gid), 2500);
}

function endMatch(gid) {
  const g = games.get(gid); if (!g) return;
  g.phase = "mEnd"; clearInterval(g.tick);
  const mw = g.sc.p1 >= 3 ? "p1" : "p2", ml = mw === "p1" ? "p2" : "p1";
  const wu = getUser(g.pl[mw].name), lu = getUser(g.pl[ml].name);
  if (wu && lu) {
    const wd = calcLP(wu.lp, lu.lp, true), ld = calcLP(lu.lp, wu.lp, false);
    wu.lp = Math.max(0, wu.lp + wd); wu.wins = (wu.wins || 0) + 1; wu.games = (wu.games || 0) + 1;
    wu.currentStreak = (wu.currentStreak || 0) + 1; wu.bestStreak = Math.max(wu.bestStreak || 0, wu.currentStreak);
    wu.history = [{ t: Date.now(), vs: lu.username, r: "W", s: `${g.sc.p1}-${g.sc.p2}`, lp: wd }, ...(wu.history || []).slice(0, 19)];
    putUser(wu); updLB(wu);
    lu.lp = Math.max(0, lu.lp + ld); lu.losses = (lu.losses || 0) + 1; lu.games = (lu.games || 0) + 1; lu.currentStreak = 0;
    lu.history = [{ t: Date.now(), vs: wu.username, r: "L", s: `${g.sc.p1}-${g.sc.p2}`, lp: ld }, ...(lu.history || []).slice(0, 19)];
    putUser(lu); updLB(lu);
    g.pl[mw].sock.emit("matchEnd", { result: "win", lpD: wd, sc: g.sc, opp: lu.username });
    g.pl[ml].sock.emit("matchEnd", { result: "lose", lpD: ld, sc: g.sc, opp: wu.username });
  }
  setTimeout(() => { playerGame.delete(g.pl.p1.sock.id); playerGame.delete(g.pl.p2.sock.id); playerInput.delete(g.pl.p1.sock.id); playerInput.delete(g.pl.p2.sock.id); games.delete(gid); }, 5000);
}

// ── SOCKET EVENTS ──
io.on("connection", sock => {
  console.log("+", sock.id);

  sock.on("register", ({ username, password }, cb) => {
    if (!username || !password || username.length < 3) return cb({ error: "Pseudo trop court" });
    if (getUser(username)) return cb({ error: "Pseudo déjà pris" });
    const u = { username, password, lp: 0, wins: 0, losses: 0, games: 0, avatar: "🐧", skin: "classic", arena: "glacier", flocons: 500, ownedSkins: ["classic"], ownedArenas: ["glacier"], featuredBadges: [null, null, null], kills: 0, bombsPlaced: 0, pupsCollected: 0, bestStreak: 0, currentStreak: 0, history: [] };
    putUser(u); updLB(u); cb({ user: u });
  });

  sock.on("login", ({ username, password }, cb) => { const u = getUser(username); if (!u) return cb({ error: "Compte introuvable" }); if (u.password !== password) return cb({ error: "Mot de passe incorrect" }); cb({ user: u }); });
  sock.on("getUser", ({ username }, cb) => { const u = getUser(username); if (u) { const { password, ...safe } = u; cb({ user: safe }); } else cb({ user: null }); });
  sock.on("updateUser", ({ user }, cb) => { const ex = getUser(user.username); if (ex) { const upd = { ...ex, ...user, password: ex.password }; putUser(upd); updLB(upd); cb({ user: upd }); } else cb({ error: "Not found" }); });
  sock.on("getLB", (_, cb) => cb({ lb: getLB() }));
  sock.on("getChat", (_, cb) => cb({ chat: getChat() }));
  sock.on("sendChat", ({ username, message }) => { const u = getUser(username); if (!u || !message?.trim()) return; const c = getChat(); c.push({ u: username, m: message.trim(), t: Date.now(), r: rankName(u.lp), rc: rankColor(u.lp), a: u.avatar || "🐧" }); if (c.length > 50) c.splice(0, c.length - 50); saveChat(c); io.emit("chatUpdate", { chat: c }); });
  sock.on("gameChat", ({ message }) => { const gid = playerGame.get(sock.id); if (!gid) return; const g = games.get(gid); if (!g) return; const pid = g.pl.p1.sock.id === sock.id ? "p1" : "p2"; bc(g, "gameChatMsg", { username: g.pl[pid].name, message: message?.trim(), pid }); });
  sock.on("findMatch", ({ username, lp }) => { const i = queue.findIndex(q => q.socket.id === sock.id); if (i >= 0) queue.splice(i, 1); queue.push({ socket: sock, username, lp }); sock.emit("queueUpdate", { pos: queue.length }); findMatch(); });
  sock.on("cancelQueue", () => { const i = queue.findIndex(q => q.socket.id === sock.id); if (i >= 0) queue.splice(i, 1); });
  sock.on("move", dir => { if (dir && (dir.dx !== undefined)) playerInput.set(sock.id, dir); });
  sock.on("bomb", () => {
    const gid = playerGame.get(sock.id); if (!gid) return;
    const g = games.get(gid); if (!g || g.phase !== "play") return;
    const pid = g.pl.p1.sock.id === sock.id ? "p1" : "p2";
    const e = g.ent[pid]; if (!e.alive || e.bL <= 0 || g.bombs.some(b => b.gx === e.gx && b.gy === e.gy)) return;
    e.bL--;
    g.bombs.push({ gx: e.gx, gy: e.gy, px: e.gx * CELL + CELL / 2, py: e.gy * CELL + CELL / 2, range: e.range, owner: pid, timer: Date.now() + FUSE, id: Math.random().toString(36) });
  });
  sock.on("emote", ({ key }) => { const gid = playerGame.get(sock.id); if (!gid) return; const g = games.get(gid); if (!g) return; const pid = g.pl.p1.sock.id === sock.id ? "p1" : "p2"; g.emotes.push({ pid, key, time: Date.now() }); });
  sock.on("disconnect", () => {
    console.log("-", sock.id);
    playerInput.delete(sock.id);
    const i = queue.findIndex(q => q.socket.id === sock.id); if (i >= 0) queue.splice(i, 1);
    const gid = playerGame.get(sock.id);
    if (gid) { const g = games.get(gid); if (g && g.phase !== "mEnd") { const w = g.pl.p1.sock.id === sock.id ? "p2" : "p1"; g.sc[w] = 3; endMatch(gid); } }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐧 Bomber Pengu on port ${PORT}`));
