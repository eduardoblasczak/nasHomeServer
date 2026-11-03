// O autódromo em dia de GP: onde ficam arquibancadas, boxes, barreiras e estruturas temporárias.
// As permanentes vêm do OpenStreetMap ou da vista aérea. As temporárias são ilustrativas. Sem
// desenho aqui: a corrida também usa a posição das barreiras para saber onde um carro bate.

import { at, mod, N, P, PIT, pitAt, STEP } from './circuit.js'
import { E1, M, NE, Nn, RUNOFF, S, SE } from './surfaces.js'

// ------------------------------------------------------------------ prédio dos boxes

// Parede oeste recuada 6 m em relação à planta: vista do alto, a cobertura esconderia as paradas.
const WEST_NORTH = [-228.2, -222.5]
const WEST_SOUTH = [-160.2, -491.5]
export const PIT_BUILDING = {
  outline: [WEST_SOUTH, [-115, -480], [-188, -196], [-204, -200], [-211, -201], [-207, -217], WEST_NORTH],
  west: [WEST_NORTH, WEST_SOUTH],
  across: [0.969, 0.245], // direção de oeste para leste
}

export const CONTROL_TOWER = [[-202, -218], [-224, -224], [-227, -212], [-230, -212], [-237, -182], [-210, -174], [-204, -200], [-211, -201]]

/** Paddock: a grande cobertura em arcos do lado leste do pátio (planta do OpenStreetMap). */
export const PADDOCK_CENTER = [-76, -198]

/** Plantas que o GP desenha do seu jeito e a cidade não deve repetir. */
export const REPLACED = [[-194, -279], [-221, -203], [-76, -198], [-134, -587]]

// ------------------------------------------------------------------ arquibancadas

/** Caminho paralelo à pista. `side` -1 é por fora (direita do percurso); +1, por dentro. */
const trackPath = (s0, s1, offset, step = 15, side = -1) => {
  const out = []
  for (let s = s0; s <= s1 + 0.1; s += step) {
    const p = at(s)
    const o = typeof offset === 'function' ? offset(s, p) : offset
    const q = at(s, side * ((side > 0 ? p.left : p.right) + o))
    out.push([q.x, q.y])
  }
  return out
}

// `back: 'left'` significa que o fundo fica à esquerda do sentido de `front`.
export const STANDS = [
  // Arquibancada A, coberta, de frente para a reta (plantas do OpenStreetMap)
  { id: 'A1', front: [[-206, -500], [-243, -343]], depth: 21, rows: 25, seat: '#2c5fa0', roof: { from: 0.32, brand: 'NASRACE', tint: '#e6e6e0' } },
  { id: 'A2', front: [[-244, -330], [-257, -274]], depth: 22, rows: 25, seat: '#2c5fa0', roof: { from: 0.4, tint: '#dcdcd6' } },
  { id: 'A3', front: [[-264, -253], [-288, -157]], depth: 15, rows: 17, seat: '#2c5fa0', roof: { from: 0.35, tint: '#dcdcd6' } },
  // Setores abertos de concreto, com os assentos azuis, de frente para a Subida dos Boxes
  { id: 'G', front: trackPath(3700, 4105, (s) => 9 + Math.max(0, 4040 - s) * 0.004, 15).reverse(), depth: 15, rows: 17, seat: '#2a55a0', aisle: '#d9b93a', base: 1.4 },
  { id: 'H', front: trackPath(4120, 4215, 9.5, 15).reverse(), depth: 12, rows: 13, seat: '#8d8f90', base: 1.4 },
  // Temporárias por fora do S do Senna
  { id: 'S1', front: [[-213, -530], [-199, -548], [-186, -562], [-171, -575], [-156, -586], [-139, -597], [-122, -604]].reverse(), depth: 15, rows: 17, seat: '#7c8388', temporary: true },
  { id: 'S2', front: [[-22, -558], [18, -566], [58, -568], [100, -560], [142, -545]], depth: 11, rows: 13, seat: '#a33a30', temporary: true, flip: true, roof: { from: 0.1, tint: '#d9dcdf' } },
  // Temporária na Curva do Sol, por fora da pista
  { id: 'SOL', front: trackPath(690, 835, 56, 12).reverse(), depth: 11, rows: 13, seat: '#3a6f8e', temporary: true, base: 1.6, roof: { from: 0.2, tint: '#e2e4e6' } },
  // Temporária por dentro da Junção, de frente para a câmera
  { id: 'JN', front: trackPath(3035, 3140, 14, 12, 1), depth: 11, rows: 13, seat: '#8a3f3a', temporary: true, base: 1.6, roof: { from: 0.42, tint: '#dfe1e4' } },
]

// ------------------------------------------------------------------ estruturas soltas

const fromRuler = (fn, X, Y) => {
  const [x, y] = fn(X, Y)
  return { x, y }
}

/** Mastros brancos do pátio: dez, como na vista aérea. */
export const MASTS = [
  fromRuler(S, 1135, 125), fromRuler(S, 1215, 165), fromRuler(S, 1000, 280), fromRuler(S, 1080, 320), fromRuler(S, 1160, 355), fromRuler(S, 1240, 395),
  fromRuler(S, 1335, 655), fromRuler(M, 1228, 628), fromRuler(M, 1250, 910), fromRuler(M, 1132, 1062),
]

/** Tendas brancas: x, y, comprimento, largura, ângulo do lado comprido (rad), cor. */
const tent = (fn, X, Y, length, width, angle, color = '#eceded') => ({ ...fromRuler(fn, X, Y), length, width, angle, color })
export const TENTS = [
  // ao longo da estrada de serviço, por fora do Sol
  tent(SE, 960, 320, 46, 12, 1.2), tent(SE, 1005, 420, 26, 13, 1.25), tent(SE, 1020, 395, 13, 11, 1.25, '#dfe0e0'),
  tent(SE, 935, 225, 14, 10, 1.25, '#233f9e'), tent(SE, 905, 290, 14, 9, 1.25, '#1e2a5c'), tent(SE, 1140, 290, 44, 18, -0.08),
  tent(SE, 1040, 305, 15, 9, 0.2, '#dfe0e0'),
  // pátio do paddock
  tent(E1, 385, 880, 44, 11, 0.86), tent(S, 840, 560, 14, 10, 1.45, '#e8e8e8'), tent(S, 1252, 490, 12, 12, 0.8, '#e8e8e8'),
  // grandes tendas de hospitalidade, sobre as placas de asfalto
  tent(M, 1480, 285, 42, 25, 0.42), tent(M, 1360, 300, 30, 20, 0.42), tent(E1, 475, 575, 40, 26, 1.25), tent(S, 1268, 605, 34, 20, 0.42),
  tent(S, 1388, 605, 32, 18, 0.42), tent(S, 1310, 722, 32, 15, 0.3),
  tent(E1, 322, 1045, 12, 12, 0.3, '#e8e8e8'), tent(E1, 1200, 655, 18, 12, 1.2, '#e8e8e8'),
  // pátio norte, atrás do Café
  tent(NE, 1190, 560, 24, 9, 1.0), tent(NE, 1230, 500, 18, 9, 1.0), tent(NE, 1275, 430, 20, 9, 1.05), tent(NE, 1330, 370, 16, 9, 1.05),
  tent(Nn, 1660, 270, 24, 10, 1.3), tent(Nn, 1640, 330, 12, 9, 1.3, '#dfe0e0'),
]

/** Áreas de hospitalidade das equipes, atrás dos boxes: unidades de vidro com a cor da equipe. */
export const HOSPITALITY = (() => {
  const teams = ['draft', 'nextcloud', 'finance', 'portfolio', 'voalberto', 'monitor', 'infra']
  const out = []
  // fileira paralela à parede leste dos boxes
  const a = fromRuler(S, 865, 500), b = fromRuler(S, 1160, 640)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  teams.forEach((team, i) => {
    const t = (i + 0.5) / teams.length
    out.push({ team, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, length: 12.5, width: 9, height: 7, angle })
  })
  return out
})()

/** Caminhões das equipes, em fileira no pátio. */
export const TRUCKS = (() => {
  const teams = ['draft', 'nextcloud', 'finance', 'portfolio', 'voalberto', 'monitor', 'infra']
  const out = []
  const a = fromRuler(S, 905, 455), b = fromRuler(S, 1120, 560)
  const dir = Math.atan2(b.y - a.y, b.x - a.x)
  const span = Math.hypot(b.x - a.x, b.y - a.y)
  const nx = -Math.sin(dir), ny = Math.cos(dir)
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14
    out.push({ team: teams[Math.floor(i / 2) % teams.length], x: a.x + Math.cos(dir) * span * t + nx * 2, y: a.y + Math.sin(dir) * span * t + ny * 2, angle: dir + Math.PI / 2 })
  }
  return out
})()

/** Carros estacionados por fora do Sol, como na vista aérea: fileiras irregulares. */
export const PARKING = [
  { from: fromRuler(SE, 860, 420), to: fromRuler(SE, 760, 590), rows: 2 },
  { from: fromRuler(SE, 830, 500), to: fromRuler(SE, 790, 610), rows: 1 },
  { from: fromRuler(SE, 950, 480), to: fromRuler(SE, 1040, 520), rows: 2 },
  { from: fromRuler(SE, 900, 600), to: fromRuler(SE, 960, 720), rows: 2 },
  { from: fromRuler(SE, 1090, 300), to: fromRuler(SE, 1190, 300), rows: 1 },
]

const station = (s, side, extra) => {
  const p = at(s)
  const q = at(s, side * ((side > 0 ? p.left : p.right) + extra))
  return { x: q.x, y: q.y }
}

/** Torres de TV: fora da barreira, onde a câmera enxerga a freada. */
export const TV_TOWERS = [
  { ...station(330, -1, 26), h: 15 }, { ...station(900, -1, 16), h: 12 }, { ...station(1400, -1, 22), h: 15 }, { ...station(1800, 1, 18), h: 12 },
  { ...station(2240, -1, 14), h: 13 }, { ...station(2620, 1, 16), h: 12 }, { ...station(3040, 1, 30), h: 14 }, { ...station(3640, -1, 18), h: 15 },
]

/** Telões: de frente para a câmera, com o lado claro virado para o público. */
export const SCREENS = [
  { x: -296, y: -256, w: 25, h: 14, top: 31, facing: 0.25 }, // atrás da arquibancada A
  { ...station(620, -1, 34), w: 18, h: 10, top: 18, facing: 0.5 }, // S do Senna, por fora
  { ...station(3160, 1, 36), w: 18, h: 10, top: 18, facing: -0.3 }, // ao lado da arquibancada da Junção
]

/** Pórticos e passarelas sobre a pista: estação, altura, marca. */
export const GANTRIES = [
  { s: 0, height: 7.2, brand: 'NASRACE' },
  { s: 305, height: 6.4, brand: 'DRAFT', bridge: true }, // passarela antes do S do Senna
  { s: 1012, height: 6.4, brand: 'FINANCE', bridge: true }, // passarela da Reta Oposta
  { s: 1830, height: 6, brand: 'SERVER' },
  { s: 3560, height: 6, brand: 'PULSE' },
]

// ------------------------------------------------------------------ barreiras

const pointIn = (points, x, y) => {
  let c = false
  for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
    const [xa, ya] = points[a]
    const [xb, yb] = points[b]
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c
  }
  return c
}

const pointInStrip = (front, depth, x, y) => {
  for (let i = 0; i < front.length - 1; i++) {
    const [ax, ay] = front[i]
    const [bx, by] = front[i + 1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = ((x - ax) * dx + (y - ay) * dy) / len2
    if (t < 0 || t > 1) continue
    const px = ax + dx * t, py = ay + dy * t
    if (Math.hypot(x - px, y - py) < depth) return true
  }
  return false
}

const VERGE = 5.2 // grama mínima além da zebra

/**
 * Traçado das barreiras: para cada estação, marcha da borda da pista para fora até sair da área de
 * escape. Uma arquibancada ou o pit lane no caminho encurtam a marcha. Depois de suavizar, a
 * barreira contorna as áreas de escape sem serrilhado.
 */
function computeBarrier(side) {
  const raw = new Float32Array(N)
  const on = new Uint8Array(N)
  const zones = RUNOFF.map((z) => z.points)
  for (let i = 0; i < N; i++) {
    const p = P[i]
    const edge = side > 0 ? p.left : p.right
    const nx = -p.ty * side, ny = p.tx * side
    let inside = 0
    let wall = Infinity
    for (let d = 1.5; d < 110; d += 1.5) {
      const x = p.x + nx * (edge + d), y = p.y + ny * (edge + d)
      if (zones.some((poly) => pointIn(poly, x, y))) inside = d
      else if (inside && d - inside > 8) break
      else if (!inside && d > 20) break
      if (STANDS.some((st) => pointInStrip(st.front, 1.5, x, y))) {
        wall = Math.min(wall, d - 2)
        break
      }
    }
    raw[i] = edge + Math.max(1.6, Math.min(wall, inside ? Math.max(VERGE, inside + 1.4) : VERGE))
    on[i] = 1
  }
  // fecha os dentes: máximo local e depois média
  const closed = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let m = 0
    for (let j = -3; j <= 3; j++) m = Math.max(m, raw[(i + j + N) % N])
    closed[i] = m
  }
  const out = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let sum = 0
    for (let j = -3; j <= 3; j++) sum += closed[(i + j + N) % N]
    out[i] = sum / 7
  }
  return { offset: out, on }
}

const pitIndex = (() => {
  // distância até o pit lane por estação: à esquerda da pista, ele manda na barreira
  const nearest = new Float32Array(N).fill(1e9)
  for (let k = 0; k < PIT.length; k += 2) {
    const q = PIT[k]
    for (let i = 0; i < N; i++) {
      const d = (P[i].x - q.x) ** 2 + (P[i].y - q.y) ** 2
      if (d < nearest[i]) nearest[i] = d
    }
  }
  return nearest.map(Math.sqrt)
})()

export const BARRIER = {
  left: computeBarrier(1),
  right: computeBarrier(-1),
}

// Pit lane à esquerda: a barreira vira a mureta dos boxes, ou some onde as duas pistas se juntam.
export const PIT_WALL = new Uint8Array(N)
for (let i = 0; i < N; i++) {
  const gap = pitIndex[i] - P[i].left - 5
  if (pitIndex[i] < 48) {
    if (gap < 2.2) BARRIER.left.on[i] = 0
    else if (gap < 42) {
      BARRIER.left.offset[i] = P[i].left + Math.min(gap * 0.5, 3.4)
      PIT_WALL[i] = 1
    }
  }
}

/** Distância do eixo até a barreira, para a corrida saber onde o carro bate. `side` > 0: esquerda. */
export function barrierAt(s, side) {
  const f = mod(s) / STEP
  const i = Math.floor(f) % N
  const k = f - Math.floor(f)
  const b = side > 0 ? BARRIER.left.offset : BARRIER.right.offset
  return b[i] + (b[(i + 1) % N] - b[i]) * k
}

export const garagePoint = (d, lateral = 0) => {
  const p = pitAt(d)
  return { x: p.x - p.ty * lateral, y: p.y + p.tx * lateral, z: p.z, tx: p.tx, ty: p.ty }
}
