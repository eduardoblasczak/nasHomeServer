// Agent Arena — o mundo em pixel art. Tudo que se mexe aqui vem do feed /events:
// posição = módulo que o agente está usando de verdade; luzes do nas-server =
// containers da telemetria; bandeiras = sites respondendo. Nenhum dado inventado.

const TILE = 16
const COLS = 40
const ROWS = 24
const W = COLS * TILE
const H = ROWS * TILE
import { ENGENHO, drawLive, drawPalm, paintStation } from './engenho.js'
import { SERVIDOR, createServerWorld } from './servidor.js'

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const CHAR_SCALE = 2

// Tema só troca a aparência; posições, estados e serviços continuam os mesmos dados reais.
const THEMES = {
  arcade: { id: 'arcade', name: 'Arcade', subtitle: 'agentes e serviços, ao vivo' },
  engenho: ENGENHO,
  servidor: SERVIDOR,
}
let theme = THEMES.arcade
try {
  theme = THEMES[localStorage.getItem('arena-theme')] ?? THEMES.arcade
} catch {
  // armazenamento bloqueado: fica o tema padrão
}
const historic = () => theme.id === 'engenho'
// No modo Servidor o protagonista é o nas-server: os agentes continuam no painel, mas saem do mapa.
const serverMode = () => theme.id === 'servidor'

// ============================================================ mapa

const STATIONS = {
  frontend: { name: 'Atelie Frontend', label: 'Ateliê Frontend', rect: [2, 2, 6, 4], wall: '#f4e3d7', roof: '#e0457b', kind: 'atelier' },
  backend: { name: 'Forja Backend', label: 'Forja Backend', rect: [10, 2, 6, 4], wall: '#cfc3b4', roof: '#c8641c', kind: 'forge' },
  library: { name: 'Biblioteca', label: 'Biblioteca', rect: [2, 9, 6, 4], wall: '#e6d3b0', roof: '#6b4a2b', kind: 'library' },
  terminal: { name: 'Terminal', label: 'Terminal', rect: [10, 9, 6, 4], wall: '#9aa7b5', roof: '#2b3644', kind: 'terminal' },
  git: { name: 'Correio Git', label: 'Correio Git', rect: [2, 16, 6, 4], wall: '#e9d9c4', roof: '#c0392b', kind: 'post' },
  browser: { name: 'Laboratorio', label: 'Laboratório (navegador)', sign: 'Laboratório', rect: [10, 16, 6, 4], wall: '#d6eef0', roof: '#2f8f9d', kind: 'lab' },
  portal: { name: 'Portal Web', label: 'Portal Web', rect: [17, 1, 6, 3], kind: 'portal' },
  hq: { name: 'Quartel', label: 'Quartel (seu PC)', sign: 'Quartel', rect: [16, 16, 8, 5], wall: '#d9d2c3', roof: '#3d5a80', kind: 'hq', door: 'top' },
  nas: { name: 'nas-server', label: 'nas-server', rect: [26, 1, 12, 7], kind: 'nas' },
  oracle: { name: 'VM Oracle', label: 'VM Oracle (nasFinance)', rect: [26, 12, 5, 4], kind: 'oracle' },
  cloud: { name: 'Cloudflare', label: 'Cloudflare (demo, túnel, sites)', rect: [33, 11, 6, 4], kind: 'cloud' },
}
const FIRE = { x: 20, y: 10 }
const SITE_ROW = 19

for (const station of Object.values(STATIONS)) {
  const [x, y, w, h] = station.rect
  station.access = station.door === 'top' ? { x: x + Math.floor(w / 2), y: y - 1 } : { x: x + Math.floor(w / 2), y: y + h }
}

const blocked = Array.from({ length: ROWS }, () => new Uint8Array(COLS))
for (const station of Object.values(STATIONS)) {
  const [x, y, w, h] = station.rect
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) blocked[j][i] = 1
}
blocked[FIRE.y][FIRE.x] = 1

// Semente fixa: as árvores e flores ficam no mesmo lugar a cada recarga.
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const trees = []
for (let i = 0; i < COLS; i++) {
  for (const j of [0, ROWS - 1]) if (rand() < 0.75) trees.push({ x: i, y: j })
}
for (let j = 1; j < ROWS - 1; j++) {
  for (const i of [0, COLS - 1]) if (rand() < 0.75) trees.push({ x: i, y: j })
}
for (const t of [[24, 10], [9, 7], [1, 14], [25, 18], [16, 7], [24, 4], [32, 9], [9, 21], [31, 21], [39, 12]]) trees.push({ x: t[0], y: t[1] })
for (const tree of trees) if (!isInside(tree.x, tree.y)) blocked[tree.y][tree.x] = 1

function isInside(x, y) {
  return Object.values(STATIONS).some((s) => x >= s.rect[0] && x < s.rect[0] + s.rect[2] && y >= s.rect[1] && y < s.rect[1] + s.rect[3])
}

function walkable(x, y) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked[y][x]
}

/** A* em 4 direções. O mapa tem 960 casas: lista simples basta. */
function astar(sx, sy, tx, ty) {
  if (!walkable(tx, ty)) {
    const near = nearestWalkable(tx, ty)
    tx = near.x
    ty = near.y
  }
  const key = (x, y) => y * COLS + x
  const open = [{ x: sx, y: sy, g: 0, f: 0 }]
  const came = new Map()
  const gScore = new Map([[key(sx, sy), 0]])
  const closed = new Set()
  while (open.length) {
    let best = 0
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i
    const node = open.splice(best, 1)[0]
    const k = key(node.x, node.y)
    if (node.x === tx && node.y === ty) {
      const path = [{ x: tx, y: ty }]
      let cur = k
      while (came.has(cur)) {
        cur = came.get(cur)
        path.unshift({ x: cur % COLS, y: Math.floor(cur / COLS) })
      }
      return path.slice(1)
    }
    if (closed.has(k)) continue
    closed.add(k)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = node.x + dx
      const ny = node.y + dy
      if (!walkable(nx, ny) && !(nx === sx && ny === sy)) continue
      const nk = key(nx, ny)
      const g = node.g + 1
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g)
        came.set(nk, k)
        open.push({ x: nx, y: ny, g, f: g + Math.abs(nx - tx) + Math.abs(ny - ty) })
      }
    }
  }
  return []
}

function nearestWalkable(x, y) {
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy }
  }
  return { x, y }
}

// Caminhos de terra: o trajeto real da fogueira até cada porta, pintado no chão.
const pathTiles = new Set()
for (const station of Object.values(STATIONS)) {
  for (const step of astar(FIRE.x, FIRE.y + 1, station.access.x, station.access.y)) pathTiles.add(step.y * COLS + step.x)
  pathTiles.add(station.access.y * COLS + station.access.x)
}
for (let j = FIRE.y - 1; j <= FIRE.y + 1; j++) for (let i = FIRE.x - 2; i <= FIRE.x + 2; i++) pathTiles.add(j * COLS + i)

// ============================================================ fonte 3x5 (rótulos no mundo)

const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000',
  '/': '001001010100100', '%': '101001010100101', '!': '010010010000010', '?': '110001010000010', '(': '010100100100010',
  ')': '010001001001010', '+': '000010111010000', '_': '000000000000111', '>': '100010001010100', '<': '001010100010001',
  "'": '010010000000000', '°': '010101010000000', '$': '011110010011110', '#': '101111101111101', '=': '000111000111000',
}

function plain(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

function textWidth(text) {
  return plain(text).length * 4 - 1
}

function pixelText(ctx, text, x, y, color, shadow) {
  const str = plain(text)
  if (shadow) pixelText(ctx, text, x + 1, y + 1, shadow)
  ctx.fillStyle = color
  for (let c = 0; c < str.length; c++) {
    const glyph = GLYPHS[str[c]] ?? GLYPHS['?']
    for (let i = 0; i < 15; i++) if (glyph[i] === '1') ctx.fillRect(x + c * 4 + (i % 3), y + Math.floor(i / 3), 1, 1)
  }
}

// ============================================================ sprites

const BODY = [
  '..hhhh..',
  '.hhhhhh.',
  '.ssssss.',
  '.sesses.',
  '..ssss..',
  '.cccccc.',
  'scccaccs',
  'scccaccs',
  '.cccccc.',
]
const LEGS = {
  stand: ['.pp..pp.', '.pp..pp.', '.bb..bb.'],
  walkA: ['.pp..pp.', 'pp....pp', 'bb....bb'],
  walkB: ['..pppp..', '..pp.pp.', '..bb.bb.'],
  sit: ['pppppp..', '.bb.bb..', '........'],
}
const ROLES = {
  captain: { label: 'Capitão (sessão)', pal: { h: '#e2b23a', s: '#f1c9a5', e: '#1a1a1a', c: '#2b3f6e', a: '#f2d16b', p: '#1b2238', b: '#3a2a1a' }, head: ['..hhhh..', 'hhhhhhhh'] },
  painter: { label: 'Pintora (ui-designer)', pal: { h: '#e0457b', s: '#f1c9a5', e: '#1a1a1a', c: '#f4f1ea', a: '#4aa3ff', p: '#3b4a6b', b: '#4a3426' }, head: ['.hhhh...', 'hhhhhh..'], coat: ['.cccccc.', 'scacaccs', 'sccacacs', '.cccccc.'] },
  guard: { label: 'Guardião (security-reviewer)', pal: { h: '#9fb3cc', s: '#f1c9a5', e: '#1a1a1a', c: '#2f5fb3', a: '#e8eef7', p: '#26324a', b: '#2a2a2a' }, head: ['..hhhh..', '.hhhhhh.', '.hsssshh', '.hessesh'] },
  engineer: { label: 'Engenheiro (ops)', pal: { h: '#ffb02e', s: '#e9b48c', e: '#1a1a1a', c: '#f07c1a', a: '#ffe14d', p: '#2c3e66', b: '#3a2a1a' }, head: ['..hhhh..', 'hhhhhhhh'], coat: ['.cccccc.', 'scaaaacs', 'scccaccs', '.cccccc.'] },
  scout: { label: 'Batedor (Explore)', pal: { h: '#3f9b5a', s: '#f1c9a5', e: '#1a1a1a', c: '#2f7a45', a: '#c9e36b', p: '#4a3a2a', b: '#3a2a1a' }, head: ['..hhhh..', '.hhhhhh.', 'hsssssh.', 'hsesses.'] },
  architect: { label: 'Arquiteto (Plan)', pal: { h: '#7b52c9', s: '#f1c9a5', e: '#1a1a1a', c: '#5b3aa0', a: '#f2d16b', p: '#2a2240', b: '#2a2a2a' }, head: ['...hh...', '.hhhhhh.'] },
  robot: { label: 'Robô (general-purpose)', pal: { h: '#9aa4b1', s: '#c7cfd9', e: '#3be0ff', c: '#7d8794', a: '#3be0ff', p: '#5b6470', b: '#3b424c' }, head: ['...a....', '.hhhhhh.'] },
}
const OUTLINE = '#141820'

const spriteCache = new Map()

function roleDef(role) {
  return theme.roles?.[role] ?? ROLES[role] ?? ROLES.robot
}

function spriteRows(role, legs) {
  const def = roleDef(role)
  const rows = [...BODY]
  def.head.forEach((row, i) => (rows[i] = row))
  if (def.coat) def.coat.forEach((row, i) => (rows[5 + i] = row))
  return [...rows, ...LEGS[legs]]
}

/** Sprite 8x12 com contorno de 1 px, pré-desenhado uma vez por papel e pose. */
function sprite(role, legs, flip) {
  const id = `${theme.id}:${role}:${legs}:${flip}`
  if (spriteCache.has(id)) return spriteCache.get(id)
  const rows = spriteRows(role, legs)
  const pal = roleDef(role).pal
  const canvas = document.createElement('canvas')
  canvas.width = 10
  canvas.height = 14
  const ctx = canvas.getContext('2d')
  const filled = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < 8 && rows[y][flip ? 7 - x : x] !== '.'
  for (let y = -1; y <= rows.length; y++) {
    for (let x = -1; x <= 8; x++) {
      if (filled(x, y)) {
        ctx.fillStyle = pal[rows[y][flip ? 7 - x : x]] ?? '#ff00ff'
        ctx.fillRect(x + 1, y + 1, 1, 1)
      } else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        ctx.fillStyle = OUTLINE
        ctx.fillRect(x + 1, y + 1, 1, 1)
      }
    }
  }
  spriteCache.set(id, canvas)
  return canvas
}

function avatarUrl(role) {
  const src = sprite(role, 'stand', false)
  const canvas = document.createElement('canvas')
  canvas.width = 30
  canvas.height = 42
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, 30, 42)
  return canvas.toDataURL()
}

// ============================================================ estado vindo do servidor

let snapshot = null
let firstSnapshot = true
const actors = new Map()
const effects = []
const flights = []
const log = []
let followId = null
let lastTelemetryAt = null
const containerState = new Map()
const siteState = new Map()

const TOOL_KIND = (tool, station) => {
  if (!tool) return 'think'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return 'read'
  if (tool === 'Agent') return 'spawn'
  if (tool === 'SendMessage') return 'mail'
  if (tool === 'AskUserQuestion') return 'ask'
  if (tool.startsWith('mcp__Claude_Browser') || tool.startsWith('mcp__claude-in-chrome')) return 'browse'
  if (tool === 'WebSearch' || tool === 'WebFetch') return 'web'
  if (station === 'git') return 'git'
  if (station === 'cloud') return 'deploy'
  if (station === 'nas' || station === 'oracle') return 'ops'
  return 'type'
}

class Actor {
  constructor(data, spawnAt) {
    this.id = data.id
    this.data = data
    this.x = spawnAt.x * TILE + 8
    this.y = spawnAt.y * TILE + 12
    this.path = []
    this.flip = false
    this.goal = null
    this.t = Math.random() * 10
    this.walking = false
    this.alpha = 1
    this.leaving = false
    this.emote = null
    this.nextFx = 0
  }

  get tile() {
    return { x: Math.floor(this.x / TILE), y: Math.floor((this.y - 4) / TILE) }
  }

  setGoal(goal) {
    if (this.goal && goal.x === this.goal.x && goal.y === this.goal.y) return
    this.goal = goal
    const from = this.tile
    this.path = astar(from.x, from.y, goal.x, goal.y)
  }

  update(dt) {
    this.t += dt
    if (this.emote && (this.emote.until -= dt) <= 0) this.emote = null
    this.walking = false
    if (this.path.length) {
      const next = this.path[0]
      const tx = next.x * TILE + 8
      const ty = next.y * TILE + 12
      const dx = tx - this.x
      const dy = ty - this.y
      const dist = Math.hypot(dx, dy)
      const speed = 62 * dt
      if (dist <= speed) {
        this.x = tx
        this.y = ty
        this.path.shift()
      } else {
        this.x += (dx / dist) * speed
        this.y += (dy / dist) * speed
        if (Math.abs(dx) > 0.5) this.flip = dx < 0
      }
      this.walking = true
    }
    if (this.leaving && !this.path.length) this.alpha -= dt * 1.5
  }
}

function hash(text) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

const FIRE_SPOTS = [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-3, 1], [3, 1], [-3, -1], [3, -1]]

function goalFor(actor, index) {
  const d = actor.data
  if (d.state === 'done') return STATIONS.hq.access
  // No engenho o senhor não vai aos postos de trabalho: dá as ordens da varanda da casa-grande.
  if (historic() && d.role === 'captain') {
    const VERANDA = [-3, 3, -5, 5, -1, 1]
    const spot = { x: STATIONS.nas.access.x + VERANDA[index % VERANDA.length], y: STATIONS.nas.access.y }
    return walkable(spot.x, spot.y) ? spot : nearestWalkable(spot.x, spot.y)
  }
  if (d.state === 'idle') {
    const [dx, dy] = FIRE_SPOTS[index % FIRE_SPOTS.length]
    return { x: FIRE.x + dx, y: FIRE.y + dy }
  }
  const station = STATIONS[d.station] ?? STATIONS.hq
  let base = station.access
  if (d.station === 'nas' && d.target) {
    const slot = containerSlot(d.target)
    if (slot) base = { x: Math.floor((slot.x + slot.w / 2) / TILE), y: station.access.y }
  }
  if (d.station === 'cloud' && d.target) base = station.access
  const spots = [[0, 0], [-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [-2, 0], [2, 0]]
  const [dx, dy] = spots[index % spots.length]
  const spot = { x: base.x + dx, y: base.y + dy }
  return walkable(spot.x, spot.y) ? spot : nearestWalkable(spot.x, spot.y)
}

function addLog(text, tone) {
  log.unshift({ at: new Date(), text, tone })
  log.length = Math.min(log.length, 60)
  renderLog()
}

function applySnapshot(next) {
  const seen = new Set()
  const byStation = new Map()
  for (const data of next.agents) {
    seen.add(data.id)
    let actor = actors.get(data.id)
    // Quem já terminou e saiu de cena não volta a cada atualização.
    if (!actor && data.state === 'done') continue
    if (!actor) {
      const start = firstSnapshot ? goalFor({ data }, hash(data.id)) : STATIONS.hq.access
      actor = new Actor(data, start)
      actors.set(data.id, actor)
      if (!firstSnapshot && data.state !== 'done') {
        if (!serverMode()) burst(actor.x, actor.y - 6, ['#ffffff', '#cfe3ff', '#ffe08a'], 16)
        addLog(`${who(data)} entrou em cena`, 'good')
        const parent = data.parent && actors.get(data.parent)
        if (parent) {
          parent.emote = { text: '!', until: 1.6 }
          flights.push({ kind: 'beam', from: parent, to: actor, t: 0, dur: 0.9 })
        }
      }
    } else {
      const prev = actor.data
      if (!firstSnapshot) {
        if (prev.toolId !== data.toolId && data.tool && data.state !== 'idle' && data.state !== 'done') addLog(`${who(data)}: ${data.label}`)
        if (prev.state !== data.state) {
          if (data.state === 'done') addLog(`${who(data)} terminou`, 'good')
          if (data.state === 'waiting') addLog(`${who(data)} espera a sua resposta`, 'bad')
          if (data.state === 'idle' && prev.state !== 'done') addLog(`${who(data)} foi descansar`)
        }
        if (data.send && data.send.id !== prev.send?.id) sendMail(actor, data.send.to)
      }
      actor.data = data
    }
    if (data.state === 'done' && !actor.leaving) actor.leaving = true
  }
  // Ordem estável por estação: cada um ganha um lugar próprio na fila.
  for (const actor of [...actors.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!seen.has(actor.id)) {
      actor.leaving = true
      actor.data = { ...actor.data, state: 'done' }
    }
    const key = historic() && actor.data.role === 'captain' ? 'senhor' : actor.data.state === 'idle' ? 'fire' : `${actor.data.station}:${actor.data.target ?? ''}`
    const index = byStation.get(key) ?? (key === 'fire' ? hash(actor.id) % 4 : 0)
    byStation.set(key, index + 1)
    actor.setGoal(goalFor(actor, index))
    if (firstSnapshot && !actor.leaving) {
      actor.x = actor.goal.x * TILE + 8
      actor.y = actor.goal.y * TILE + 12
      actor.path = []
    }
  }
  applyServices(next.services)
  snapshot = next
  firstSnapshot = false
  renderAgents()
}

function who(data) {
  return data.kind === 'session' ? data.name : `${roleDef(data.role).label.split(' (')[0]} · ${data.name}`
}

function sendMail(from, to) {
  const target = [...actors.values()].find((a) => a !== from && (a.id === to || to.includes(a.id) || a.data.name.toLowerCase() === to.toLowerCase()))
  flights.push({ kind: 'mail', from, to: target ?? { x: STATIONS.hq.access.x * TILE + 8, y: STATIONS.hq.access.y * TILE + 8 }, t: 0, dur: 1.4 })
  addLog(`${who(from.data)} mandou mensagem${target ? ` para ${who(target.data)}` : ''}`)
}

function applyServices(services) {
  world.setServices(services)
  const tel = services.telemetry
  if (services.telemetryAt && services.telemetryAt !== lastTelemetryAt) {
    if (lastTelemetryAt) {
      const hq = { x: STATIONS.hq.access.x * TILE + 8, y: STATIONS.hq.rect[1] * TILE + 4 }
      const nas = { x: STATIONS.nas.access.x * TILE + 8, y: STATIONS.nas.access.y * TILE }
      flights.push({ kind: 'drone', from: hq, to: nas, back: true, ok: services.telemetryOk, t: 0, dur: 2.2 })
    }
    lastTelemetryAt = services.telemetryAt
  }
  if (tel) {
    for (const c of tel.containers) {
      const before = containerState.get(c.name)
      if (before !== undefined && before !== c.up) {
        addLog(`container ${c.name} ${c.up ? 'voltou' : 'caiu'}`, c.up ? 'good' : 'bad')
        const slot = containerSlot(c.name)
        if (slot && !serverMode()) burst(slot.x + slot.w / 2, slot.y + slot.h / 2, c.up ? ['#3ddc84'] : ['#ff5c6c', '#ffb02e'], 24)
      }
      containerState.set(c.name, c.up)
    }
  }
  for (const site of Object.values(services.sites ?? {})) {
    const before = siteState.get(site.id)
    if (before && before.at !== site.at) pings.push({ id: site.id, t: 0 })
    if (before && before.ok !== site.ok && site.ok !== null) addLog(`${site.name} ${site.ok ? 'respondeu' : 'não responde'}`, site.ok ? 'good' : 'bad')
    siteState.set(site.id, site)
  }
  renderServices(services)
}

const pings = []

// ============================================================ módulos do nas-server

function nasLayout() {
  const [x, y] = STATIONS.nas.rect
  return { x: x * TILE, y: y * TILE }
}

function containerSlot(name) {
  const tel = snapshot?.services?.telemetry
  if (!tel) return null
  const index = tel.containers.findIndex((c) => c.name === name || c.name.startsWith(name) || name.startsWith(c.name.split('-')[0]))
  if (index < 0) return null
  return slotRect(index)
}

function slotRect(index) {
  const { x, y } = nasLayout()
  const col = index % 4
  const row = Math.floor(index / 4)
  return { x: x + 8 + col * 30, y: y + 20 + row * 21, w: 27, h: 18 }
}

function abbr(name) {
  const known = { adguardhome: 'ADG', 'ai-memory': 'MEM', cadvisor: 'CAD', cloudflared: 'CFD', 'draft-app': 'DRA', 'draft-web': 'DRW', grafana: 'GRF', 'nasfinance-app': 'NFI', 'nextcloud-app': 'NXC', 'node-exporter': 'NEX', portainer: 'PTN', 'portfolio-telemetry': 'TEL', 'portfolio-web': 'WEB', prometheus: 'PRM', 'voalberto-site': 'VOA' }
  return known[name] ?? name.replace(/[^a-z]/gi, '').slice(0, 3)
}

// ============================================================ efeitos

function burst(x, y, colors, n) {
  if (REDUCED) n = Math.min(n, 4)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 20 + Math.random() * 40
    effects.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.6 + Math.random() * 0.5, age: 0, color: colors[i % colors.length], size: 1 + (Math.random() < 0.3 ? 1 : 0), g: 60 })
  }
}

function glyph(x, y, text, color) {
  effects.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: -14, life: 1.1, age: 0, text, color, g: 0 })
}

/** O que cada tipo de trabalho solta no ar, perto do módulo. */
function workFx(actor, kind) {
  const hx = actor.x + (actor.flip ? -6 : 6)
  const hy = actor.y - 8
  switch (kind) {
    case 'edit':
      burst(hx, hy, ['#ffe14d', '#ffffff', '#ffb02e'], 5)
      break
    case 'read':
      glyph(hx, hy - 6, Math.random() < 0.5 ? '?' : '.', '#cfe3ff')
      break
    case 'type':
      glyph(actor.x, actor.y - 20, Math.random() < 0.5 ? '>_' : '$', '#9ff0c4')
      break
    case 'git': {
      const box = STATIONS.git
      flights.push({ kind: 'letter', from: { x: actor.x, y: actor.y - 10 }, to: { x: (box.rect[0] + 1) * TILE, y: (box.rect[1] + 1) * TILE }, t: 0, dur: 0.9 })
      break
    }
    case 'deploy':
      effects.push({ x: actor.x + (Math.random() - 0.5) * 10, y: actor.y - 14, vx: 0, vy: -22, life: 1.4, age: 0, color: '#ffffff', size: 3, g: 0, puff: true })
      break
    case 'ops': {
      const slot = actor.data.target ? containerSlot(actor.data.target) : null
      const to = slot ? { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 } : { x: STATIONS[actor.data.station].access.x * TILE + 8, y: STATIONS[actor.data.station].rect[1] * TILE + 30 }
      flights.push({ kind: 'packet', from: { x: actor.x, y: actor.y - 10 }, to, t: 0, dur: 0.7 })
      break
    }
    case 'browse':
    case 'web':
      burst(hx, hy - 4, ['#6cb6ff', '#b9d6ff', '#ffffff'], 3)
      break
    case 'spawn':
      burst(actor.x, actor.y - 18, ['#ffe08a', '#ffffff'], 4)
      break
    default:
      break
  }
}

// ============================================================ fundo pré-desenhado

const bg = document.createElement('canvas')
bg.width = W
bg.height = H

const ARCADE_GROUND = { grass: ['#3f8a3d', '#43903f'], grassDots: ['#377a35', '#4fa04a'], path: '#b58b56', pathDots: ['#a27a48', '#c69a63'], pathEdge: '#8f6b3e', plaza: ['#7d7466', '#958b7b'], flowers: ['#ffe14d', '#ff8fb1', '#ffffff', '#b9d6ff'] }

function paintBackground() {
  const ctx = bg.getContext('2d')
  if (serverMode()) {
    seed = 99
    world.paintBackground(ctx, rand)
    return
  }
  const G = theme.ground ?? ARCADE_GROUND
  seed = 99
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const x = i * TILE
      const y = j * TILE
      const onPath = pathTiles.has(j * COLS + i)
      ctx.fillStyle = onPath ? G.path : (i + j) % 2 ? G.grass[0] : G.grass[1]
      ctx.fillRect(x, y, TILE, TILE)
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = onPath ? (rand() < 0.5 ? G.pathDots[0] : G.pathDots[1]) : rand() < 0.5 ? G.grassDots[0] : G.grassDots[1]
        ctx.fillRect(x + Math.floor(rand() * 15), y + Math.floor(rand() * 15), 1, onPath ? 1 : 2)
      }
      if (!onPath && rand() < 0.05) {
        ctx.fillStyle = G.flowers[Math.floor(rand() * G.flowers.length)]
        const fx = x + 3 + Math.floor(rand() * 10)
        const fy = y + 3 + Math.floor(rand() * 10)
        ctx.fillRect(fx, fy, 1, 1)
        ctx.fillRect(fx - 1, fy + 1, 1, 1)
        ctx.fillRect(fx + 1, fy + 1, 1, 1)
      }
    }
  }
  // borda suave dos caminhos
  for (const k of pathTiles) {
    const i = k % COLS
    const j = Math.floor(k / COLS)
    ctx.fillStyle = G.pathEdge
    if (!pathTiles.has(k - COLS)) ctx.fillRect(i * TILE, j * TILE, TILE, 1)
    if (!pathTiles.has(k + COLS)) ctx.fillRect(i * TILE, j * TILE + 15, TILE, 1)
  }
  // praça da fogueira
  ctx.fillStyle = G.plaza[0]
  ctx.beginPath()
  ctx.ellipse(FIRE.x * TILE + 8, FIRE.y * TILE + 10, 30, 17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = G.plaza[1]
  ctx.beginPath()
  ctx.ellipse(FIRE.x * TILE + 8, FIRE.y * TILE + 9, 28, 15, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const tree of trees) (historic() ? drawPalm : drawTree)(ctx, tree.x * TILE, tree.y * TILE)
  for (const [key, station] of Object.entries(STATIONS)) {
    if (historic() && paintStation(ctx, key, station.rect, TILE)) continue
    drawBuilding(ctx, station)
  }
  // poste das sondas dos sites
}

function drawTree(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(x + 8, y + 14, 7, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6b4a2b'
  ctx.fillRect(x + 7, y + 9, 3, 6)
  ctx.fillStyle = '#1f5a2a'
  ctx.beginPath()
  ctx.arc(x + 8, y + 7, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2d7a37'
  ctx.beginPath()
  ctx.arc(x + 7, y + 6, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3f9b47'
  ctx.fillRect(x + 4, y + 3, 3, 2)
}

function drawBuilding(ctx, station) {
  const [tx, ty, tw, th] = station.rect
  const x = tx * TILE
  const y = ty * TILE
  const w = tw * TILE
  const h = th * TILE
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(x + 3, y + 4, w, h)
  if (station.kind === 'portal' || station.kind === 'cloud' || station.kind === 'nas' || station.kind === 'oracle') return
  // parede
  ctx.fillStyle = station.wall
  ctx.fillRect(x, y + 14, w, h - 14)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let i = 0; i < w; i += 8) ctx.fillRect(x + i, y + 14, 1, h - 14)
  // telhado
  ctx.fillStyle = station.roof
  ctx.fillRect(x - 2, y, w + 4, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(x - 2, y, w + 4, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  for (let i = 4; i < 16; i += 4) ctx.fillRect(x - 2, y + i, w + 4, 1)
  // porta
  const doorX = (station.access.x - tx) * TILE + x + 4
  if (station.door === 'top') {
    ctx.fillStyle = '#4a3426'
    ctx.fillRect(doorX, y + 14, 8, 6)
  } else {
    ctx.fillStyle = '#4a3426'
    ctx.fillRect(doorX, y + h - 11, 8, 11)
    ctx.fillStyle = '#e2b23a'
    ctx.fillRect(doorX + 6, y + h - 6, 1, 1)
  }
  // janelas
  ctx.fillStyle = '#26323f'
  ctx.fillRect(x + 6, y + 22, 10, 8)
  ctx.fillRect(x + w - 16, y + 22, 10, 8)
  // A placa com o nome é desenhada na camada de texto (drawLabels), nítida em qualquer zoom.
}

// ============================================================ quadro a quadro

const canvas = document.getElementById('world')
const ctx = canvas.getContext('2d')
let scale = 2
let offsetX = 0
let offsetY = 0
let mouse = null

function resize() {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  scale = Math.min(canvas.width / W, canvas.height / H)
  offsetX = Math.floor((canvas.width - W * scale) / 2)
  offsetY = Math.floor((canvas.height - H * scale) / 2)
}
new ResizeObserver(resize).observe(canvas)

let time = 0
let last = performance.now()

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  time += dt
  update(dt)
  draw()
  requestAnimationFrame(frame)
}

function update(dt) {
  if (serverMode()) {
    // Os agentes seguem atualizando para o painel, mas não soltam efeitos no mapa do servidor.
    flights.length = 0
    world.update(dt, time)
  }
  for (const actor of actors.values()) {
    actor.update(dt)
    if (actor.alpha <= 0) {
      actors.delete(actor.id)
      renderAgents()
      continue
    }
    const d = actor.data
    if (serverMode()) continue
    const working = (d.state === 'tool' || d.state === 'thinking') && !actor.walking
    if (working && d.state === 'tool' && time > actor.nextFx) {
      workFx(actor, TOOL_KIND(d.tool, d.station))
      actor.nextFx = time + (REDUCED ? 3 : 0.6 + Math.random() * 0.7)
    }
    if (d.state === 'idle' && !actor.walking && time > actor.nextFx && Date.now() - d.lastAt > 5 * 60_000) {
      glyph(actor.x + 4, actor.y - 16, 'z', '#cfe3ff')
      actor.nextFx = time + 1.6
    }
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]
    e.age += dt
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.vy += (e.g ?? 0) * dt
    if (e.age >= e.life) effects.splice(i, 1)
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i]
    f.t += dt
    if (f.t >= f.dur) {
      if (f.back) {
        flights[i] = { ...f, from: f.to, to: f.from, back: false, t: 0 }
        burst(f.to.x, f.to.y, f.ok === false ? ['#ff5c6c'] : ['#3ddc84', '#ffffff'], 6)
      } else {
        if (f.kind === 'mail' || f.kind === 'letter' || f.kind === 'packet') burst(pos(f.to).x, pos(f.to).y - (f.kind === 'mail' ? 10 : 0), ['#ffffff', '#ffe08a'], 6)
        flights.splice(i, 1)
      }
    }
  }
  for (let i = pings.length - 1; i >= 0; i--) if ((pings[i].t += dt) > 1.2) pings.splice(i, 1)
}

function pos(p) {
  return { x: p.x, y: p.y }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)
  ctx.drawImage(bg, 0, 0)
  labels.length = 0
  if (serverMode()) {
    world.draw(ctx, time)
    drawEffects()
    world.drawLights(ctx, drawNight())
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    drawLabels()
    drawHover()
    return
  }
  for (const [key, station] of Object.entries(STATIONS)) {
    const [tx, ty, tw] = station.rect
    if (historic()) label(theme.stations[key].sign, (tx + tw / 2) * TILE, ty * TILE + (key === 'nas' ? 1 : 4), 'sign')
    else if (station.wall) label(station.sign ?? station.label, (tx + tw / 2) * TILE, ty * TILE + 7, 'sign')
  }

  if (historic()) {
    const busy = new Set([...actors.values()].filter((a) => a.data.state === 'tool' && !a.walking).map((a) => a.data.station))
    drawLive(ctx, {
      TILE, time, REDUCED, busy, stations: STATIONS,
      containers: snapshot?.services?.telemetry?.containers ?? [],
      siteOk: (id) => siteState.get(id)?.ok,
      puff: (x, y) => effects.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: -14, life: 1.8, age: 0, color: '#b9b0a2', size: 3, g: 0, puff: true }),
    })
    drawFire()
  } else {
    drawPortal()
    drawFire()
    drawNas()
    drawOracle()
    drawCloud()
    drawActiveModules()
  }
  drawSites()

  const sorted = [...actors.values()].sort((a, b) => a.y - b.y)
  for (const actor of sorted) drawActor(actor)
  drawEffects()
  drawFlights()
  drawNight()

  // camada de texto em resolução de tela: fica nítida em qualquer escala
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawLabels()
  if (bubbles.checked) for (const actor of sorted) drawBubble(actor)
  drawHover(sorted)
}

function drawPortal() {
  const [tx, ty, tw] = STATIONS.portal.rect
  const cx = (tx + tw / 2) * TILE
  const cy = ty * TILE + 24
  ctx.fillStyle = '#5b6470'
  ctx.fillRect(cx - 26, cy - 22, 6, 30)
  ctx.fillRect(cx + 20, cy - 22, 6, 30)
  ctx.fillRect(cx - 26, cy - 24, 52, 6)
  ctx.fillStyle = '#8b96a5'
  ctx.fillRect(cx - 26, cy - 24, 52, 2)
  const spin = REDUCED ? 0 : time * 2
  for (let r = 18; r > 2; r -= 3) {
    ctx.fillStyle = r % 2 ? '#2f6fd6' : '#6cb6ff'
    ctx.beginPath()
    ctx.ellipse(cx, cy - 6, r, r * 0.75, spin + r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#e8f3ff'
  ctx.fillRect(cx - 1, cy - 7, 2, 2)
  label('Portal Web', cx, ty * TILE + 1, 'sign')
}

function drawFire() {
  const x = FIRE.x * TILE + 8
  const y = FIRE.y * TILE + 10
  ctx.fillStyle = '#5a4030'
  ctx.fillRect(x - 7, y + 1, 14, 3)
  ctx.fillStyle = '#7a5a40'
  ctx.fillRect(x - 6, y - 1, 12, 2)
  const f = REDUCED ? 0 : Math.sin(time * 12) * 1.5
  ctx.fillStyle = '#ff5a1f'
  ctx.fillRect(x - 4, y - 6 - f, 8, 7 + f)
  ctx.fillStyle = '#ffb02e'
  ctx.fillRect(x - 3, y - 9 + f, 6, 8)
  ctx.fillStyle = '#ffe98a'
  ctx.fillRect(x - 1, y - 7, 2, 5)
  if (!REDUCED && Math.random() < 0.2) effects.push({ x: x + (Math.random() - 0.5) * 6, y: y - 10, vx: (Math.random() - 0.5) * 6, vy: -18, life: 0.8, age: 0, color: '#ffb02e', size: 1, g: 0 })
}

function drawNas() {
  const { x, y } = nasLayout()
  const w = STATIONS.nas.rect[2] * TILE
  const h = STATIONS.nas.rect[3] * TILE
  const services = snapshot?.services
  const tel = services?.telemetry
  const online = services?.telemetryOk !== false && !!tel
  // corpo do datacenter
  ctx.fillStyle = '#2b3442'
  ctx.fillRect(x, y + 6, w, h - 6)
  ctx.fillStyle = '#3a4556'
  ctx.fillRect(x, y + 6, w, 4)
  ctx.fillStyle = '#1b222c'
  ctx.fillRect(x + 4, y + 14, 120, h - 22)
  label(online ? `${tel.host} · online` : 'nas-server · sem sinal', x + w / 2, y + 1, online ? 'signOk' : 'signBad')
  // containers
  const containers = tel?.containers ?? []
  containers.slice(0, 16).forEach((c, i) => {
    const s = slotRect(i)
    const busy = [...actors.values()].some((a) => a.data.station === 'nas' && a.data.target && containerSlot(a.data.target)?.x === s.x && containerSlot(a.data.target)?.y === s.y && a.data.state === 'tool')
    ctx.fillStyle = busy ? '#3a4f6a' : '#273140'
    ctx.fillRect(s.x, s.y, s.w, s.h)
    ctx.fillStyle = '#11161d'
    ctx.fillRect(s.x + 2, s.y + 11, s.w - 4, 1)
    ctx.fillRect(s.x + 2, s.y + 14, s.w - 4, 1)
    const blink = REDUCED ? true : (Math.sin(time * (busy ? 18 : 4) + i * 1.7) > -0.2)
    ctx.fillStyle = !online ? '#5d6b80' : c.up ? (blink ? '#3ddc84' : '#1f6b44') : Math.sin(time * 8) > 0 ? '#ff5c6c' : '#5c1f27'
    ctx.fillRect(s.x + s.w - 5, s.y + 3, 3, 3)
    label(abbr(c.name), s.x + 10, s.y + 6, c.up ? 'tiny' : 'tinyBad')
  })
  // painel de métricas
  const px = x + 130
  const py = y + 14
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(px, py, 56, 52)
  const bars = [['CPU', tel?.cpu ?? 0, 100], ['RAM', tel?.ram ?? 0, 100], ['TMP', tel?.temp ?? 0, 90]]
  bars.forEach(([name, value, max], i) => {
    const by = py + 4 + i * 9
    label(name, px + 8, by + 2.5, 'micro')
    ctx.fillStyle = '#1c2430'
    ctx.fillRect(px + 17, by, 35, 5)
    const ratio = Math.max(0, Math.min(1, value / max))
    ctx.fillStyle = ratio > 0.85 ? '#ff5c6c' : ratio > 0.65 ? '#ffcc4d' : '#3ddc84'
    ctx.fillRect(px + 17, by, Math.round(35 * ratio), 5)
  })
  const hist = tel?.history?.temp ?? []
  if (hist.length > 1) {
    const min = Math.min(...hist) - 1
    const max = Math.max(...hist) + 1
    ctx.fillStyle = '#6cb6ff'
    hist.forEach((v, i) => {
      const hx = px + 3 + Math.round((i / (hist.length - 1)) * 49)
      const hy = py + 47 - Math.round(((v - min) / (max - min)) * 14)
      ctx.fillRect(hx, hy, 1, 1)
    })
  }
  // ventoinha
  const fx = x + 158
  const fy = y + 88
  ctx.fillStyle = '#1b222c'
  ctx.beginPath()
  ctx.arc(fx, fy, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#93a1b5'
  ctx.lineWidth = 2
  const speed = online ? 4 + (tel?.cpu ?? 0) / 8 : 0
  for (let k = 0; k < 3; k++) {
    const a = (REDUCED ? 0 : time * speed) + (k * Math.PI * 2) / 3
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx + Math.cos(a) * 8, fy + Math.sin(a) * 8)
    ctx.stroke()
  }
  if ((tel?.temp ?? 0) > 70 && !REDUCED && Math.random() < 0.15) effects.push({ x: fx, y: y + 4, vx: 0, vy: -10, life: 1.6, age: 0, color: '#9aa4b1', size: 3, g: 0, puff: true })
  // porta
  ctx.fillStyle = '#11161d'
  ctx.fillRect(STATIONS.nas.access.x * TILE + 2, y + h - 12, 12, 12)
}

function drawOracle() {
  const [tx, ty, tw, th] = STATIONS.oracle.rect
  const x = tx * TILE
  const y = ty * TILE
  const w = tw * TILE
  const h = th * TILE
  const ok = siteState.get('financas')?.ok
  ctx.fillStyle = '#c74634'
  ctx.fillRect(x, y + 6, w, h - 6)
  ctx.fillStyle = '#e0614e'
  ctx.fillRect(x, y + 6, w, 3)
  ctx.fillStyle = '#2b1612'
  ctx.fillRect(x + 6, y + 14, w - 12, h - 26)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#3a2420'
    ctx.fillRect(x + 9, y + 17 + i * 6, w - 18, 4)
    const lit = REDUCED || Math.sin(time * 5 + i) > 0
    ctx.fillStyle = ok === false ? '#ff5c6c' : lit ? '#3ddc84' : '#1f6b44'
    ctx.fillRect(x + w - 14, y + 18 + i * 6, 2, 2)
  }
  label('VM Oracle', x + w / 2, y + 1, 'sign')
  ctx.fillStyle = '#2b1612'
  ctx.fillRect(STATIONS.oracle.access.x * TILE + 3, y + h - 10, 10, 10)
}

function drawCloud() {
  const [tx, ty, tw] = STATIONS.cloud.rect
  const bob = REDUCED ? 0 : Math.sin(time * 1.5) * 2
  const x = tx * TILE
  const y = ty * TILE + bob
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(x + tw * 8, ty * TILE + 58, 40, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f48120'
  for (const [cx, cy, r] of [[20, 30, 14], [42, 22, 18], [66, 30, 15], [44, 36, 16]]) {
    ctx.beginPath()
    ctx.arc(x + cx, y + cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#faad3f'
  for (const [cx, cy, r] of [[22, 27, 9], [42, 18, 12], [64, 27, 9]]) {
    ctx.beginPath()
    ctx.arc(x + cx, y + cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  label('Cloudflare', x + 44, y + 29, 'cloud')
  const demo = siteState.get('demo')
  ctx.fillStyle = demo?.ok === false ? '#ff5c6c' : '#3ddc84'
  ctx.fillRect(x + 38, y + 40, 4, 4)
  label('demo', x + 52, y + 42, 'cloudSmall')
}

function drawSites() {
  const sites = [...siteState.values()]
  sites.forEach((site, i) => {
    const x = (26 + i * 2) * TILE + 6
    const y = SITE_ROW * TILE
    ctx.fillStyle = '#5b4632'
    ctx.fillRect(x, y, 2, 14)
    const wave = REDUCED ? 0 : Math.round(Math.sin(time * 4 + i) * 1)
    ctx.fillStyle = site.ok === null ? '#6b7689' : site.ok ? '#3ddc84' : '#ff5c6c'
    ctx.fillRect(x + 2, y + wave, 8, 5)
    ctx.fillRect(x + 2, y + 5 + wave, 5, 1)
    label(abbrSite(site.id), x + 5, y + 19, 'tiny')
    if (i === 0) label('Sites', 26 * TILE + 6, SITE_ROW * TILE - 6, 'signSmall')
    const ping = pings.find((p) => p.id === site.id)
    if (ping && !REDUCED) {
      ctx.strokeStyle = `rgba(108,182,255,${1 - ping.t / 1.2})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x + 5, y + 2, 4 + ping.t * 14, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
}

function abbrSite(id) {
  return { demo: 'DMO', financas: 'FIN', uptime: 'UPT', portfolio: 'EBL', draft: 'DRF', voalberto: 'VOA', github: 'GIT' }[id] ?? id.slice(0, 3)
}

/** Módulo em uso brilha e se anima do seu jeito. */
function drawActiveModules() {
  const busy = new Map()
  for (const actor of actors.values()) {
    if (actor.data.state === 'tool' && !actor.walking) busy.set(actor.data.station, TOOL_KIND(actor.data.tool, actor.data.station))
  }
  for (const [key, kind] of busy) {
    const station = STATIONS[key]
    if (!station || ['nas', 'cloud', 'oracle', 'portal'].includes(key)) continue
    const [tx, ty, tw] = station.rect
    const x = tx * TILE
    const y = ty * TILE
    const glow = REDUCED ? 0.6 : 0.5 + Math.sin(time * 6) * 0.3
    ctx.fillStyle = `rgba(255, 225, 120, ${glow})`
    ctx.fillRect(x + 6, y + 22, 10, 8)
    ctx.fillRect(x + tw * TILE - 16, y + 22, 10, 8)
    if (station.kind === 'forge' && !REDUCED && Math.random() < 0.4) effects.push({ x: x + tw * TILE - 10, y: y - 2, vx: 0, vy: -16, life: 1.2, age: 0, color: '#9aa4b1', size: 2, g: 0, puff: true })
    if (station.kind === 'library' && !REDUCED && Math.random() < 0.05) glyph(x + 20 + Math.random() * 50, y + 18, '#', '#f6e7c8')
    if (station.kind === 'terminal') {
      ctx.fillStyle = '#3ddc84'
      if (Math.sin(time * 10) > 0) ctx.fillRect(x + 8, y + 27, 3, 1)
    }
    void kind
  }
}

function drawActor(actor) {
  const d = actor.data
  ctx.globalAlpha = Math.max(0, actor.alpha)
  const sitting = d.state === 'idle' && !actor.walking
  const legs = actor.walking ? (Math.floor(actor.t * 8) % 2 ? 'walkA' : 'walkB') : sitting ? 'sit' : 'stand'
  const bob = actor.walking ? Math.abs(Math.sin(actor.t * 16)) * 1 : d.state === 'tool' && !REDUCED ? Math.round(Math.sin(actor.t * 10)) * 0.5 : 0
  // Quem está na fogueira olha para ela.
  let flip = actor.flip
  if (sitting) flip = actor.x > FIRE.x * TILE + 8
  else if (!actor.walking && d.state === 'tool') flip = false
  const img = sprite(d.role, legs, flip)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(actor.x, actor.y, 9, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  if (followId === actor.id) {
    ctx.strokeStyle = '#ffe14d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(actor.x, actor.y, 13, 5, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Personagem em escala 2 sobre o mapa de 16 px: proporção de jogo "chibi" e
  // legível mesmo com o mapa inteiro na tela.
  ctx.save()
  ctx.translate(Math.round(actor.x), Math.round(actor.y))
  ctx.scale(CHAR_SCALE, CHAR_SCALE)
  const x = -5
  const y = Math.round(-14 - bob + (sitting ? 2 : 0))
  ctx.drawImage(img, x, y)
  drawHeldItem(actor, x, y, flip)
  if (actor.emote) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(-3, y - 10, 7, 8)
    pixelText(ctx, actor.emote.text, -1, y - 8, '#e0457b')
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/** O objeto na mão diz o que ele está fazendo, mesmo sem balão. */
function drawHeldItem(actor, x, y, flip) {
  const d = actor.data
  if (d.state !== 'tool' || actor.walking) return
  const kind = TOOL_KIND(d.tool, d.station)
  const hx = flip ? x - 2 : x + 9
  const hy = y + 7
  const swing = REDUCED ? 0 : Math.round(Math.sin(actor.t * 12) * 2)
  if (kind === 'edit') {
    ctx.fillStyle = d.role === 'painter' ? '#e0457b' : '#9aa4b1'
    ctx.fillRect(hx, hy - 4 + swing, 3, 3)
    ctx.fillStyle = '#6b4a2b'
    ctx.fillRect(hx + 1, hy - 1 + swing, 1, 4)
  } else if (kind === 'read') {
    ctx.strokeStyle = '#cfe3ff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(hx + 1.5, hy - 2 + swing / 2, 2.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#6b4a2b'
    ctx.fillRect(hx + 3, hy + 1, 1, 2)
  } else if (kind === 'ops' || kind === 'deploy') {
    ctx.fillStyle = '#c7cfd9'
    ctx.fillRect(hx, hy - 3 + swing, 2, 6)
    ctx.fillRect(hx - 1, hy - 4 + swing, 4, 2)
  } else if (kind === 'type' || kind === 'browse') {
    ctx.fillStyle = '#1b222c'
    ctx.fillRect(x + 1, y + 15, 8, 3)
    ctx.fillStyle = Math.sin(actor.t * 14) > 0 ? '#3ddc84' : '#6cb6ff'
    ctx.fillRect(x + 2, y + 16, 6, 1)
  } else if (kind === 'mail' || kind === 'git') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(hx - 1, hy - 2, 5, 4)
    ctx.fillStyle = '#e0457b'
    ctx.fillRect(hx + 1, hy - 1, 1, 1)
  }
}

function drawEffects() {
  for (const e of effects) {
    const k = 1 - e.age / e.life
    ctx.globalAlpha = Math.max(0, k)
    if (e.text) pixelText(ctx, e.text, Math.round(e.x), Math.round(e.y), e.color)
    else if (e.puff) {
      ctx.fillStyle = e.color
      ctx.beginPath()
      ctx.arc(e.x, e.y, (e.size ?? 2) * (1.5 - k * 0.5), 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = e.color
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.size ?? 1, e.size ?? 1)
    }
  }
  ctx.globalAlpha = 1
}

function point(p) {
  return p instanceof Actor ? { x: p.x, y: p.y - 10 } : p
}

function drawFlights() {
  for (const f of flights) {
    const k = Math.min(1, f.t / f.dur)
    const a = point(f.from)
    const b = point(f.to)
    const e = k * k * (3 - 2 * k)
    const x = a.x + (b.x - a.x) * e
    const arc = f.kind === 'packet' ? 6 : 18
    const y = a.y + (b.y - a.y) * e - Math.sin(k * Math.PI) * arc
    if (f.kind === 'beam') {
      ctx.strokeStyle = `rgba(255,225,138,${1 - k})`
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (f.kind === 'mail' || f.kind === 'letter') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 2, 7, 5)
      ctx.fillStyle = '#c0392b'
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
      ctx.fillStyle = '#93a1b5'
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 2, 7, 1)
    } else if (f.kind === 'packet') {
      ctx.fillStyle = '#3ddc84'
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3)
      ctx.fillStyle = 'rgba(61,220,132,0.35)'
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5)
    } else if (f.kind === 'drone') {
      const dx = Math.round(x)
      const dy = Math.round(y - 8)
      ctx.fillStyle = '#2b3442'
      ctx.fillRect(dx - 3, dy - 1, 7, 3)
      ctx.fillStyle = REDUCED || Math.sin(time * 40) > 0 ? '#c7cfd9' : '#5b6470'
      ctx.fillRect(dx - 5, dy - 2, 3, 1)
      ctx.fillRect(dx + 3, dy - 2, 3, 1)
      ctx.fillStyle = f.ok === false ? '#ff5c6c' : '#3ddc84'
      ctx.fillRect(dx, dy, 1, 1)
    }
  }
}

function drawNight() {
  const hour = new Date().getHours() + new Date().getMinutes() / 60
  const dark = hour < 6 || hour > 19 ? 0.38 : hour < 7 ? 0.38 * (7 - hour) : hour > 18 ? 0.38 * (hour - 18) : 0
  if (dark <= 0) return 0
  ctx.fillStyle = `rgba(10, 18, 48, ${dark})`
  ctx.fillRect(0, 0, W, H)
  if (serverMode()) return dark
  // a fogueira ilumina a praça à noite
  const gx = FIRE.x * TILE + 8
  const gy = FIRE.y * TILE + 6
  const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, 46)
  g.addColorStop(0, `rgba(255,170,60,${dark * 0.9})`)
  g.addColorStop(1, 'rgba(255,170,60,0)')
  ctx.fillStyle = g
  ctx.fillRect(gx - 50, gy - 50, 100, 100)
  return dark
}

function toScreen(x, y) {
  return { x: offsetX + x * scale, y: offsetY + y * scale }
}

// ------------------------------------------------------------ placas e rótulos

// Texto no mundo é enfileirado durante o desenho e pintado depois em resolução de
// tela: a fonte 3x5 escalada ficava ilegível nas placas.
const labels = []
const LABEL_STYLES = {
  sign: { size: 1, weight: 700, fg: '#fbefd5', bg: '#3a2a1c', border: '#8a6237', min: 13 },
  signSmall: { size: 0.85, weight: 700, fg: '#fbefd5', bg: '#3a2a1c', border: '#8a6237', min: 10 },
  signOk: { size: 1, weight: 700, fg: '#b9f5d3', bg: '#11281b', border: '#2f7a4f', min: 11 },
  signBad: { size: 1, weight: 700, fg: '#ffc2c8', bg: '#3d1219', border: '#a83a49', min: 11 },
  tiny: { size: 0.56, weight: 700, fg: '#dbe7f5', stroke: '#0d1117', min: 7 },
  tinyBad: { size: 0.56, weight: 700, fg: '#ffb3bb', stroke: '#0d1117', min: 7 },
  micro: { size: 0.46, weight: 700, fg: '#93a1b5', stroke: '#0d1117', min: 6 },
  cloud: { size: 0.95, weight: 800, fg: '#ffffff', stroke: '#a84d0c', min: 11 },
  cloudSmall: { size: 0.7, weight: 700, fg: '#ffffff', stroke: '#a84d0c', min: 9 },
}

function label(text, x, y, style = 'sign') {
  labels.push({ text, x, y, style })
}

function drawLabels() {
  const dpr = window.devicePixelRatio || 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const item of labels) {
    const s = LABEL_STYLES[item.style]
    const px = Math.round(Math.max(s.min * dpr, s.size * scale * 4.6))
    ctx.font = `${s.weight} ${px}px ui-sans-serif, system-ui, 'Segoe UI', sans-serif`
    const p = toScreen(item.x, item.y)
    if (s.bg) {
      const w = ctx.measureText(item.text).width + px * 0.9
      const h = px * 1.45
      ctx.fillStyle = s.border
      ctx.fillRect(Math.round(p.x - w / 2) - dpr, Math.round(p.y - h / 2) - dpr, Math.round(w) + 2 * dpr, Math.round(h) + 2 * dpr)
      ctx.fillStyle = s.bg
      ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), Math.round(w), Math.round(h))
    } else {
      ctx.lineWidth = Math.max(2, px / 4)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = s.stroke
      ctx.strokeText(item.text, p.x, p.y)
    }
    ctx.fillStyle = s.fg
    ctx.fillText(item.text, p.x, p.y + dpr * 0.5)
  }
  ctx.textAlign = 'start'
}

// ------------------------------------------------------------ balões com ícone

// Ícones 7x7 em pixel art: o desenho diz o verbo, o texto só diz em quê.
const ICONS = {
  edit: ['....##.', '...#.##', '..#.#..', '.#.#...', '#.#....', '##.....', '###....'],
  read: ['.###...', '#...#..', '#...#..', '#...#..', '.###.#.', '.....##', '......#'],
  type: ['#######', '#.....#', '#.#...#', '#..#..#', '#.#.###', '#.....#', '#######'],
  git: ['.#...#.', '.#...#.', '.#..#..', '.###...', '.#.....', '.#.....', '.#.....'],
  web: ['..###..', '.#.#.#.', '#######', '#..#..#', '#######', '.#.#.#.', '..###..'],
  browse: ['#######', '#.#.#.#', '#######', '#.....#', '#.###.#', '#.....#', '#######'],
  mail: ['#######', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#######', '.......'],
  ops: ['..#.#..', '.#####.', '##...##', '.#...#.', '##...##', '.#####.', '..#.#..'],
  deploy: ['...#...', '..###..', '.#.#.#.', '...#...', '.#####.', '#######', '#######'],
  spawn: ['.#...#.', '###.###', '.#...#.', '###.###', '#.#.#.#', '.......', '.......'],
  ask: ['.###...', '#...#..', '...#...', '..#....', '..#....', '.......', '..#....'],
  think: ['..###..', '.#...#.', '.#...#.', '.#...#.', '..###..', '..###..', '...#...'],
}
const KIND_STYLE = {
  edit: { color: '#e0457b', verb: 'editando' },
  read: { color: '#4aa3ff', verb: 'lendo' },
  type: { color: '#2fbf71', verb: 'terminal' },
  git: { color: '#e5533d', verb: 'git' },
  web: { color: '#2fb5c4', verb: 'web' },
  browse: { color: '#2fb5c4', verb: 'navegador' },
  mail: { color: '#e09a1f', verb: 'mensagem' },
  ops: { color: '#f07c1a', verb: 'servidor' },
  deploy: { color: '#f48120', verb: 'deploy' },
  spawn: { color: '#c99a1e', verb: 'chamando agente' },
  ask: { color: '#e0b31f', verb: 'sua vez' },
  think: { color: '#8a7cf0', verb: 'pensando' },
}

function drawIcon(name, x, y, px, color) {
  ctx.fillStyle = color
  ICONS[name].forEach((row, j) => {
    for (let i = 0; i < 7; i++) if (row[i] === '#') ctx.fillRect(x + i * px, y + j * px, px, px)
  })
}

function bubbleText(d, kind) {
  // No modo histórico o balão diz a etapa do engenho; o arquivo real fica na dica do mouse.
  if (historic()) {
    if (d.role === 'captain') return theme.captainTask[kind] ?? 'observa da varanda'
    if (kind === 'think') return KIND_STYLE.think.verb
    return theme.stations[d.station]?.task ?? KIND_STYLE[kind].verb
  }
  if (kind === 'think' || kind === 'ask') return KIND_STYLE[kind].verb
  const text = d.detail || KIND_STYLE[kind].verb
  return text.length > 22 ? `${text.slice(0, 21)}…` : text
}

function drawBubble(actor) {
  const d = actor.data
  if (actor.alpha < 0.9 || actor.walking) return
  if (d.state !== 'tool' && d.state !== 'thinking' && d.state !== 'waiting') return
  const kind = d.state === 'thinking' ? 'think' : d.state === 'waiting' ? 'ask' : TOOL_KIND(d.tool, d.station)
  const style = KIND_STYLE[kind] ?? KIND_STYLE.type
  const dpr = window.devicePixelRatio || 1
  const px = Math.max(2, Math.round(scale * 0.95))
  const icon = 7 * px
  const fontPx = Math.round(Math.max(11 * dpr, icon * 0.9))
  ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, 'Segoe UI', sans-serif`
  const text = bubbleText(d, kind)
  const tw = ctx.measureText(text).width
  const pad = Math.round(4 * dpr)
  const h = icon + pad * 2
  const w = h + pad + tw + pad * 2
  // flutua de leve, como balão de jogo
  const float = REDUCED ? 0 : Math.round(Math.sin(time * 2.4 + actor.t) * 1.5 * dpr)
  const p = toScreen(actor.x, actor.y - 31)
  const bx = Math.round(p.x - w / 2)
  const by = Math.round(p.y - h - 6 * dpr + float)

  if (kind === 'think') {
    // nuvem de pensamento: bolinhas subindo até o balão
    ctx.fillStyle = '#f3f0ff'
    for (const [dx, dy, r] of [[0, 3, 1.5], [3, -2, 2.2]]) {
      ctx.beginPath()
      ctx.arc(p.x + dx * dpr, p.y + dy * dpr + float, r * dpr, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = '#0d1117'
    ctx.beginPath()
    ctx.moveTo(p.x - 4 * dpr, by + h - 1)
    ctx.lineTo(p.x + 4 * dpr, by + h - 1)
    ctx.lineTo(p.x, by + h + 5 * dpr)
    ctx.fill()
  }
  // corpo do balão: contorno escuro, fundo claro, selo colorido com o ícone
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(bx - dpr, by - dpr, w + 2 * dpr, h + 2 * dpr)
  ctx.fillStyle = kind === 'think' ? '#f3f0ff' : kind === 'ask' ? '#fff6d6' : '#f6f8fb'
  ctx.fillRect(bx, by, w, h)
  ctx.fillStyle = style.color
  ctx.fillRect(bx, by, h, h)
  let iconY = by + pad
  if (kind === 'think' && !REDUCED && Math.sin(time * 5) > 0.3) {
    ctx.fillStyle = '#ffe14d'
    ctx.fillRect(bx + pad - px, by + pad - px, icon + 2 * px, icon - 2 * px)
  }
  if (kind === 'ask' && !REDUCED) iconY += Math.round(Math.abs(Math.sin(time * 6)) * -2 * dpr)
  drawIcon(kind in ICONS ? kind : 'type', bx + pad, iconY, px, '#ffffff')
  ctx.fillStyle = '#141820'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, bx + h + pad, by + h / 2 + dpr * 0.5)
  // trabalho em andamento: barrinha que enche e reinicia sob o balão
  if (kind !== 'think' && kind !== 'ask' && !REDUCED) {
    const k = (time * 0.6 + actor.t) % 1
    ctx.fillStyle = style.color
    ctx.fillRect(bx + h, by + h - 2 * dpr, Math.round((w - h) * k), 2 * dpr)
  }
}

// ============================================================ dica ao passar o mouse

const tip = document.getElementById('tip')
const bubbles = document.getElementById('opt-bubbles')

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  mouse = {
    cx: event.clientX - rect.left,
    cy: event.clientY - rect.top,
    wx: ((event.clientX - rect.left) * dpr - offsetX) / scale,
    wy: ((event.clientY - rect.top) * dpr - offsetY) / scale,
  }
})
canvas.addEventListener('mouseleave', () => {
  mouse = null
  tip.hidden = true
})
canvas.addEventListener('click', () => {
  if (serverMode()) return
  const hit = mouse && actorAt(mouse.wx, mouse.wy)
  followId = hit ? (followId === hit.id ? null : hit.id) : null
  renderAgents()
})

function actorAt(wx, wy) {
  let best = null
  for (const actor of actors.values()) {
    if (Math.abs(actor.x - wx) < 11 && wy > actor.y - 30 && wy < actor.y + 3) best = actor
  }
  return best
}

function drawHover() {
  if (!mouse) return
  const lines = hoverInfo(mouse.wx, mouse.wy)
  if (!lines) {
    tip.hidden = true
    return
  }
  tip.replaceChildren()
  const title = document.createElement('b')
  title.textContent = lines[0]
  tip.append(title)
  for (const line of lines.slice(1)) {
    const span = document.createElement('span')
    span.textContent = line
    tip.append(span, document.createElement('br'))
  }
  tip.hidden = false
  const stage = canvas.parentElement.getBoundingClientRect()
  const rect = canvas.getBoundingClientRect()
  tip.style.left = `${Math.min(rect.left - stage.left + mouse.cx + 14, stage.width - 290)}px`
  tip.style.top = `${rect.top - stage.top + mouse.cy + 14}px`
}

function hoverInfo(wx, wy) {
  if (serverMode()) return world.hover(wx, wy)
  const actor = actorAt(wx, wy)
  if (actor) {
    const d = actor.data
    const where = historic() ? theme.stations[d.station]?.sign : STATIONS[d.station]?.label
    return [d.name, roleDef(d.role).label, `${STATE_LABEL[d.state] ?? d.state} · ${d.label}`, `em: ${where ?? d.station}`]
  }
  const tel = snapshot?.services?.telemetry
  if (tel && !historic()) {
    for (let i = 0; i < Math.min(16, tel.containers.length); i++) {
      const s = slotRect(i)
      if (wx >= s.x && wx < s.x + s.w && wy >= s.y && wy < s.y + s.h) {
        const c = tel.containers[i]
        return [c.name, c.up ? 'rodando' : 'parado', 'container no nas-server']
      }
    }
  }
  const sites = [...siteState.values()]
  for (let i = 0; i < sites.length; i++) {
    const x = (26 + i * 2) * TILE + 6
    const y = SITE_ROW * TILE
    if (wx >= x - 4 && wx < x + 12 && wy >= y - 2 && wy < y + 22) {
      const s = sites[i]
      return [s.name, s.url, s.ok === null ? `sem resposta (${s.error})` : `HTTP ${s.status}${s.ms ? ` · ${s.ms} ms` : ''}`]
    }
  }
  for (const station of Object.values(STATIONS)) {
    const [tx, ty, tw, th] = station.rect
    if (wx >= tx * TILE && wx < (tx + tw) * TILE && wy >= ty * TILE && wy < (ty + th) * TILE) {
      const key = keyOf(station)
      const here = [...actors.values()].filter((a) => a.data.station === key && a.data.role !== 'captain').length
      if (historic()) {
        const info = theme.stations[key]
        return [info.sign, info.about, `no código: ${station.label}`, here ? `${here} personagem(ns) aqui` : 'ninguém agora']
      }
      return [station.label, here ? `${here} agente(s) aqui` : 'ninguém agora']
    }
  }
  if (Math.abs(wx - (FIRE.x * TILE + 8)) < 30 && Math.abs(wy - (FIRE.y * TILE + 8)) < 18) {
    return historic() ? [theme.fire.name, theme.fire.about, 'aqui ficam os agentes ociosos'] : ['Fogueira', 'onde os agentes ociosos descansam']
  }
  return null
}

function keyOf(station) {
  return Object.keys(STATIONS).find((k) => STATIONS[k] === station)
}

// ============================================================ painel lateral

const STATE_LABEL = { tool: 'trabalhando', thinking: 'pensando', waiting: 'esperando você', idle: 'ocioso', done: 'terminou' }
const avatarCache = new Map()
const agentsEl = document.getElementById('agents')

function renderAgents() {
  const list = [...actors.values()].filter((a) => !a.leaving || a.alpha > 0.5)
  const order = { waiting: 0, tool: 1, thinking: 2, idle: 3, done: 4 }
  list.sort((a, b) => (order[a.data.state] ?? 9) - (order[b.data.state] ?? 9) || b.data.lastAt - a.data.lastAt)
  agentsEl.replaceChildren(
    ...list.map((actor) => {
      const d = actor.data
      const li = document.createElement('li')
      li.className = `agent${followId === actor.id ? ' is-followed' : ''}`
      li.addEventListener('click', () => {
        followId = followId === actor.id ? null : actor.id
        renderAgents()
      })
      if (!avatarCache.has(`${theme.id}:${d.role}`)) avatarCache.set(`${theme.id}:${d.role}`, avatarUrl(d.role))
      const img = document.createElement('img')
      img.src = avatarCache.get(`${theme.id}:${d.role}`)
      img.alt = ''
      const body = document.createElement('div')
      const row = document.createElement('div')
      row.className = 'row'
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = d.name
      const pill = document.createElement('span')
      pill.className = `pill ${d.state}`
      pill.textContent = STATE_LABEL[d.state] ?? d.state
      row.append(name, pill)
      const what = document.createElement('div')
      what.className = 'what'
      const role = roleDef(d.role).label
      what.textContent = d.state === 'tool' || d.state === 'waiting' ? `${role} · ${d.label}` : `${role} · ${STATIONS[d.station]?.label ?? ''}`
      body.append(row, what)
      li.append(img, body)
      return li
    }),
  )
  document.getElementById('agent-count').textContent = String(list.length)
  document.getElementById('agents-empty').hidden = list.length > 0
}

function setGauge(id, value, max, unit) {
  const bar = document.getElementById(`g-${id}`)
  const label = document.getElementById(`v-${id}`)
  if (value == null) {
    bar.style.width = '0'
    label.textContent = '–'
    return
  }
  const ratio = Math.max(0, Math.min(1, value / max))
  bar.style.width = `${ratio * 100}%`
  bar.style.background = ratio > 0.85 ? 'var(--bad)' : ratio > 0.65 ? 'var(--warn)' : 'var(--ok)'
  label.textContent = `${value.toFixed(1)}${unit}`
}

function renderServices(services) {
  const tel = services.telemetry
  const ok = services.telemetryOk
  const state = document.getElementById('nas-state')
  state.className = `pill ${ok ? 'ok' : 'bad'}`
  state.textContent = ok == null ? '…' : ok ? 'online' : 'sem sinal'
  setGauge('cpu', tel?.cpu, 100, '%')
  setGauge('ram', tel?.ram, 100, '%')
  setGauge('temp', tel?.temp, 90, '°C')
  const up = tel ? tel.containers.filter((c) => c.up).length : 0
  const days = tel ? Math.floor(tel.uptimeSeconds / 86400) : 0
  document.getElementById('nas-meta').textContent = tel
    ? `${up}/${tel.containers.length} containers · ligado há ${days} d · ${tel.os} · leitura ${services.telemetryMs ?? '?'} ms${services.pulseOk ? ' · detalhe pela tailnet' : ''}`
    : 'aguardando a telemetria…'
  document.getElementById('containers').replaceChildren(
    ...(tel?.containers ?? []).map((c) => {
      const li = document.createElement('li')
      const dot = document.createElement('i')
      dot.className = `dot${c.up ? '' : ' bad'}`
      const span = document.createElement('span')
      span.textContent = c.name
      li.append(dot, span)
      return li
    }),
  )
  document.getElementById('sites').replaceChildren(
    ...Object.values(services.sites ?? {}).map((site) => {
      const li = document.createElement('li')
      const dot = document.createElement('i')
      dot.className = `dot${site.ok === null ? ' off' : site.ok ? '' : ' bad'}`
      const span = document.createElement('span')
      span.textContent = site.name
      const b = document.createElement('b')
      b.textContent = site.ok === null ? site.error : site.status ? `${site.status} · ${site.ms} ms` : site.error
      li.append(dot, span, b)
      return li
    }),
  )
}

function renderLog() {
  document.getElementById('log').replaceChildren(
    ...log.map((entry) => {
      const li = document.createElement('li')
      if (entry.tone) li.className = entry.tone
      const time = document.createElement('time')
      time.textContent = entry.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).slice(0, 8)
      const span = document.createElement('span')
      span.textContent = entry.text
      li.append(time, span)
      return li
    }),
  )
}

// ============================================================ conexão

const conn = document.getElementById('conn')

function connect() {
  const source = new EventSource('/events')
  source.onopen = () => {
    conn.textContent = 'ao vivo'
    conn.classList.remove('is-off')
  }
  source.onerror = () => {
    conn.textContent = 'reconectando…'
    conn.classList.add('is-off')
  }
  source.onmessage = (message) => {
    try {
      applySnapshot(JSON.parse(message.data))
    } catch (error) {
      console.error(error)
    }
  }
}

setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}, 1000)

// ============================================================ temas

const world = createServerWorld({
  REDUCED, label, sprite, burst, glyph, addLog, pixelText,
  puff: (x, y, color, size) => effects.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: -14, life: 1.8, age: 0, color, size, g: 0, puff: true }),
})

const themeSelect = document.getElementById('opt-theme')
const legendEl = document.getElementById('legend')
const arcadeLegend = legendEl.textContent

function applyTheme(id) {
  theme = THEMES[id] ?? THEMES.arcade
  try {
    localStorage.setItem('arena-theme', theme.id)
  } catch {
    // sem armazenamento: o tema vale só nesta aba
  }
  themeSelect.value = theme.id
  document.getElementById('subtitle').textContent = theme.subtitle
  legendEl.textContent = theme.legend ?? arcadeLegend.trim()
  const history = document.getElementById('history')
  history.hidden = !historic()
  document.getElementById('facts').replaceChildren(
    ...(theme.facts ?? []).map((fact) => {
      const li = document.createElement('li')
      li.textContent = fact
      return li
    }),
  )
  paintBackground()
  // posições mudam (o senhor fica na casa-grande): todos recalculam o destino
  for (const actor of actors.values()) actor.goal = null
  if (snapshot) applySnapshot(snapshot)
  renderAgents()
}

themeSelect.addEventListener('change', () => applyTheme(themeSelect.value))

applyTheme(theme.id)
resize()
connect()
requestAnimationFrame(frame)
