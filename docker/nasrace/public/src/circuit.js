// Geometria do circuito: traçado medido, altitude, pit lane, nomes das curvas e linha de
// corrida. Sem desenho e sem estado: serve à corrida e aos dois renderizadores.

import { CIRCUIT } from './circuit-data.js'

export { CIRCUIT }

export const N = CIRCUIT.track.length
export const LENGTH = CIRCUIT.length
export const STEP = LENGTH / N

/** x, y em metros locais (y para o norte), z = altitude, right/left = meia largura. */
export const P = CIRCUIT.track.map(([x, y, right, left, z]) => ({ x, y, z, right, left, tx: 0, ty: 0, curve: 0 }))

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

export const mod = (s) => ((s % LENGTH) + LENGTH) % LENGTH

/** Ponto a `d` metros do eixo da pista. d > 0 = esquerda do sentido de percurso. */
export function at(s, d = 0) {
  const f = mod(s) / STEP
  const i = Math.floor(f) % N
  const k = f - Math.floor(f)
  const a = P[i]
  const b = P[(i + 1) % N]
  const tx = a.tx + (b.tx - a.tx) * k
  const ty = a.ty + (b.ty - a.ty) * k
  const len = Math.hypot(tx, ty) || 1
  return {
    x: a.x + (b.x - a.x) * k - (ty / len) * d,
    y: a.y + (b.y - a.y) * k + (tx / len) * d,
    z: a.z + (b.z - a.z) * k,
    tx: tx / len,
    ty: ty / len,
    left: a.left + (b.left - a.left) * k,
    right: a.right + (b.right - a.right) * k,
    curve: a.curve + (b.curve - a.curve) * k,
  }
}

// Perfil de velocidade de um carro de verdade: limite de aderência em cada curva, freada forte e
// curta antes dela, aceleração que perde força conforme a velocidade sobe. A média é normalizada,
// para o tempo de volta medido continuar valendo: o perfil só decide onde ele ganha e perde tempo.
export const PACE = (() => {
  const GRIP = 30, BRAKE = 42, ENGINE = 14, TOP = 94
  const v = P.map((_, i) => {
    let c = 1e-4
    for (let j = -2; j <= 2; j++) c = Math.max(c, Math.abs(P[(i + j + N) % N].curve))
    return Math.min(TOP, Math.sqrt(GRIP / c))
  })
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < N * 2; k++) {
      const i = k % N, j = (k + 1) % N
      const a = ENGINE * (1 - v[i] / (TOP * 1.12))
      v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * a * STEP))
    }
    for (let k = N * 2; k > 0; k--) {
      const i = k % N, j = (k - 1 + N) % N
      v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * BRAKE * STEP))
    }
  }
  const smooth = v.map((_, i) => (v[(i - 1 + N) % N] + 2 * v[i] + v[(i + 1) % N]) / 4)
  const harmonic = smooth.reduce((sum, value) => sum + 1 / value, 0) / N
  return smooth.map((value) => value * harmonic)
})()

/** Ritmo relativo numa posição da pista, sem degrau entre as estações. */
export function paceAt(s) {
  const f = mod(s) / STEP
  const i = Math.floor(f) % N
  const k = f - Math.floor(f)
  return PACE[i] + (PACE[(i + 1) % N] - PACE[i]) * k
}

/**
 * Linha de corrida: deslocamento lateral em cada ponto, por minimização de curvatura com a
 * largura real como limite. A borracha da pista e os carros usam a mesma linha, então o
 * escurecimento aparece por dentro das curvas, onde eles passam de fato.
 */
export const RACING_LINE = (() => {
  const off = new Float64Array(N)
  const margin = 1.8
  const K = 3 // estêncil de 15 m: enxerga a curva inteira, não só o ponto vizinho
  const px = (i) => P[i].x - P[i].ty * off[i]
  const py = (i) => P[i].y + P[i].tx * off[i]
  for (let iter = 0; iter < 600; iter++) {
    for (let i = 0; i < N; i++) {
      const a1 = (i - K + N) % N, b1 = (i + K) % N, a2 = (i - 2 * K + N) % N, b2 = (i + 2 * K) % N
      // média de quarta ordem: pega o caminho de menor flexão, e não o de menor distância
      const tx = (4 * (px(a1) + px(b1)) - (px(a2) + px(b2))) / 6
      const ty = (4 * (py(a1) + py(b1)) - (py(a2) + py(b2))) / 6
      const dx = tx - px(i), dy = ty - py(i)
      const delta = dx * -P[i].ty + dy * P[i].tx
      off[i] = Math.max(-(P[i].right - margin), Math.min(P[i].left - margin, off[i] + delta * 0.55))
    }
  }
  const out = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    let sum = 0
    for (let j = -3; j <= 3; j++) sum += off[(i + j + N) % N]
    out[i] = sum / 7
  }
  return out
})()

export function racingOffset(s) {
  const f = mod(s) / STEP
  const i = Math.floor(f) % N
  const k = f - Math.floor(f)
  return RACING_LINE[i] + (RACING_LINE[(i + 1) % N] - RACING_LINE[i]) * k
}

// ------------------------------------------------------------------ pit lane

function resamplePit(raw, spacing) {
  const pts = raw.map(([x, y, z]) => ({ x, y, z }))
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
  const dense = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)]
    const n = Math.max(1, Math.round(Math.hypot(c.x - b.x, c.y - b.y) / 1.5))
    for (let k = 0; k < n; k++) {
      const t = k / n
      dense.push({ x: cr(a.x, b.x, c.x, d.x, t), y: cr(a.y, b.y, c.y, d.y, t), z: b.z + (c.z - b.z) * t })
    }
  }
  dense.push(pts[pts.length - 1])
  const out = [dense[0]]
  let acc = 0
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y)
    if (acc >= spacing) {
      out.push(dense[i])
      acc = 0
    }
  }
  return out
}

/** O pit lane do OpenStreetMap tem cantos: reamostrado em curva suave, de 3 em 3 m. */
export const PIT = resamplePit(CIRCUIT.pit, 3)

// A altitude do pit lane vem de outra fonte que a da pista. Lado a lado, sobrava um degrau de mais
// de 1 m entre as duas: onde ele corre colado à pista, segue a altitude dela.
{
  const wanted = PIT.map((p) => {
    let best = 0
    let dist = Infinity
    for (let i = 0; i < N; i++) {
      const d = (P[i].x - p.x) ** 2 + (P[i].y - p.y) ** 2
      if (d < dist) {
        dist = d
        best = i
      }
    }
    const k = Math.min(1, Math.max(0, (Math.sqrt(dist) - 30) / 35))
    return P[best].z - 0.08 + (p.z - P[best].z + 0.08) * k
  })
  PIT.forEach((p, i) => {
    let sum = 0, count = 0
    for (let j = -8; j <= 8; j++) {
      const v = wanted[i + j]
      if (v !== undefined) {
        sum += v
        count++
      }
    }
    p.z = sum / count
  })
}

export const nearestStation = (p) => {
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

export const PIT_IN = nearestStation(PIT[0])
export const PIT_OUT = nearestStation(PIT[PIT.length - 1])

const pitCum = [0]
for (let i = 1; i < PIT.length; i++) pitCum.push(pitCum[i - 1] + Math.hypot(PIT[i].x - PIT[i - 1].x, PIT[i].y - PIT[i - 1].y))
export const PIT_LENGTH = pitCum[pitCum.length - 1]

/** Trecho do pit lane diante do prédio dos boxes, em metros desde a entrada. */
export const GARAGES = { from: 390, to: 680, slots: 24 }

/** Centro de cada box, em metros de pit lane. */
export const garageCenter = (slot) => GARAGES.from + 6 + ((slot + 0.5) * (GARAGES.to - GARAGES.from - 12)) / GARAGES.slots

export function pitAt(dist) {
  const d = Math.max(0, Math.min(PIT_LENGTH, dist))
  let lo = 1
  let hi = pitCum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pitCum[mid] < d) lo = mid + 1
    else hi = mid
  }
  const a = PIT[lo - 1]
  const b = PIT[lo]
  const seg = pitCum[lo] - pitCum[lo - 1] || 1
  const k = (d - pitCum[lo - 1]) / seg
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    tx: (b.x - a.x) / seg,
    ty: (b.y - a.y) / seg,
  }
}

export function cornerName(s) {
  const i = mod(s) / STEP
  let name = CIRCUIT.corners[CIRCUIT.corners.length - 1].name
  for (const c of CIRCUIT.corners) if (c.i <= i) name = c.name
  return name
}

// ------------------------------------------------------------------ entorno

const NAMES = Object.keys(CIRCUIT.layers)

/** Carrega relevo e camadas. Cada camada: [{ prop, pts: Float32Array [x, y, x, y, ...] }]. */
export async function loadGeo() {
  const [surroundings, terrain] = await Promise.all([
    fetch(new URL('./surroundings.bin', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./terrain.bin', import.meta.url)).then((r) => r.arrayBuffer()),
  ])
  const ints = new Int16Array(surroundings)
  const layers = {}
  for (const name of NAMES) {
    const { offset, count } = CIRCUIT.layers[name]
    let p = offset
    const list = []
    for (let n = 0; n < count; n++) {
      const npts = ints[p++]
      const prop = ints[p++] / 10
      const pts = new Float32Array(npts * 2)
      for (let i = 0; i < npts * 2; i++) pts[i] = ints[p++] / 10
      list.push({ prop, pts })
    }
    layers[name] = list
  }
  return { layers, heights: new Int16Array(terrain) }
}
