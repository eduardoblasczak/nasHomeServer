// Interlagos: cada container do nas-server é um carro, numa pista com o traçado medido.
//   velocidade = peso do serviço (CPU e memória, em escala logarítmica). O seletor da torre
//                define se quem mais consome anda mais rápido (padrão) ou mais lento
//   posição    = distância percorrida na sessão
//   rastro     = rede                              box     = reinício ou comportamento anormal
//   muro       = offline                           equipe  = sistema ao qual o container pertence
// Só o que é medido muda o estado dos carros. O cenário do fim de semana é ilustrativo.

import { CIRCUIT } from './interlagos-data.js'

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const DEBUG = new URLSearchParams(location.search).has('debug')

// ============================================================ equipes

const TEAMS = {
  draft: { name: 'Draft', color: '#e8002d' },
  nextcloud: { name: 'Nextcloud', color: '#1e63d6' },
  finance: { name: 'nasFinance', color: '#16a34a' },
  portfolio: { name: 'Portfólio', color: '#f5c518' },
  voalberto: { name: 'Vô Alberto', color: '#8a3ffc' },
  monitor: { name: 'Monitoramento', color: '#ff7a00' },
  infra: { name: 'Infraestrutura', color: '#e9edf2' },
}

const DRIVERS = {
  'draft-web': ['DFW', 'draft'], 'draft-app': ['DFA', 'draft'], 'draft-mysql': ['DBD', 'draft'],
  'nextcloud-app': ['NXC', 'nextcloud'], 'nextcloud-db': ['NXD', 'nextcloud'], 'nextcloud-redis': ['RDS', 'nextcloud'],
  'nasfinance-app': ['FIN', 'finance'], 'nasfinance-db': ['FDB', 'finance'],
  'portfolio-web': ['POR', 'portfolio'], 'portfolio-telemetry': ['TEL', 'portfolio'],
  'voalberto-site': ['VOA', 'voalberto'],
  prometheus: ['PRM', 'monitor'], grafana: ['GRF', 'monitor'], cadvisor: ['CAD', 'monitor'], 'node-exporter': ['NOD', 'monitor'], 'nas-pulse': ['PLS', 'monitor'],
  cloudflared: ['CFD', 'infra'], adguardhome: ['ADG', 'infra'], 'nginx-proxy-manager': ['NPM', 'infra'], portainer: ['PTN', 'infra'], 'ai-memory': ['MEM', 'infra'],
}

const driver = (name) => DRIVERS[name] ?? [name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase(), 'infra']

// ============================================================ geometria da pista

const N = CIRCUIT.track.length
const P = CIRCUIT.track.map(([x, y, a, b]) => ({ x, y, right: a, left: b }))
const LENGTH = CIRCUIT.length
const STEP = LENGTH / N

for (let i = 0; i < N; i++) {
  const a = P[(i - 2 + N) % N]
  const b = P[(i + 2) % N]
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  P[i].tx = (b.x - a.x) / len
  P[i].ty = (b.y - a.y) / len
}
for (let i = 0; i < N; i++) {
  const a = P[(i - 4 + N) % N]
  const b = P[(i + 4) % N]
  let delta = Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx)
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  P[i].curve = delta / (8 * STEP) // positivo = curva para a esquerda
}

const mod = (s) => ((s % LENGTH) + LENGTH) % LENGTH

/** Ponto a `d` metros do eixo da pista. d > 0 = esquerda do sentido de percurso. */
function at(s, d = 0) {
  const f = mod(s) / STEP
  const i = Math.floor(f) % N
  const k = f - Math.floor(f)
  const a = P[i]
  const b = P[(i + 1) % N]
  const tx = a.tx + (b.tx - a.tx) * k
  const ty = a.ty + (b.ty - a.ty) * k
  const len = Math.hypot(tx, ty) || 1
  return { x: a.x + (b.x - a.x) * k - (ty / len) * d, y: a.y + (b.y - a.y) * k + (tx / len) * d, tx: tx / len, ty: ty / len, left: a.left, right: a.right, curve: a.curve }
}

// Carros tiram o pé nas curvas. A média é normalizada para o tempo de volta valer de verdade.
const PACE = (() => {
  const raw = P.map((_, i) => {
    let c = 0
    for (let j = -3; j <= 6; j++) c = Math.max(c, Math.abs(P[(i + j + N) % N].curve))
    return 1 / (0.75 + Math.min(1.6, c * 45))
  })
  const smooth = raw.map((_, i) => {
    let sum = 0
    for (let j = -6; j <= 6; j++) sum += raw[(i + j + N) % N]
    return sum / 13
  })
  const harmonic = smooth.reduce((sum, v) => sum + 1 / v, 0) / N
  return smooth.map((v) => v * harmonic)
})()

// Pit lane real do OpenStreetMap.
const PIT = []
for (let i = 0; i < CIRCUIT.pit.length; i += 2) PIT.push({ x: CIRCUIT.pit[i], y: CIRCUIT.pit[i + 1] })
const nearestStation = (p) => {
  let best = 0
  let dist = Infinity
  for (let i = 0; i < N; i++) {
    const d = (P[i].x - p.x) ** 2 + (P[i].y - p.y) ** 2
    if (d < dist) {
      dist = d
      best = i
    }
  }
  return best * STEP
}
const PIT_IN = nearestStation(PIT[0])
const PIT_OUT = nearestStation(PIT[PIT.length - 1])
const pitCum = [0]
for (let i = 1; i < PIT.length; i++) pitCum.push(pitCum[i - 1] + Math.hypot(PIT[i].x - PIT[i - 1].x, PIT[i].y - PIT[i - 1].y))
const PIT_LENGTH = pitCum[pitCum.length - 1]

function pitAt(dist) {
  const d = Math.max(0, Math.min(PIT_LENGTH, dist))
  let i = 1
  while (i < pitCum.length - 1 && pitCum[i] < d) i++
  const a = PIT[i - 1]
  const b = PIT[i]
  const seg = pitCum[i] - pitCum[i - 1] || 1
  const k = (d - pitCum[i - 1]) / seg
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx: (b.x - a.x) / seg, ty: (b.y - a.y) / seg }
}

function cornerName(s) {
  const i = mod(s) / STEP
  let name = CIRCUIT.corners[CIRCUIT.corners.length - 1].name
  for (const c of CIRCUIT.corners) if (c.i <= i) name = c.name
  return name
}

// ============================================================ câmera

const stage = document.getElementById('stage')
const trackCanvas = document.getElementById('track')
const raceCanvas = document.getElementById('race')
const tctx = trackCanvas.getContext('2d')
const ctx = raceCanvas.getContext('2d')

// Vista olhando para o sul: a reta dos boxes fica no alto da tela e o circuito aproveita
// a tela larga.
const ROT = -Math.PI / 2 + 0.03
const cosR = Math.cos(ROT)
const sinR = Math.sin(ROT)
const view = { scale: 1, ox: 0, oy: 0, dpr: 1, w: 1, h: 1 }

const rotU = (x, y) => x * cosR - y * sinR
const rotV = (x, y) => x * sinR + y * cosR
const sx = (x, y) => view.ox + rotU(x, y) * view.scale
const sy = (x, y) => view.oy - rotV(x, y) * view.scale

function layout() {
  const rect = stage.getBoundingClientRect()
  view.dpr = Math.min(2, window.devicePixelRatio || 1)
  view.w = Math.max(1, Math.round(rect.width * view.dpr))
  view.h = Math.max(1, Math.round(rect.height * view.dpr))
  for (const c of [trackCanvas, raceCanvas]) {
    c.width = view.w
    c.height = view.h
  }
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const p of [...P, ...PIT]) {
    const u = rotU(p.x, p.y)
    const v = rotV(p.x, p.y)
    minU = Math.min(minU, u); maxU = Math.max(maxU, u)
    minV = Math.min(minV, v); maxV = Math.max(maxV, v)
  }
  // folga para as arquibancadas e os painéis, sem esconder a pista
  const padX = 34 * view.dpr
  const padTop = 92 * view.dpr
  const padBottom = 58 * view.dpr
  view.scale = Math.min((view.w - padX * 2) / (maxU - minU + 60), (view.h - padTop - padBottom) / (maxV - minV + 60))
  view.ox = padX + (view.w - padX * 2 - (maxU - minU) * view.scale) / 2 - minU * view.scale
  view.oy = padTop + (view.h - padTop - padBottom - (maxV - minV) * view.scale) / 2 + maxV * view.scale
  paintTrack()
}

// ============================================================ desenho estático

let seed = 11
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

function noiseTile(base, spread, size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * spread
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
  // manchas maiores: tiram a cara de ruído uniforme
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.012 + rand() * 0.022})`
    g.beginPath()
    g.ellipse(rand() * size, rand() * size, 6 + rand() * 30, 4 + rand() * 18, rand() * 3, 0, Math.PI * 2)
    g.fill()
  }
  return g.createPattern(c, 'repeat')
}

function trace(g, pts, close = false) {
  g.beginPath()
  pts.forEach((p, i) => {
    const X = sx(p.x, p.y)
    const Y = sy(p.x, p.y)
    if (i) g.lineTo(X, Y)
    else g.moveTo(X, Y)
  })
  if (close) g.closePath()
}

const flatPts = (flat) => {
  const out = []
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] })
  return out
}

/** Linha paralela ao eixo. d pode ser número ou função (ponto → metros). */
function offset(s0, s1, d, step = STEP) {
  const pts = []
  const end = s1 >= s0 ? s1 : s1 + LENGTH
  for (let s = s0; s <= end + 0.01; s += step) {
    const dist = typeof d === 'function' ? d(mod(s)) : d
    pts.push(at(s, dist))
  }
  return pts
}

function ribbon(s0, s1, d0, d1, step = STEP) {
  return [...offset(s0, s1, d0, step), ...offset(s0, s1, d1, step).reverse()]
}

const metres = (m) => m * view.scale

function paintTrack() {
  const g = tctx
  seed = 11
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.lineJoin = 'round'
  g.lineCap = 'round'

  // cidade em volta
  g.fillStyle = noiseTile('#70716a', 16)
  g.fillRect(0, 0, view.w, view.h)

  // terreno do autódromo
  const loop = P.map((p) => p)
  g.fillStyle = noiseTile('#5f7f3f', 13)
  g.strokeStyle = g.fillStyle
  trace(g, loop, true)
  g.fill()
  g.lineWidth = metres(170)
  g.stroke()

  for (const f of CIRCUIT.grass) {
    trace(g, flatPts(f), true)
    g.fillStyle = noiseTile('#688a44', 12)
    g.fill()
  }
  // listras de corte de grama, como nas transmissões aéreas
  g.save()
  trace(g, loop, true)
  g.clip()
  g.strokeStyle = 'rgba(255,255,255,0.028)'
  g.lineWidth = metres(14)
  for (let i = -view.h; i < view.w; i += metres(28)) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + view.h * 0.5, view.h)
    g.stroke()
  }
  g.restore()

  paintForest(g)
  for (const w of CIRCUIT.water) {
    trace(g, flatPts(w), true)
    g.fillStyle = '#31617a'
    g.fill()
    g.strokeStyle = 'rgba(190,225,235,0.32)'
    g.lineWidth = Math.max(1, metres(1.5))
    g.stroke()
  }
  paintBuildings(g)

  for (const k of CIRCUIT.kart) {
    trace(g, flatPts(k))
    g.strokeStyle = '#3b3d3f'
    g.lineWidth = metres(7)
    g.stroke()
  }

  paintRunoff(g)
  paintPitComplex(g)
  paintSurface(g)
  paintKerbs(g)
  paintStartLine(g)
  paintWeekend(g)
  if (DEBUG) paintDebug(g)
}

function paintForest(g) {
  for (const f of CIRCUIT.forest) {
    const pts = flatPts(f)
    g.save()
    trace(g, pts, true)
    g.clip()
    g.fillStyle = '#2e4a26'
    g.fillRect(0, 0, view.w, view.h)
    const xs = pts.map((p) => sx(p.x, p.y))
    const ys = pts.map((p) => sy(p.x, p.y))
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const count = Math.min(2600, ((maxX - minX) * (maxY - minY)) / (metres(5) ** 2 + 1))
    for (let i = 0; i < count; i++) {
      const X = minX + rand() * (maxX - minX)
      const Y = minY + rand() * (maxY - minY)
      const r = metres(3 + rand() * 4)
      g.fillStyle = `rgb(${35 + rand() * 24},${68 + rand() * 38},${30 + rand() * 18})`
      g.beginPath()
      g.arc(X, Y, r, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }
}

function paintBuildings(g) {
  for (const b of CIRCUIT.buildings) {
    const pts = flatPts(b)
    g.save()
    g.translate(metres(1.8), metres(2.2))
    trace(g, pts, true)
    g.fillStyle = 'rgba(0,0,0,0.3)'
    g.fill()
    g.restore()
    const shade = 150 + rand() * 72
    trace(g, pts, true)
    g.fillStyle = `rgb(${shade},${shade * 0.97},${shade * 0.91})`
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.22)'
    g.lineWidth = 0.6 * view.dpr
    g.stroke()
  }
  for (const s of CIRCUIT.stands) {
    const pts = flatPts(s)
    trace(g, pts, true)
    g.fillStyle = '#d8dbdc'
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 0.8 * view.dpr
    g.stroke()
  }
}

// Área de escape pintada, mais larga onde a curva é mais forte: é o verde típico de Interlagos.
function paintRunoff(g) {
  const smooth = P.map((_, i) => {
    let c = 0
    for (let j = -7; j <= 7; j++) c += P[(i + j + N) % N].curve
    return c / 15
  })
  const left = []
  const right = []
  for (let i = 0; i < N; i++) {
    const s = i * STEP
    const c = smooth[i]
    // o escape fica por fora da curva
    left.push(at(s, P[i].left + 2.5 + (c < 0 ? Math.min(30, -c * 620) : 0)))
    right.push(at(s, -(P[i].right + 2.5 + (c > 0 ? Math.min(30, c * 620) : 0))))
  }
  g.fillStyle = noiseTile('#23916f', 9)
  g.beginPath()
  left.forEach((p, i) => (i ? g.lineTo(sx(p.x, p.y), sy(p.x, p.y)) : g.moveTo(sx(p.x, p.y), sy(p.x, p.y))))
  g.closePath()
  right.forEach((p, i) => (i ? g.lineTo(sx(p.x, p.y), sy(p.x, p.y)) : g.moveTo(sx(p.x, p.y), sy(p.x, p.y))))
  g.closePath()
  g.fill('evenodd')
  // barreira de pneus e muro por fora do escape
  for (const edge of [left, right]) {
    trace(g, edge, true)
    g.strokeStyle = 'rgba(205,208,210,0.7)'
    g.lineWidth = Math.max(0.8, metres(0.7))
    g.stroke()
  }
}

function paintSurface(g) {
  const left = P.map((p, i) => at(i * STEP, p.left))
  const right = P.map((p, i) => at(i * STEP, -p.right))
  const tile = noiseTile('#34363a', 15)
  g.fillStyle = tile
  g.beginPath()
  left.forEach((p, i) => (i ? g.lineTo(sx(p.x, p.y), sy(p.x, p.y)) : g.moveTo(sx(p.x, p.y), sy(p.x, p.y))))
  g.closePath()
  right.forEach((p, i) => (i ? g.lineTo(sx(p.x, p.y), sy(p.x, p.y)) : g.moveTo(sx(p.x, p.y), sy(p.x, p.y))))
  g.closePath()
  g.fill('evenodd')

  // linha de borracha: escura e ligeiramente por dentro das curvas
  const line = P.map((p, i) => at(i * STEP, Math.max(-5, Math.min(5, p.curve * 260))))
  trace(g, line, true)
  g.strokeStyle = 'rgba(8,8,10,0.34)'
  g.lineWidth = metres(3.2)
  g.stroke()

  for (const edge of [left, right]) {
    trace(g, edge, true)
    g.strokeStyle = 'rgba(245,245,245,0.92)'
    g.lineWidth = Math.max(1, metres(0.55))
    g.stroke()
  }
}

function paintKerbs(g) {
  const kerbW = Math.max(metres(1.4), 1.6 * view.dpr)
  for (let i = 0; i < N; i++) {
    const c = P[i].curve
    if (Math.abs(c) < 0.0065) continue
    // zebra por dentro da curva e, nas fortes, também na saída por fora
    const sides = Math.abs(c) > 0.015 ? [1, -1] : [1]
    for (const side of sides) {
      const inner = (c > 0 ? 1 : -1) * side
      const w = inner > 0 ? P[i].left : P[i].right
      const a = at(i * STEP, inner * w)
      const b = at((i + 1) * STEP, inner * w)
      g.strokeStyle = i % 2 ? '#d7261e' : '#f5f5f5'
      g.lineWidth = kerbW
      g.lineCap = 'butt'
      g.beginPath()
      g.moveTo(sx(a.x, a.y), sy(a.x, a.y))
      g.lineTo(sx(b.x, b.y), sy(b.x, b.y))
      g.stroke()
    }
  }
  g.lineCap = 'round'
}

function paintStartLine(g) {
  // quadriculado da largada/chegada, na posição zero medida
  const cells = 8
  const p = at(0)
  for (let j = 0; j < cells; j++) {
    for (let k = 0; k < 2; k++) {
      const d = -p.right + ((p.left + p.right) * (j + 0.5)) / cells
      const a = at(k * 1.4 - 1.4, d)
      g.fillStyle = (j + k) % 2 ? '#111' : '#fff'
      g.beginPath()
      g.arc(sx(a.x, a.y), sy(a.x, a.y), Math.max(1, metres(0.8)), 0, Math.PI * 2)
      g.fill()
    }
  }
  // grid de largada: marcas brancas atrás da linha
  for (let r = 0; r < 21; r++) {
    const a = at(-10 - r * 8, r % 2 ? 3.2 : -3.2)
    const q = at(-10 - r * 8, (r % 2 ? 3.2 : -3.2) + 2.2)
    const q2 = at(-10 - r * 8, (r % 2 ? 3.2 : -3.2) - 2.2)
    g.strokeStyle = 'rgba(255,255,255,0.7)'
    g.lineWidth = Math.max(0.7, metres(0.4))
    g.beginPath()
    g.moveTo(sx(q.x, q.y), sy(q.x, q.y))
    g.lineTo(sx(q2.x, q2.y), sy(q2.x, q2.y))
    g.stroke()
    void a
  }
}

// ---------- complexo dos boxes (geometria do pit lane real) ----------

// Lado do pit lane em que ficam as garagens: o oposto da pista.
function pitNormal(p) {
  const station = at(nearestStation(p))
  const nx = -p.ty
  const ny = p.tx
  const away = (p.x - station.x) * nx + (p.y - station.y) * ny
  return away >= 0 ? { x: nx, y: ny } : { x: -nx, y: -ny }
}

// As garagens ficam só no trecho paralelo à reta (o pit lane real segue por mais de 600 m
// até a saída, por dentro do S do Senna e da Curva do Sol).
const GARAGE_T0 = 170 / PIT_LENGTH
const GARAGE_T1 = 590 / PIT_LENGTH

const trackDistance = (x, y) => {
  let best = Infinity
  for (const p of P) best = Math.min(best, (p.x - x) ** 2 + (p.y - y) ** 2)
  return Math.sqrt(best)
}

function pitStrip(d0, d1, t0 = GARAGE_T0, t1 = GARAGE_T1, keepOffTrack = false) {
  const a = []
  const b = []
  for (let t = t0; t <= t1 + 1e-6; t += 0.012) {
    const p = pitAt(PIT_LENGTH * t)
    const n = pitNormal(p)
    let d = d1
    // o paddock termina antes de encostar no trecho do Mergulho, que passa logo atrás
    while (keepOffTrack && d > d0 && trackDistance(p.x + n.x * d, p.y + n.y * d) < 30) d -= 3
    a.push({ x: p.x + n.x * d0, y: p.y + n.y * d0 })
    b.push({ x: p.x + n.x * d, y: p.y + n.y * d })
  }
  return [...a, ...b.reverse()]
}

function paintPitComplex(g) {
  // pátio do paddock, atrás das garagens
  trace(g, pitStrip(9, 88, GARAGE_T0 - 0.02, GARAGE_T1 + 0.02, true), true)
  g.fillStyle = noiseTile('#6f7174', 12)
  g.fill()

  // pit lane
  trace(g, PIT)
  g.strokeStyle = '#2f3134'
  g.lineWidth = metres(12)
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.72)'
  g.lineWidth = Math.max(0.7, metres(0.35))
  g.stroke()

  // prédio dos boxes: telhado longo com divisões por equipe
  const roof = pitStrip(9, 30)
  g.save()
  g.translate(metres(2), metres(3))
  trace(g, roof, true)
  g.fillStyle = 'rgba(0,0,0,0.42)'
  g.fill()
  g.restore()
  trace(g, roof, true)
  g.fillStyle = '#e8e9e8'
  g.fill()
  const teamColors = Object.values(TEAMS).map((t) => t.color)
  for (let i = 0; i < 20; i++) {
    const t0 = GARAGE_T0 + (i / 20) * (GARAGE_T1 - GARAGE_T0)
    const t1 = t0 + (GARAGE_T1 - GARAGE_T0) / 20
    const a = pitAt(PIT_LENGTH * t0)
    const n = pitNormal(a)
    const b = pitAt(PIT_LENGTH * t1)
    // faixa de cor da garagem, na beira do pit lane
    g.strokeStyle = teamColors[i % teamColors.length]
    g.lineWidth = Math.max(1.4, metres(2.2))
    g.lineCap = 'butt'
    g.beginPath()
    g.moveTo(sx(a.x + n.x * 10.5, a.y + n.y * 10.5), sy(a.x + n.x * 10.5, a.y + n.y * 10.5))
    g.lineTo(sx(b.x + n.x * 10.5, b.y + n.y * 10.5), sy(b.x + n.x * 10.5, b.y + n.y * 10.5))
    g.stroke()
    // nervuras do telhado
    g.strokeStyle = 'rgba(0,0,0,0.13)'
    g.lineWidth = Math.max(0.6, metres(0.4))
    g.beginPath()
    g.moveTo(sx(a.x + n.x * 12, a.y + n.y * 12), sy(a.x + n.x * 12, a.y + n.y * 12))
    g.lineTo(sx(a.x + n.x * 30, a.y + n.y * 30), sy(a.x + n.x * 30, a.y + n.y * 30))
    g.stroke()
  }
  g.lineCap = 'round'

  // caminhões das equipes, em fileiras atrás dos boxes
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 17; i++) {
      const t = GARAGE_T0 + ((i + 0.5) / 17) * (GARAGE_T1 - GARAGE_T0)
      const p = pitAt(PIT_LENGTH * t)
      const n = pitNormal(p)
      const c = { x: p.x + n.x * (42 + row * 19), y: p.y + n.y * (42 + row * 19) }
      if (trackDistance(c.x, c.y) < 38) continue
      drawBlock(g, c, n, 15, 4.2, rand() < 0.25 ? teamColors[Math.floor(rand() * teamColors.length)] : '#f2f3f4')
    }
  }
}

/** Retângulo orientado: `n` aponta o comprimento. */
function drawBlock(g, c, n, length, width, color) {
  const tx = -n.y
  const ty = n.x
  const corners = [
    { x: c.x + n.x * length / 2 + tx * width / 2, y: c.y + n.y * length / 2 + ty * width / 2 },
    { x: c.x + n.x * length / 2 - tx * width / 2, y: c.y + n.y * length / 2 - ty * width / 2 },
    { x: c.x - n.x * length / 2 - tx * width / 2, y: c.y - n.y * length / 2 - ty * width / 2 },
    { x: c.x - n.x * length / 2 + tx * width / 2, y: c.y - n.y * length / 2 + ty * width / 2 },
  ]
  g.save()
  g.translate(metres(1), metres(1.4))
  trace(g, corners, true)
  g.fillStyle = 'rgba(0,0,0,0.34)'
  g.fill()
  g.restore()
  trace(g, corners, true)
  g.fillStyle = color
  g.fill()
}

// ---------- fim de semana de GP (ilustrativo, ancorado na pista) ----------

const SPONSORS = ['nas-server', 'DRAFT', 'nasFinance', 'ebls.com.br', 'Vô Alberto', 'Nextcloud self-hosted', 'Interlagos 2026']
const CROWD = ['#e8002d', '#1e63d6', '#f5c518', '#16a34a', '#ffffff', '#ff7a00', '#222', '#c7ccd2', '#00a19b']

/** Arquibancada: público em faixas e cobertura no fundo. d0 é a beira próxima da pista. */
function grandstand(g, s0, s1, d0, depth) {
  const side = Math.sign(d0)
  const d1 = d0 + side * depth
  const pts = ribbon(s0, s1, d0, d1, 6)
  g.save()
  g.translate(metres(2), metres(3))
  trace(g, pts, true)
  g.fillStyle = 'rgba(0,0,0,0.4)'
  g.fill()
  g.restore()
  trace(g, pts, true)
  g.fillStyle = '#3a3e43'
  g.fill()
  const end = s1 >= s0 ? s1 : s1 + LENGTH
  const seats = depth * 0.62
  for (let s = s0; s < end; s += 1.05) {
    for (let r = 0.6; r < seats; r += 1.15) {
      if (rand() < 0.08) continue
      const p = at(s + rand() * 0.6, d0 + side * r)
      g.fillStyle = CROWD[Math.floor(rand() * CROWD.length)]
      g.fillRect(sx(p.x, p.y), sy(p.x, p.y), Math.max(1, metres(0.7)), Math.max(1, metres(0.7)))
    }
  }
  // cobertura branca, com nervuras
  const roof = ribbon(s0, s1, d0 + side * seats, d1, 6)
  trace(g, roof, true)
  g.fillStyle = '#eceded'
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.14)'
  g.lineWidth = Math.max(0.5, metres(0.3))
  for (let s = s0; s < end; s += 9) {
    const a = at(s, d0 + side * seats)
    const b = at(s, d1)
    g.beginPath()
    g.moveTo(sx(a.x, a.y), sy(a.x, a.y))
    g.lineTo(sx(b.x, b.y), sy(b.x, b.y))
    g.stroke()
  }
}

/** Texto seguindo a pista, sempre de pé para quem olha a tela. */
function alongText(g, text, s, d, size, color, weight = 700) {
  const p = at(s, d)
  let angle = Math.atan2(sy(p.x + p.tx, p.y + p.ty) - sy(p.x, p.y), sx(p.x + p.tx, p.y + p.ty) - sx(p.x, p.y))
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI
  g.save()
  g.translate(sx(p.x, p.y), sy(p.x, p.y))
  g.rotate(angle)
  g.font = `${weight} ${size}px Bahnschrift, 'Arial Narrow', sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = color
  g.fillText(text, 0, 0)
  g.restore()
}

/** Placas de patrocínio contínuas, na barreira. */
function boards(g, s0, s1, d) {
  const end = s1 >= s0 ? s1 : s1 + LENGTH
  const thick = Math.max(metres(4.2), 7.5 * view.dpr) / view.scale
  const each = Math.max(58, 62 / view.scale)
  let i = Math.floor(rand() * SPONSORS.length)
  const side = Math.sign(d)
  for (let s = s0; s + each <= end; s += each) {
    const palette = [['#101214', '#fff'], ['#e10600', '#fff'], ['#f4f5f6', '#111'], ['#0b3b8c', '#fff'], ['#16a34a', '#fff']][i % 5]
    trace(g, ribbon(s, s + each - 1.5, d, d + side * thick, 4), true)
    g.fillStyle = palette[0]
    g.fill()
    alongText(g, SPONSORS[i % SPONSORS.length], s + each / 2, d + (side * thick) / 2, Math.max(metres(3.2), 6.5 * view.dpr), palette[1])
    i++
  }
}

/** Tenda branca do paddock e das áreas de público, vista de cima. */
function tent(g, c, size) {
  const n = { x: 1, y: 0 }
  drawBlock(g, c, n, size, size, '#f7f7f6')
  g.strokeStyle = 'rgba(0,0,0,0.2)'
  g.lineWidth = Math.max(0.5, metres(0.3))
  const X = sx(c.x, c.y)
  const Y = sy(c.x, c.y)
  const r = metres(size / 2)
  g.beginPath()
  g.moveTo(X - r, Y - r)
  g.lineTo(X + r, Y + r)
  g.moveTo(X + r, Y - r)
  g.lineTo(X - r, Y + r)
  g.stroke()
}

// Trechos em metros a partir da linha de chegada; lado negativo = direita do sentido
// de percurso, que em Interlagos é o lado de fora do circuito. Ver ?debug na URL.
const STANDS = [
  [3880, 4235, -24, 22], // reta dos boxes
  [4240, 4300, -24, 22],
  [10, 120, -30, 20], // chegada ao S do Senna
  [190, 310, -44, 18], // S do Senna, por fora
  [520, 700, -36, 16], // Curva do Sol
  [3430, 3580, -28, 16], // Junção
]
const BOARDS = [
  [3900, 4290, -11],
  [20, 180, -14],
  [800, 1160, -11],
  [3300, 3820, -11],
]

function paintWeekend(g) {
  for (const [s0, s1, d, depth] of STANDS) grandstand(g, s0, s1, d, depth)
  for (const [s0, s1, d] of BOARDS) boards(g, s0, s1, d)

  // tendas de hospitalidade e de público, atrás dos boxes
  for (let i = 0; i < 12; i++) {
    const t = GARAGE_T0 + ((i + 0.5) / 12) * (GARAGE_T1 - GARAGE_T0)
    const p = pitAt(PIT_LENGTH * t)
    const n = pitNormal(p)
    const c = { x: p.x + n.x * 100, y: p.y + n.y * 100 }
    if (trackDistance(c.x, c.y) > 38) tent(g, c, 15)
  }
  // área de público: fileiras de tendas no gramado central
  for (let row = 0; row < 3; row++) {
    for (let s = 1640; s < 1830; s += 17) {
      if (rand() < 0.12) continue
      const c = at(s + row * 6, 58 + row * 19)
      tent(g, c, row === 1 ? 12 : 9)
    }
  }
  // telões para o público, de frente para as arquibancadas
  for (const s of [4030, 300, 610, 3500]) {
    const a = at(s - 9, -19)
    const b = at(s + 9, -19)
    g.strokeStyle = '#101214'
    g.lineWidth = Math.max(2, metres(2.4))
    g.lineCap = 'butt'
    g.beginPath()
    g.moveTo(sx(a.x, a.y), sy(a.x, a.y))
    g.lineTo(sx(b.x, b.y), sy(b.x, b.y))
    g.stroke()
    g.lineCap = 'round'
  }
  // publicidade pintada, como nas áreas de escape e gramados reais
  alongText(g, 'nasFinance', 1000, 27, metres(13), 'rgba(255,255,255,0.8)', 800)
  alongText(g, 'GP DO nas-server', 2010, -30, metres(10), 'rgba(255,255,255,0.72)', 800)
  alongText(g, 'DRAFT', 3180, -34, metres(11), 'rgba(255,255,255,0.72)', 800)
  // pórtico de largada sobre a pista, com as cinco luzes
  const left = at(5, at(5).left + 3)
  const right = at(5, -at(5).right - 3)
  g.strokeStyle = '#121417'
  g.lineWidth = Math.max(3, metres(2.2))
  g.lineCap = 'butt'
  g.beginPath()
  g.moveTo(sx(left.x, left.y), sy(left.x, left.y))
  g.lineTo(sx(right.x, right.y), sy(right.x, right.y))
  g.stroke()
  g.lineCap = 'round'
  g.fillStyle = '#e10600'
  for (let i = -2; i <= 2; i++) {
    const q = at(5, i * 2.1)
    g.fillRect(sx(q.x, q.y) - view.dpr, sy(q.x, q.y) - view.dpr, 2 * view.dpr, 2 * view.dpr)
  }
  // torres de TV ao longo da reta
  for (const s of [3950, 4150, 60, 900, 2500]) {
    const p = at(s, -21)
    g.fillStyle = '#17191c'
    g.fillRect(sx(p.x, p.y) - metres(2), sy(p.x, p.y) - metres(2), metres(4), metres(4))
    g.fillStyle = '#e10600'
    g.fillRect(sx(p.x, p.y) - metres(0.8), sy(p.x, p.y) - metres(0.8), metres(1.6), metres(1.6))
  }
}

function paintDebug(g) {
  for (let s = 0; s < LENGTH; s += 100) {
    const p = at(s, 22)
    g.fillStyle = '#ff0'
    g.font = `${12 * view.dpr}px sans-serif`
    g.fillText(String(s), sx(p.x, p.y), sy(p.x, p.y))
    const q = at(s, -22)
    g.fillStyle = '#0ff'
    g.fillRect(sx(q.x, q.y) - 2, sy(q.x, q.y) - 2, 4, 4)
  }
}

// ============================================================ o carro

const carSprites = new Map()

function carSprite(color) {
  const key = `${color}:${view.dpr}`
  if (carSprites.has(key)) return carSprites.get(key)
  const L = 19 * view.dpr
  const pad = 3 * view.dpr
  const c = document.createElement('canvas')
  c.width = Math.ceil(L + pad * 2)
  c.height = Math.ceil(L * 0.52 + pad * 2)
  const g = c.getContext('2d')
  g.translate(pad, c.height / 2)
  const u = L / 100 // desenho em unidades: carro de 100 de comprimento, frente em +x
  const box = (x, y, w, h, color2) => {
    g.fillStyle = color2
    g.fillRect(x * u, y * u, w * u, h * u)
  }
  // pneus
  for (const [x, y] of [[66, -22], [66, 14], [8, -24], [8, 15]]) box(x, y, 15, 9, '#101113')
  // assoalho
  g.fillStyle = '#17181b'
  g.beginPath()
  g.moveTo(14 * u, -15 * u)
  g.lineTo(52 * u, -14 * u)
  g.lineTo(66 * u, -5 * u)
  g.lineTo(66 * u, 5 * u)
  g.lineTo(52 * u, 14 * u)
  g.lineTo(14 * u, 15 * u)
  g.closePath()
  g.fill()
  // corpo e bico
  g.fillStyle = color
  g.beginPath()
  g.moveTo(10 * u, -7 * u)
  g.lineTo(26 * u, -13 * u)
  g.lineTo(50 * u, -11 * u)
  g.lineTo(62 * u, -4 * u)
  g.lineTo(92 * u, -2.5 * u)
  g.lineTo(92 * u, 2.5 * u)
  g.lineTo(62 * u, 4 * u)
  g.lineTo(50 * u, 11 * u)
  g.lineTo(26 * u, 13 * u)
  g.lineTo(10 * u, 7 * u)
  g.closePath()
  g.fill()
  // asa dianteira e asa traseira
  box(88, -21, 8, 42, color)
  box(0, -19, 9, 38, color)
  box(0, -19, 2, 38, '#121316')
  // cockpit e halo
  box(46, -4.5, 13, 9, '#0a0b0d')
  g.strokeStyle = '#2a2c30'
  g.lineWidth = 1.6 * u
  g.strokeRect(43 * u, -5.5 * u, 17 * u, 11 * u)
  // brilho no capô
  g.fillStyle = 'rgba(255,255,255,0.28)'
  g.fillRect(16 * u, -2 * u, 28 * u, 1.6 * u)
  const sprite = { canvas: c, ax: pad + L * 0.5, ay: c.height / 2 }
  carSprites.set(key, sprite)
  return sprite
}

// ============================================================ estado da corrida

const cars = new Map()
const messages = []
const overrides = new Map() // nome -> { up?, cpu?, restart? }: só a simulação
let host = null
let pulseState = 'esperando' // tailnet | publica | sem-sinal
let telemetryLost = false
let lastPulseAt = null
let firstAt = null
let tick = 0
let hovered = null
let lastSwap = null
let rain = 0

const WARMUP_S = 300 // tempo para aprender o normal de cada serviço
const BOX_MIN_S = 10
const packetRate = (bps) => (bps ? Math.min(5, Math.log10(1 + bps / 256)) : 0)

/**
 * Peso de 0 a 1: quanto o serviço consome. CPU pesa mais porque muda a cada leitura; memória
 * mexe pouco, mas separa um serviço grande de um pequeno. Log nos dois, senão só o
 * maior consumidor se diferenciaria dos demais.
 */
function weightOf(d) {
  const cpu = Math.min(1, Math.log10(1 + Math.max(0, d.cpu ?? 0)) / 2)
  const mem = Math.min(1, Math.log2(1 + (d.memBytes ?? 0) / (64 * 2 ** 20)) / 4)
  return 0.7 * cpu + 0.3 * mem
}

// O que o consumo faz com o carro. A escolha fica salva neste navegador.
const MODES = {
  rapido: {
    title: 'QUEM MAIS CONSOME', speed: 'mais rápido', front: 'quem mais consome',
    lap: (weight) => 110 * (30 / 110) ** weight, // 110 s sem carga, 30 s no peso máximo
    grid: (weight) => -weight,
  },
  lento: {
    title: 'QUEM MENOS CONSOME', speed: 'mais lento', front: 'quem menos consome',
    lap: (weight) => 45 * 4 ** weight, // 45 s sem carga, 180 s no peso máximo
    grid: (weight) => weight,
  },
}
let mode = 'rapido'
try {
  if (MODES[localStorage.getItem('interlagos-modo')]) mode = localStorage.getItem('interlagos-modo')
} catch {
  // armazenamento bloqueado: fica o padrão
}

const lapTime = (weight) => MODES[mode].lap(weight)
// Sem métrica não há o que classificar: anda no ritmo mais lento do modo e fica atrás dos medidos.
const slowestLap = () => Math.max(lapTime(0), lapTime(1))
const gridKey = (data) => (data.cpu == null ? Infinity : MODES[mode].grid(weightOf(data)))

function addMessage(text) {
  messages.unshift({ at: new Date(), text })
  messages.length = Math.min(messages.length, 3)
  const list = document.getElementById('messages')
  list.replaceChildren(...messages.map((m) => {
    const li = document.createElement('li')
    const time = document.createElement('time')
    time.textContent = m.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const span = document.createElement('span')
    span.textContent = m.text
    li.append(time, span)
    return li
  }))
}

function newCar(name, index) {
  const [code, teamId] = driver(name)
  const car = {
    name, code, team: TEAMS[teamId], index,
    data: { name, up: true },
    dist: -index * 8, s: mod(-index * 8 - 10), lane: index % 2 ? 3.2 : -3.2, laneTarget: index % 2 ? 3.2 : -3.2,
    state: 'run', // run | toBox | inPit | out
    pitDist: 0, boxAt: (170 + (index % 20 + 0.5) * 21) / PIT_LENGTH, // diante da garagem
    pitUntil: 0, pitReason: '', pitCount: 0,
    outAt: null, crashT: 0, crashSide: index % 2 ? 1 : -1, crashSpin: (index % 2 ? 1 : -1) * 0.65,
    speed: 0, weight: null, baseline: null, hot: 0, started: null, x: 0, y: 0, angle: 0,
  }
  cars.set(name, car)
  return car
}

function applyData(services) {
  const pulse = services.pulseOk ? services.pulse : null
  const tel = services.telemetryOk ? services.telemetry : null
  if (pulse) {
    pulseState = 'tailnet'
    host = pulse.host
  } else if (tel) {
    pulseState = 'publica'
    host = { cpu: tel.cpu, ram: tel.ram, temp: tel.temp, disks: [] }
  } else {
    pulseState = services.pulseOk === null && services.telemetryOk === null ? 'esperando' : 'sem-sinal'
  }

  const list = pulse ? pulse.containers : tel ? tel.containers.map((c) => ({ name: c.name, up: c.up, cpu: null })) : null
  renderControl()
  if (!list) return

  // Grid inicial: na ordem do modo escolhido; sem métrica, no fim.
  if (!cars.size) {
    ;[...list].sort((a, b) => gridKey(a) - gridKey(b)).forEach((c, i) => newCar(c.name, i))
    firstAt = performance.now()
    fillSimTargets()
  }

  const fresh = pulse && pulse.generatedAt !== lastPulseAt
  if (pulse) lastPulseAt = pulse.generatedAt

  // Nem todos caem juntos: mais da metade fora é a medição que parou (cadvisor ou Prometheus).
  const seen = new Map(list.map((c) => [c.name, c]))
  const upCount = list.filter((c) => c.up).length
  const measuringBroke = pulse && (upCount < cars.size / 2)
  if (measuringBroke !== telemetryLost) {
    telemetryLost = measuringBroke
    if (telemetryLost) addMessage('Telemetria perdida: a medição parou, não os serviços')
  }

  for (const c of list) if (!cars.has(c.name)) newCar(c.name, cars.size)

  for (const car of cars.values()) {
    const raw = seen.get(car.name)
    const sim = overrides.get(car.name)
    // Um container parado some das métricas depois de alguns minutos: o carro continua no muro.
    const data = { ...(raw ?? { name: car.name, up: pulse ? false : car.data.up }), ...(sim ?? {}) }
    car.data = data
    if (telemetryLost) continue

    if (data.up === false && car.state !== 'out') crash(car)
    if (data.up !== false && car.state === 'out') {
      car.state = 'toBox'
      car.pitReason = 'de volta'
      addMessage(`${car.code} voltou ao ar: segue para o box`)
    }

    if (data.startedAt != null) {
      if (car.started != null && data.startedAt > car.started + 1) sendToBox(car, `reiniciou`)
      car.started = data.startedAt
    }

    if ((fresh || sim) && data.cpu != null && data.up !== false) {
      const warm = firstAt != null && (performance.now() - firstAt) / 1000 > WARMUP_S
      // Normal de cada serviço: média lenta, que ignora o próprio pico enquanto ele dura.
      if (car.baseline == null) car.baseline = data.cpu
      const spiking = data.cpu > Math.max(car.baseline * 3, 5)
      if (!spiking) car.baseline += (data.cpu - car.baseline) * 0.017
      car.hot = spiking && (warm || sim?.cpu != null) ? car.hot + 1 : 0
      if (car.hot >= 2) sendToBox(car, `CPU ${data.cpu.toFixed(0)}%`)
    }
    if (data.memLimitBytes && data.memBytes / data.memLimitBytes > 0.85) sendToBox(car, 'memória no limite')
  }

  // Chuva: o sistema está apelando para o swap, ou a RAM está no limite.
  if (host?.swap != null) {
    const growing = lastSwap != null && host.swap > lastSwap + 0.05
    if (fresh) {
      rain = Math.max(0, Math.min(1, rain + (growing ? 0.25 : -0.02)))
      lastSwap = host.swap
    }
  }
  if (host?.ram > 85) rain = Math.max(rain, 0.6)

  renderFlag()
  renderTower()
}

function needsBox(car) {
  const d = car.data
  if (car.pitReason === 'reiniciou' || car.pitReason === 'de volta') return false
  if (d.memLimitBytes && d.memBytes / d.memLimitBytes > 0.85) return true
  return car.hot >= 2
}

function sendToBox(car, reason) {
  if (car.state === 'out' || car.state === 'toBox' || car.state === 'inPit') return
  car.state = 'toBox'
  car.pitReason = reason
  car.pitCount += reason === 'reiniciou' ? 1 : 0
  addMessage(`${car.code} chamado ao box: ${reason}`)
}

function crash(car) {
  car.state = 'out'
  car.outAt = performance.now()
  car.crashT = 0
  const p = at(car.s)
  const width = car.crashSide > 0 ? p.left : p.right
  car.crashFrom = car.lane
  car.crashTo = car.crashSide * (width + 6)
  addMessage(`${car.code} bateu em ${cornerName(car.s)}: serviço offline`)
}

// ============================================================ quadro a quadro

let lastFrame = performance.now()

function step(dt) {
  tick += dt
  const list = [...cars.values()]
  if (pulseState === 'sem-sinal' || telemetryLost) return // congela: não dá para saber o que está acontecendo

  for (const car of list) {
    const d = car.data
    const noData = d.cpu == null
    const targetWeight = weightOf(d)
    car.weight = car.weight == null ? targetWeight : car.weight + (targetWeight - car.weight) * Math.min(1, dt * 0.6)

    if (car.state === 'out') {
      car.crashT = Math.min(1, car.crashT + dt / 0.7)
      const k = 1 - (1 - car.crashT) ** 3
      car.lane = car.crashFrom + (car.crashTo - car.crashFrom) * k
      placeOnTrack(car)
      car.angle += car.crashSpin * k
      continue
    }

    if (car.state === 'inPit') {
      const target = car.boxAt * PIT_LENGTH
      const waiting = performance.now() < car.pitUntil || needsBox(car) || overrides.get(car.name)?.up === false
      if (car.pitDist >= target - 0.5 && waiting) {
        car.speed = 0
      } else {
        // Limite de velocidade só diante das garagens; o resto do pit lane é a longa saída.
        car.speed = car.pitDist > 600 ? 55 : 22
        if (car.pitDist < target && car.pitDist + car.speed * dt >= target) {
          car.pitDist = target
          car.pitUntil = performance.now() + BOX_MIN_S * 1000
        } else {
          car.pitDist += car.speed * dt
        }
        car.dist += car.speed * dt
      }
      if (car.pitDist >= PIT_LENGTH) {
        car.state = 'run'
        car.pitReason = ''
        car.hot = 0
        car.s = PIT_OUT
        addMessage(`${car.code} voltou à pista`)
      } else {
        const p = pitAt(car.pitDist)
        car.x = p.x
        car.y = p.y
        car.angle = headingOf(p.x, p.y, p.tx, p.ty)
        continue
      }
    }

    const i = Math.floor(mod(car.s) / STEP) % N
    let v = (LENGTH / (noData ? slowestLap() : lapTime(car.weight))) * PACE[i]
    if (car.state === 'toBox') v = Math.max(v, 55 * PACE[i])
    const before = mod(car.s)
    car.s = mod(car.s + v * dt)
    car.dist += v * dt
    car.speed = v

    if (car.state === 'toBox') {
      const crossed = before <= PIT_IN ? before + v * dt >= PIT_IN : before + v * dt - LENGTH >= PIT_IN
      if (crossed) {
        car.state = 'inPit'
        car.pitDist = 0
        continue
      }
    }

    // Ultrapassagem: chegou perto de quem vai à frente, muda de lado.
    let ahead = Infinity
    for (const other of list) {
      if (other === car || other.state === 'inPit' || other.state === 'out') continue
      const gap = mod(other.s - car.s)
      if (gap < ahead && gap < 15 && Math.abs(other.lane - car.lane) < 2.4) ahead = gap
    }
    if (ahead < 15) car.laneTarget = car.laneTarget > 0 ? -3.2 : 3.2
    car.lane += (car.laneTarget - car.lane) * Math.min(1, dt * 1.5)
    placeOnTrack(car)
  }
}

function placeOnTrack(car) {
  const p = at(car.s, car.lane)
  const q = at(car.s + 5, car.lane)
  car.x = p.x
  car.y = p.y
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy) || 1
  car.angle = headingOf(p.x, p.y, dx / len, dy / len)
}

function headingOf(x, y, tx, ty) {
  return Math.atan2(sy(x + tx, y + ty) - sy(x, y), sx(x + tx, y + ty) - sx(x, y))
}

function drawTrail(car) {
  if (car.state !== 'run' && car.state !== 'toBox') return
  const rate = packetRate((car.data.rxBps ?? 0) + (car.data.txBps ?? 0))
  if (rate < 0.2) return
  const length = 12 + rate * 12
  const steps = 7
  ctx.lineCap = 'round'
  for (let i = 0; i < steps; i++) {
    const a = at(car.s - (length * i) / steps - 5, car.lane)
    const b = at(car.s - (length * (i + 1)) / steps - 5, car.lane)
    ctx.strokeStyle = car.team.color
    ctx.globalAlpha = 0.5 * (1 - i / steps)
    ctx.lineWidth = (2.2 - i * 0.2) * view.dpr
    ctx.beginPath()
    ctx.moveTo(sx(a.x, a.y), sy(a.x, a.y))
    ctx.lineTo(sx(b.x, b.y), sy(b.x, b.y))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawCar(car) {
  const noData = car.data.cpu == null && car.state !== 'out'
  const sprite = carSprite(noData ? '#7c8289' : car.team.color)
  const X = sx(car.x, car.y)
  const Y = sy(car.x, car.y)

  // sombra suave no chão
  ctx.save()
  ctx.translate(X + 1.4 * view.dpr, Y + 2 * view.dpr)
  ctx.rotate(car.angle)
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.fillRect(-9 * view.dpr, -3.6 * view.dpr, 18 * view.dpr, 7.2 * view.dpr)
  ctx.restore()

  ctx.save()
  ctx.translate(X, Y)
  ctx.rotate(car.angle)
  ctx.drawImage(sprite.canvas, -sprite.ax, -sprite.ay)
  ctx.restore()

  if (hovered === car) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5 * view.dpr
    ctx.beginPath()
    ctx.arc(X, Y, 15 * view.dpr, 0, Math.PI * 2)
    ctx.stroke()
  }
  return { X, Y }
}

function tag(text, X, Y, bg, fg) {
  ctx.font = `700 ${11 * view.dpr}px Bahnschrift, 'Arial Narrow', sans-serif`
  const w = ctx.measureText(text).width + 10 * view.dpr
  const h = 16 * view.dpr
  const x = Math.round(X - w / 2)
  const y = Math.round(Y - 28 * view.dpr)
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, X, y + h / 2 + view.dpr * 0.5)
}

function drawSmoke(car, X, Y) {
  // Sem animação quando o sistema pede menos movimento: a fumaça fica parada.
  const t = REDUCED ? 0.5 : tick
  for (let i = 0; i < 6; i++) {
    const phase = (t * 0.28 + i / 6) % 1
    const r = (3 + phase * 11) * view.dpr
    ctx.fillStyle = `rgba(215,218,222,${0.42 * (1 - phase)})`
    ctx.beginPath()
    ctx.arc(X + (phase * 12 + Math.sin(i * 2.3) * 3) * view.dpr, Y - phase * 24 * view.dpr, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawCrew(car, X, Y) {
  const a = car.angle
  for (const [fx, fy] of [[9, 9], [-9, 9], [9, -9], [-9, -9], [13, 0], [-13, 0]]) {
    const px = X + (fx * Math.cos(a) - fy * Math.sin(a)) * view.dpr
    const py = Y + (fx * Math.sin(a) + fy * Math.cos(a)) * view.dpr
    ctx.fillStyle = car.team.color
    ctx.beginPath()
    ctx.arc(px, py, 1.9 * view.dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f1c9a5'
    ctx.beginPath()
    ctx.arc(px, py, 0.9 * view.dpr, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawYellowFlags() {
  for (const car of cars.values()) {
    if (car.state !== 'out') continue
    // o setor inteiro fica amarelo, na borda da pista
    for (let s = car.s - 45; s < car.s + 45; s += 5) {
      const a = at(s, -(at(s).right + 1.4))
      const b = at(s + 3, -(at(s).right + 1.4))
      ctx.strokeStyle = '#ffd400'
      ctx.lineWidth = Math.max(2, metres(1)) * 1.1
      ctx.beginPath()
      ctx.moveTo(sx(a.x, a.y), sy(a.x, a.y))
      ctx.lineTo(sx(b.x, b.y), sy(b.x, b.y))
      ctx.stroke()
    }
  }
}

function drawRain() {
  if (rain <= 0.01) return
  ctx.fillStyle = `rgba(24,38,58,${0.22 * rain})`
  ctx.fillRect(0, 0, view.w, view.h)
  if (REDUCED) return
  ctx.strokeStyle = `rgba(210,225,240,${0.28 * rain})`
  ctx.lineWidth = view.dpr
  const count = 170 * rain
  for (let i = 0; i < count; i++) {
    const phase = (tick * 1.7 + i * 0.137) % 1
    const x = ((i * 97.13) % view.w) + phase * 26
    const y = ((i * 53.77 + phase * view.h) % view.h)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 5 * view.dpr, y + 15 * view.dpr)
    ctx.stroke()
  }
}

function frame(now) {
  const dt = Math.min(0.06, (now - lastFrame) / 1000)
  lastFrame = now
  step(dt)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, view.w, view.h)
  drawYellowFlags()
  const ordered = [...cars.values()].sort((a, b) => (a.state === 'out') - (b.state === 'out'))
  for (const car of ordered) drawTrail(car)
  for (const car of ordered) {
    const { X, Y } = drawCar(car)
    if (car.state === 'out') {
      drawSmoke(car, X, Y)
      tag(`${car.code} OUT`, X, Y, '#e10600', '#fff')
    } else if (car.state === 'inPit') {
      if (car.speed === 0) drawCrew(car, X, Y)
      tag(`${car.code} PIT`, X, Y, '#ffd400', '#111')
    } else if (hovered === car || car.state === 'toBox') {
      tag(car.state === 'toBox' ? `${car.code} BOX` : car.code, X, Y, car.state === 'toBox' ? '#ffd400' : '#0d0f12', car.state === 'toBox' ? '#111' : '#fff')
    }
  }
  drawRain()
  // Atualiza voltas e posições sem depender do ritmo do feed.
  if (Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) renderTower()
  requestAnimationFrame(frame)
}

// ============================================================ painéis

const fmtBytes = (b) => (b == null ? '–' : b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GiB` : `${Math.round(b / 2 ** 20)} MiB`)
const fmtRate = (b) => (b == null ? '–' : b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MiB/s` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB/s` : `${Math.round(b)} B/s`)

function setControl(id, value, unit, warn, bad) {
  const el = document.getElementById(id)
  el.textContent = value == null ? '–' : `${Math.round(value)}${unit}`
  el.className = value == null ? '' : value >= bad ? 'bad' : value >= warn ? 'warn' : ''
}

function renderControl() {
  const live = document.getElementById('live')
  const labels = { tailnet: ['AO VIVO', 'live'], publica: ['SEM NAS-PULSE', 'live is-off'], 'sem-sinal': ['SINAL PERDIDO', 'live is-bad'], esperando: ['CONECTANDO', 'live is-off'] }
  const [text, cls] = labels[pulseState]
  live.textContent = text
  live.className = cls
  setControl('c-temp', host?.temp, '°C', 70, 80)
  setControl('c-cpu', host?.cpu, '%', 70, 90)
  setControl('c-ram', host?.ram, '%', 75, 85)
  setControl('c-swap', host?.swap, '%', 50, 80)
  const disk = (m) => host?.disks?.find((d) => d.mount === m)?.usedPercent
  setControl('c-root', disk('/'), '%', 80, 90)
  setControl('c-data', disk('/data'), '%', 80, 90)
  const warming = firstAt != null && (performance.now() - firstAt) / 1000 < WARMUP_S
  const session = document.getElementById('session')
  session.textContent = pulseState === 'publica' ? 'Só telemetria pública: sem CPU por serviço' : warming ? 'Volta de apresentação: aprendendo o normal' : `Corrida · ${cars.size} carros`
}

function renderFlag() {
  const flag = document.getElementById('flag')
  const tunnel = cars.get('cloudflared')
  const outs = [...cars.values()].filter((c) => c.state === 'out')
  let text = null
  let cls = ''
  if (pulseState === 'sem-sinal') {
    text = 'SINAL PERDIDO · SERVIDOR SEM RESPOSTA'
    cls = 'gray'
  } else if (telemetryLost) {
    text = 'TELEMETRIA PERDIDA · CORRIDA CONGELADA'
    cls = 'gray'
  } else if (tunnel?.state === 'out') {
    text = 'BANDEIRA VERMELHA · TÚNEL FORA DO AR'
    cls = 'red'
  } else if (outs.length) {
    text = `BANDEIRA AMARELA · ${outs.map((c) => cornerName(c.s).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}`
    cls = 'yellow'
  }
  flag.hidden = !text
  if (text) {
    flag.textContent = text
    flag.className = `flag ${cls}`
  }
}

const rowsEl = document.getElementById('rows')
const rowEls = new Map()

function rowFor(car) {
  let row = rowEls.get(car.name)
  if (row) return row
  const li = document.createElement('li')
  li.className = 'row'
  const pos = document.createElement('span')
  pos.className = 'pos'
  const strip = document.createElement('span')
  strip.className = 'strip'
  strip.style.background = car.team.color
  const code = document.createElement('span')
  code.className = 'code'
  code.textContent = car.code
  const mem = document.createElement('span')
  mem.className = 'mem'
  const fill = document.createElement('i')
  mem.append(fill)
  code.append(mem)
  const value = document.createElement('span')
  value.className = 'value'
  const laps = document.createElement('span')
  laps.className = 'laps'
  li.append(pos, strip, code, value, laps)
  li.addEventListener('mouseenter', () => {
    hovered = car
    li.classList.add('is-focus')
  })
  li.addEventListener('mouseleave', () => {
    hovered = null
    li.classList.remove('is-focus')
  })
  rowsEl.append(li)
  row = { li, pos, value, laps, fill }
  rowEls.set(car.name, row)
  return row
}

function renderTower() {
  // OUT vai para o fim, como na classificação de verdade.
  const ranked = [...cars.values()].sort((a, b) => (a.state === 'out') - (b.state === 'out') || b.dist - a.dist)
  const height = rowsEl.clientHeight / Math.max(1, ranked.length)
  ranked.forEach((car, i) => {
    const row = rowFor(car)
    const d = car.data
    row.li.style.height = `${height}px`
    row.li.style.transform = `translateY(${Math.round(i * height)}px)`
    row.pos.textContent = String(i + 1)
    const boxing = car.state === 'toBox' || car.state === 'inPit'
    const noData = d.cpu == null && car.state !== 'out'
    row.li.classList.toggle('is-out', car.state === 'out')
    row.li.classList.toggle('is-box', boxing)
    row.li.classList.toggle('is-nodata', noData && !boxing)
    row.value.textContent = car.state === 'out' ? 'OUT' : car.state === 'inPit' ? 'PIT' : car.state === 'toBox' ? 'BOX' : noData ? 'SEM DADOS' : `${d.cpu.toFixed(1)}%`
    row.laps.textContent = String(Math.max(0, Math.floor(car.dist / LENGTH)))
    const memRatio = d.memBytes != null ? Math.min(1, d.memBytes / (d.memLimitBytes ?? 512 * 2 ** 20)) : 0
    row.fill.style.width = `${memRatio * 100}%`
    row.fill.style.background = memRatio > 0.85 ? '#ff5a52' : memRatio > 0.65 ? '#ffd400' : '#cdd2d8'
  })
}

// ---------- modo de corrida ----------

function renderMode() {
  const m = MODES[mode]
  document.getElementById('tower-title').textContent = m.title
  document.getElementById('legend-speed').textContent = m.speed
  document.getElementById('legend-front').textContent = m.front
  for (const key of Object.keys(MODES)) {
    document.getElementById(`mode-${key}`).setAttribute('aria-pressed', String(key === mode))
  }
}

/** Voltas de um modo não comparam com as do outro: troca de modo é nova largada. */
function setMode(next) {
  if (next === mode) return
  mode = next
  try {
    localStorage.setItem('interlagos-modo', mode)
  } catch {
    // sem armazenamento: vale só até recarregar a página
  }
  const ready = [...cars.values()].filter((car) => car.state === 'run').sort((a, b) => gridKey(a.data) - gridKey(b.data))
  ready.forEach((car, i) => {
    car.dist = -i * 8
    car.s = mod(car.dist - 10)
    car.lane = car.laneTarget = i % 2 ? 3.2 : -3.2
    car.weight = null
  })
  // quem está no box ou no muro não volta ao grid, mas também não leva voltas antigas
  for (const car of cars.values()) if (car.state !== 'run') car.dist = -ready.length * 8
  addMessage(`Nova largada: quem mais consome anda ${MODES[mode].speed}`)
  renderMode()
  renderTower()
}

for (const key of Object.keys(MODES)) {
  document.getElementById(`mode-${key}`).addEventListener('click', () => setMode(key))
}

// ---------- dica ----------

const tip = document.getElementById('tip')

function carAt(mx, my) {
  let best = null
  let dist = 16 * view.dpr
  for (const car of cars.values()) {
    const d = Math.hypot(sx(car.x, car.y) - mx, sy(car.x, car.y) - my)
    if (d < dist) {
      dist = d
      best = car
    }
  }
  return best
}

raceCanvas.addEventListener('mousemove', (event) => {
  const rect = raceCanvas.getBoundingClientRect()
  const car = carAt((event.clientX - rect.left) * view.dpr, (event.clientY - rect.top) * view.dpr)
  hovered = car
  if (!car) {
    tip.hidden = true
    return
  }
  const d = car.data
  const lines = [car.team.name]
  if (car.state === 'out') lines.push(`Offline · bateu em ${cornerName(car.s)}`)
  else if (car.state === 'toBox' || car.state === 'inPit') lines.push(`No box: ${car.pitReason}`)
  if (d.cpu != null) {
    lines.push(`CPU ${d.cpu.toFixed(1)}% de um núcleo`)
    lines.push(`Memória ${fmtBytes(d.memBytes)}${d.memLimitBytes ? ` de ${fmtBytes(d.memLimitBytes)}` : ''}`)
    lines.push(`Rede ↓ ${fmtRate(d.rxBps)} · ↑ ${fmtRate(d.txBps)}`)
  } else if (car.state !== 'out') lines.push('Sem métricas neste container')
  lines.push(`${Math.max(0, Math.floor(car.dist / LENGTH))} voltas · ${car.pitCount} reinícios na sessão`)
  const title = document.createElement('b')
  title.textContent = car.name
  tip.replaceChildren(title, ...lines.map((text) => {
    const span = document.createElement('span')
    span.textContent = text
    return span
  }))
  tip.style.borderLeftColor = car.team.color
  tip.style.left = `${Math.min(event.clientX - rect.left + 14, rect.width - 290)}px`
  tip.style.top = `${Math.min(event.clientY - rect.top + 14, rect.height - 130)}px`
  tip.hidden = false
})
raceCanvas.addEventListener('mouseleave', () => {
  hovered = null
  tip.hidden = true
})

// ---------- simulação ----------

function fillSimTargets() {
  const select = document.getElementById('sim-target')
  select.replaceChildren(...[...cars.values()].sort((a, b) => a.name.localeCompare(b.name)).map((car) => {
    const option = document.createElement('option')
    option.value = car.name
    option.textContent = car.name
    return option
  }))
}

const simTarget = () => document.getElementById('sim-target').value

document.getElementById('sim-restart').addEventListener('click', () => {
  const car = cars.get(simTarget())
  if (!car) return
  sendToBox(car, 'reiniciou')
  addMessage(`Simulação: ${car.code} reiniciou`)
})
document.getElementById('sim-cpu').addEventListener('click', () => {
  const name = simTarget()
  const car = cars.get(name)
  if (!car) return
  overrides.set(name, { cpu: 95 })
  car.hot = 2
  sendToBox(car, 'CPU 95%')
  car.data = { ...car.data, cpu: 95 }
})
document.getElementById('sim-off').addEventListener('click', () => {
  const name = simTarget()
  const car = cars.get(name)
  if (!car) return
  overrides.set(name, { up: false })
  car.data = { ...car.data, up: false }
  if (car.state === 'inPit') car.state = 'run'
  crash(car)
  renderFlag()
})
document.getElementById('sim-clear').addEventListener('click', () => {
  const name = simTarget()
  overrides.delete(name)
  const car = cars.get(name)
  if (car) car.hot = 0
})

// ============================================================ conexão

function connect() {
  const source = new EventSource('/events')
  source.onmessage = (message) => {
    try {
      applyData(JSON.parse(message.data).services)
    } catch (error) {
      console.error(error)
    }
  }
  source.onerror = () => {
    pulseState = 'sem-sinal'
    renderControl()
    renderFlag()
  }
}

new ResizeObserver(() => {
  layout()
  renderTower()
}).observe(stage)
layout()
renderMode()
addMessage('Sessão iniciada: carros no grid')
connect()
requestAnimationFrame(frame)
