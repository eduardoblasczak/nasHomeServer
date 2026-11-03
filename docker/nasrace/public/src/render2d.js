// Versão 2D de reserva: entra quando não há WebGL2, ou com ?modo=2d na URL. Mesmos dados e mesma
// corrida da versão 3D, desenhados em canvas 2D, sem relevo e sem luz.

import { at, CIRCUIT, GARAGES, LENGTH, mod, nearestStation, P, PIT, pitAt, PIT_LENGTH, STEP } from './circuit.js'
import { packetRate, race, step, TEAMS } from './race.js'
import { focus, showTip } from './ui.js'

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const DEBUG = new URLSearchParams(location.search).has('debug')
const N = P.length
let layers = null
let tick = 0
let hovered = null
let stage, trackCanvas, raceCanvas, tctx, ctx

// ============================================================ câmera

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

  for (const { pts: f } of layers.grass) {
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
  for (const { pts: w } of layers.water) {
    trace(g, flatPts(w), true)
    g.fillStyle = '#31617a'
    g.fill()
    g.strokeStyle = 'rgba(190,225,235,0.32)'
    g.lineWidth = Math.max(1, metres(1.5))
    g.stroke()
  }
  paintBuildings(g)

  for (const { pts: k } of layers.kart) {
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
  for (const { pts: f } of layers.forest) {
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
  for (const { pts: b } of layers.buildings) {
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
  for (const { pts: s } of layers.stands) {
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
const GARAGE_T0 = GARAGES.from / PIT_LENGTH
const GARAGE_T1 = GARAGES.to / PIT_LENGTH

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
  for (const car of race.cars.values()) {
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
  const rain = race.rain
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


/** Direção do carro em pixels: o mundo tem y para o norte, a tela tem y para baixo. */
function screenAngle(car) {
  return Math.atan2(sy(car.x + Math.cos(car.heading), car.y + Math.sin(car.heading)) - sy(car.x, car.y), sx(car.x + Math.cos(car.heading), car.y + Math.sin(car.heading)) - sx(car.x, car.y))
}

let lastFrame = performance.now()

function frame(now) {
  const dt = Math.min(0.06, (now - lastFrame) / 1000)
  lastFrame = now
  tick += dt
  step(dt)
  for (const car of race.cars.values()) car.angle = screenAngle(car)
  hovered = focus.car ?? focus.hover ?? null
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, view.w, view.h)
  drawYellowFlags()
  const ordered = [...race.cars.values()].sort((a, b) => (a.state === 'out') - (b.state === 'out'))
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
  requestAnimationFrame(frame)
}

function carAt(mx, my) {
  let best = null
  let dist = 16 * view.dpr
  for (const car of race.cars.values()) {
    const d = Math.hypot(sx(car.x, car.y) - mx, sy(car.x, car.y) - my)
    if (d < dist) {
      dist = d
      best = car
    }
  }
  return best
}

export function startRenderer2D({ stage: stageEl, geo }) {
  stage = stageEl
  layers = geo.layers
  trackCanvas = document.getElementById('track')
  raceCanvas = document.getElementById('race')
  raceCanvas.hidden = false
  tctx = trackCanvas.getContext('2d')
  ctx = raceCanvas.getContext('2d')
  raceCanvas.addEventListener('mousemove', (event) => {
    const rect = raceCanvas.getBoundingClientRect()
    const car = carAt((event.clientX - rect.left) * view.dpr, (event.clientY - rect.top) * view.dpr)
    focus.hover = car
    showTip(car, event.clientX - rect.left, event.clientY - rect.top, rect)
  })
  raceCanvas.addEventListener('mouseleave', () => {
    focus.hover = null
    showTip(null)
  })
  new ResizeObserver(layout).observe(stage)
  layout()
  requestAnimationFrame(frame)
}

void CIRCUIT
void LENGTH
void mod
