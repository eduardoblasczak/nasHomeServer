// Modelo do carro, gerado por código para não depender de arquivo de terceiros. Medidas de um F1
// atual, em metros: frente em +X, altura em +Y e o lado direito do piloto em +Z.
// Cada vértice diz de que é feito em `aPaint`: cor da equipe, segunda cor, cinza fixo e rugosidade.

import { THREE } from './common.js'

const TEAM = [1, 0, 0, 0.2]
const ACCENT = [0, 1, 0, 0.24]
const CARBON = [0, 0, 0.022, 0.42]
const BLACK = [0, 0, 0.007, 0.62]
const WHITE = [0, 0, 0.72, 0.3]
const GLOW = [0, 0, 0.5, 0.4]

export class MeshParts {
  constructor() {
    this.position = []
    this.normal = []
    this.paint = []
    this.index = []
  }

  /** Malha de anéis: lados lisos e tampas planas, para as bordas continuarem marcadas. */
  loft(rings, paint, { capStart = true, capEnd = true, capPaint = null } = {}) {
    const R = rings.length, C = rings[0].length
    // volume assinado: garante que a face aponta para fora, seja qual for o sentido dos anéis
    let cx = 0, cy = 0, cz = 0
    for (const ring of rings) for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2] }
    const count = R * C
    cx /= count; cy /= count; cz /= count
    let volume = 0
    const tri = (a, b, c) => {
      const ax = a[0] - cx, ay = a[1] - cy, az = a[2] - cz
      const bx = b[0] - cx, by = b[1] - cy, bz = b[2] - cz
      const dx = c[0] - cx, dy = c[1] - cy, dz = c[2] - cz
      volume += ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx)
    }
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C; c++) {
        const a = rings[r][c], b = rings[r][(c + 1) % C], d = rings[r + 1][(c + 1) % C], e = rings[r + 1][c]
        tri(a, d, b)
        tri(a, e, d)
      }
    }
    const flip = volume < 0

    const base = this.position.length / 3
    const normals = new Float32Array(count * 3)
    const pts = rings.flat()
    const addFace = (ia, ib, ic) => {
      const [a, b, c] = flip ? [ia, ic, ib] : [ia, ib, ic]
      this.index.push(base + a, base + b, base + c)
      const pa = pts[a], pb = pts[b], pc = pts[c]
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2]
      const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      for (const k of [a, b, c]) {
        normals[k * 3] += nx
        normals[k * 3 + 1] += ny
        normals[k * 3 + 2] += nz
      }
    }
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C; c++) {
        const a = r * C + c, b = r * C + (c + 1) % C, d = (r + 1) * C + (c + 1) % C, e = (r + 1) * C + c
        addFace(a, d, b)
        addFace(a, e, d)
      }
    }
    for (let k = 0; k < count; k++) {
      const p = pts[k]
      const l = Math.hypot(normals[k * 3], normals[k * 3 + 1], normals[k * 3 + 2]) || 1
      this.position.push(p[0], p[1], p[2])
      this.normal.push(normals[k * 3] / l, normals[k * 3 + 1] / l, normals[k * 3 + 2] / l)
      const v = typeof paint === 'function' ? paint(p) : paint
      this.paint.push(v[0], v[1], v[2], v[3])
    }
    if (capStart) this.cap(rings[0], capPaint ?? paint, flip, false)
    if (capEnd) this.cap(rings[R - 1], capPaint ?? paint, flip, true)
  }

  cap(ring, paint, flip, end) {
    const base = this.position.length / 3
    let cx = 0, cy = 0, cz = 0
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2] }
    cx /= ring.length; cy /= ring.length; cz /= ring.length
    const a = ring[0], b = ring[Math.floor(ring.length / 3)], c = ring[Math.floor((2 * ring.length) / 3)]
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    const sign = (end ? 1 : -1) * (flip ? 1 : -1)
    nx = (nx / l) * -sign; ny = (ny / l) * -sign; nz = (nz / l) * -sign
    const put = (p) => {
      this.position.push(p[0], p[1], p[2])
      this.normal.push(nx, ny, nz)
      const v = typeof paint === 'function' ? paint(p) : paint
      this.paint.push(v[0], v[1], v[2], v[3])
    }
    put([cx, cy, cz])
    for (const p of ring) put(p)
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length
      if (sign < 0) this.index.push(base, base + 1 + i, base + 1 + j)
      else this.index.push(base, base + 1 + j, base + 1 + i)
    }
  }

  /** Placa fina a partir de um contorno 2D. `toWorld(u, v, w)` diz onde cada ponto cai. */
  plate(outline, toWorld, thickness, paint) {
    const ringA = outline.map(([u, v]) => toWorld(u, v, -thickness / 2))
    const ringB = outline.map(([u, v]) => toWorld(u, v, thickness / 2))
    this.loft([ringA, ringB], paint)
  }

  /** Tubo por uma lista de pontos. */
  tube(points, radius, paint, sides = 6) {
    const rings = []
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl; ty /= tl; tz /= tl
      const rx = Math.abs(ty) > 0.9 ? 1 : 0, ry = Math.abs(ty) > 0.9 ? 0 : 1
      let ux = ty * 0 - tz * ry, uy = tz * rx - tx * 0, uz = tx * ry - ty * rx
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul; uy /= ul; uz /= ul
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux
      const ring = []
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2
        const c = Math.cos(t) * radius, s = Math.sin(t) * radius
        ring.push([p[0] + ux * c + vx * s, p[1] + uy * c + vy * s, p[2] + uz * c + vz * s])
      }
      rings.push(ring)
    }
    this.loft(rings, paint)
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3))
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(this.paint, 4))
    g.setIndex(this.index)
    return g
  }
}

/** Seção de carroceria: superelipse, com a parte de baixo mais recolhida. */
function section(x, hw, yb, yt, { z0 = 0, power = 2.5, under = 0.9, points = 18 } = {}) {
  const ring = []
  const yc = (yb + yt) / 2, hh = (yt - yb) / 2
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    const c = Math.cos(t), s = Math.sin(t)
    const z = Math.sign(c) * Math.abs(c) ** (2 / power) * hw * (s < 0 ? under : 1)
    const y = Math.sign(s) * Math.abs(s) ** (2 / power) * hh
    ring.push([x, yc + y, z0 + z])
  }
  return ring
}

const lerpTable = (table, x) => {
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i], b = table[i + 1]
    if (x <= a[0] && x >= b[0]) {
      const t = (a[0] - x) / (a[0] - b[0])
      const u = t * t * (3 - 2 * t)
      return a.map((v, k) => v + (b[k] - v) * (k === 0 ? t : (t + u) / 2))
    }
  }
  return x > table[0][0] ? table[0] : table[table.length - 1]
}

/** Asa: lâmina de seção fina, com a corda e a altura variando ao longo da envergadura. */
function wing(parts, span, spanPoints, shape, paint) {
  const rings = []
  for (let i = 0; i <= spanPoints; i++) {
    const z = -span + (2 * span * i) / spanPoints
    const { x, y, chord, thick, angle = 0 } = shape(z)
    const ca = Math.cos(angle), sa = Math.sin(angle)
    const foil = [[0, 0], [0.12, thick * 0.55], [0.45, thick * 0.65], [1, 0.0005], [0.45, -thick * 0.2], [0.12, -thick * 0.35]]
    rings.push(foil.map(([u, v]) => {
      // u vai do bordo de ataque para trás
      const du = -u * chord
      return [x + du * ca - v * sa, y + du * sa + v * ca, z]
    }))
  }
  parts.loft(rings, paint)
}

export function buildCarBody() {
  const parts = new MeshParts()

  // --------- assoalho, com a borda recortada e o difusor atrás
  const floor = [
    [1.02, 0.24], [0.74, 0.5], [0.28, 0.7], [-0.4, 0.76], [-1.05, 0.76], [-1.36, 0.62], [-1.42, 0.3], [-1.42, -0.3], [-1.36, -0.62], [-1.05, -0.76], [-0.4, -0.76], [0.28, -0.7], [0.74, -0.5], [1.02, -0.24],
  ]
  parts.plate(floor, (u, v, w) => [u, 0.07 + w, v], 0.03, CARBON)
  for (const z of [-0.72, 0.72]) parts.plate([[0.3, 0], [-1.3, 0], [-1.3, 0.1], [0.3, 0.04]], (u, v, w) => [u, 0.07 + v, z + w], 0.012, CARBON)
  parts.loft([section(-1.36, 0.5, 0.06, 0.18, { power: 4 }), section(-1.76, 0.48, 0.2, 0.36, { power: 4 })], CARBON)

  // --------- bico, célula de sobrevivência e tampa do motor: uma só peça
  const SPINE = [
    // x, meia largura, base, topo
    [2.64, 0.058, 0.135, 0.178], [2.42, 0.078, 0.125, 0.215], [2.08, 0.112, 0.118, 0.285], [1.7, 0.155, 0.112, 0.38],
    [1.3, 0.215, 0.105, 0.5], [0.92, 0.285, 0.1, 0.6], [0.58, 0.335, 0.1, 0.655], [0.2, 0.375, 0.1, 0.665],
    [-0.12, 0.4, 0.1, 0.76], [-0.34, 0.41, 0.1, 0.96], [-0.56, 0.375, 0.1, 0.95], [-0.92, 0.3, 0.1, 0.82],
    [-1.3, 0.215, 0.11, 0.64], [-1.66, 0.15, 0.13, 0.5], [-1.98, 0.095, 0.17, 0.4], [-2.2, 0.05, 0.22, 0.33],
  ]
  const spine = []
  for (let x = 2.64; x >= -2.2; x -= 0.16) {
    const [, hw, yb, yt] = lerpTable(SPINE, x)
    spine.push(section(x, hw, yb, yt, { power: x > 1.2 ? 2.2 : 2.7, under: 0.88 }))
  }
  parts.loft(spine, TEAM, { capPaint: ACCENT })

  // --------- pontões
  const POD = [
    // x, z central, meia largura, base, topo
    [0.36, 0.585, 0.2, 0.15, 0.5], [0.1, 0.58, 0.23, 0.13, 0.565], [-0.28, 0.555, 0.25, 0.12, 0.565], [-0.7, 0.51, 0.25, 0.12, 0.47],
    [-1.06, 0.45, 0.23, 0.12, 0.36], [-1.36, 0.36, 0.17, 0.12, 0.26], [-1.6, 0.27, 0.09, 0.13, 0.2],
  ]
  for (const side of [-1, 1]) {
    const rings = []
    for (let x = 0.36; x >= -1.6; x -= 0.14) {
      const [, zc, hw, yb, yt] = lerpTable(POD, x)
      rings.push(section(x, hw, yb, yt, { z0: side * zc, power: 3, under: 0.72, points: 14 }))
    }
    parts.loft(rings, TEAM, { capPaint: BLACK })
    // defletor na frente do pontão
    parts.plate([[0.74, 0.08], [0.36, 0.08], [0.36, 0.5], [0.58, 0.4]], (u, v, w) => [u, v, side * (0.78 + w)], 0.012, CARBON)
  }

  // --------- barbatana sobre a tampa do motor
  parts.plate([[-0.5, 0.92], [-1.95, 0.62], [-1.98, 0.42], [-1.0, 0.72], [-0.5, 0.86]], (u, v, w) => [u, v, w], 0.012, TEAM)

  // --------- cockpit: encosto, capacete, halo e câmera
  parts.loft([section(-0.1, 0.22, 0.66, 0.74, { power: 3 }), section(-0.32, 0.17, 0.68, 0.86, { power: 3 })], ACCENT)
  const helmet = []
  for (let i = 0; i <= 7; i++) {
    const a = -Math.PI / 2 + (i / 7) * Math.PI
    const r = Math.cos(a) * 0.112
    const ring = []
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2
      ring.push([0.1 + Math.sin(a) * 0.125, 0.725 + Math.cos(t) * r, Math.sin(t) * r])
    }
    helmet.push(ring)
  }
  parts.loft(helmet, (p) => (p[0] > 0.17 && p[1] > 0.7 ? BLACK : ACCENT))

  const halo = (side) => {
    const out = []
    for (let i = 0; i <= 9; i++) {
      const t = i / 9
      const x = -0.2 + 0.74 * t
      const z = side * 0.245 * Math.cos((t * t * Math.PI) / 2)
      const y = 0.68 + 0.13 * Math.sin(t * Math.PI * 0.55)
      out.push([x, y, z])
    }
    return out
  }
  parts.tube(halo(1), 0.024, CARBON)
  parts.tube(halo(-1), 0.024, CARBON)
  parts.tube([[0.54, 0.79, 0], [0.6, 0.72, 0], [0.68, 0.63, 0]], 0.028, CARBON)
  parts.loft([section(-0.06, 0.05, 0.92, 0.98, { power: 3, points: 8 }), section(-0.42, 0.04, 0.95, 1.0, { power: 3, points: 8 })], BLACK)

  // --------- espelhos
  for (const side of [-1, 1]) {
    parts.tube([[0.3, 0.58, side * 0.34], [0.3, 0.64, side * 0.5]], 0.012, CARBON, 4)
    parts.loft([section(0.32, 0.075, 0.62, 0.69, { z0: side * 0.54, power: 3, points: 8 }), section(0.26, 0.07, 0.625, 0.685, { z0: side * 0.54, power: 3, points: 8 })], TEAM)
  }

  // --------- asa dianteira: quatro lâminas curvas, descendo para os lados
  const front = (i) => (z) => {
    const a = Math.abs(z)
    const lift = 0.09 + 0.022 * i + 0.09 * Math.min(1, a / 0.95) ** 2 * (i + 1) * 0.42
    const sweep = 0.23 * Math.min(1, a / 0.95) ** 1.4
    return { x: 2.74 - sweep - i * 0.1, y: lift - 0.04 * Math.max(0, 0.22 - a) * 3, chord: 0.2 - i * 0.022, thick: 0.03, angle: -0.08 - i * 0.2 }
  }
  for (let i = 0; i < 4; i++) wing(parts, 0.93, 14, front(i), i === 0 ? CARBON : i === 3 ? ACCENT : TEAM)
  for (const side of [-1, 1]) {
    parts.plate([[2.82, 0.05], [2.34, 0.05], [2.28, 0.26], [2.5, 0.31], [2.82, 0.2]], (u, v, w) => [u, v, side * (0.94 + w)], 0.016, TEAM)
    parts.plate([[2.56, 0.12], [2.2, 0.13], [2.2, 0.2], [2.5, 0.2]], (u, v, w) => [u, v, side * (0.085 + w)], 0.012, CARBON)
  }

  // --------- asa traseira: plano, abertura do DRS, placas laterais e pilone
  const rear = (x0, y0, chord, angle, spoon) => (z) => ({
    x: x0,
    y: y0 - spoon * (Math.abs(z) / 0.5) ** 2,
    chord,
    thick: 0.045,
    angle,
  })
  wing(parts, 0.5, 8, rear(-2.2, 0.885, 0.3, -0.2, -0.04), ACCENT)
  wing(parts, 0.5, 8, rear(-2.47, 0.97, 0.17, -0.62, -0.03), TEAM)
  wing(parts, 0.42, 6, rear(-2.14, 0.47, 0.2, -0.24, 0), CARBON)
  for (const side of [-1, 1]) {
    parts.plate([[-2.12, 0.38], [-2.68, 0.38], [-2.74, 1.04], [-2.2, 1.0]], (u, v, w) => [u, v, side * (0.51 + w)], 0.018, TEAM)
  }
  parts.plate([[-2.05, 0.3], [-2.26, 0.3], [-2.42, 0.86], [-2.3, 0.86]], (u, v, w) => [u, v, w], 0.022, CARBON)
  parts.loft([section(-2.6, 0.03, 0.39, 0.45, { power: 3, points: 8 }), section(-2.66, 0.03, 0.39, 0.45, { power: 3, points: 8 })], GLOW)

  // --------- suspensão e dutos de freio
  const arm = (inner, outer) => parts.tube([inner, outer], 0.013, CARBON, 4)
  for (const side of [-1, 1]) {
    const fz = side * 0.68, rz = side * 0.62
    arm([1.98, 0.4, side * 0.12], [1.74, 0.47, fz])
    arm([1.42, 0.45, side * 0.2], [1.72, 0.47, fz])
    arm([2.02, 0.2, side * 0.1], [1.72, 0.22, fz])
    arm([1.36, 0.2, side * 0.2], [1.72, 0.22, fz])
    arm([1.86, 0.42, side * 0.14], [1.74, 0.24, side * 0.6])
    arm([-1.3, 0.44, side * 0.2], [-1.66, 0.5, rz])
    arm([-1.94, 0.42, side * 0.08], [-1.68, 0.5, rz])
    arm([-1.2, 0.2, side * 0.26], [-1.66, 0.22, rz])
    arm([-1.98, 0.22, side * 0.1], [-1.68, 0.22, rz])
    parts.loft([section(1.72, 0.12, 0.12, 0.6, { z0: fz + side * 0.04, power: 3, points: 10 }).map((p) => [p[0] + 0.14, p[1], p[2]]), section(1.72, 0.12, 0.12, 0.6, { z0: fz + side * 0.04, power: 3, points: 10 }).map((p) => [p[0] - 0.14, p[1], p[2]])], BLACK)
    parts.loft([section(-1.68, 0.1, 0.12, 0.6, { z0: rz + side * 0.03, power: 3, points: 10 }).map((p) => [p[0] + 0.15, p[1], p[2]]), section(-1.68, 0.1, 0.12, 0.6, { z0: rz + side * 0.03, power: 3, points: 10 }).map((p) => [p[0] - 0.15, p[1], p[2]])], BLACK)
  }
  return parts.geometry()
}

/** Roda: eixo em z, centro na origem, raio 0,36 m e meia largura 0,18 m. Gira inteira, com os raios. */
export function buildWheel() {
  const positions = []
  const normals = []
  const colors = []
  const R = 0.36, W = 0.18
  const RIM = 0.235
  const SEG = 28
  const push = (p, n, c) => {
    positions.push(p[0], p[1], p[2])
    normals.push(n[0], n[1], n[2])
    colors.push(c[0], c[1], c[2])
  }
  const profile = [
    // raio, z, normal radial, normal lateral, cinza
    [RIM, W * 0.9, 0.1, 1, 0.012], [R - 0.05, W * 0.98, 0.2, 1, 0.014], [R - 0.012, W * 0.82, 0.8, 0.6, 0.012], [R, W * 0.55, 1, 0, 0.01], [R, -W * 0.55, 1, 0, 0.01],
    [R - 0.012, -W * 0.82, 0.8, -0.6, 0.012], [R - 0.05, -W * 0.98, 0.2, -1, 0.014], [RIM, -W * 0.9, 0.1, -1, 0.012],
  ]
  const index = []
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2
    for (const [r, z, nr, nz, g] of profile) {
      const l = Math.hypot(nr, nz)
      push([Math.cos(a) * r, Math.sin(a) * r, z], [(Math.cos(a) * nr) / l, (Math.sin(a) * nr) / l, nz / l], [g, g, g])
    }
  }
  const P = profile.length
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG
    for (let k = 0; k < P - 1; k++) {
      const a = i * P + k, b = j * P + k, c = j * P + k + 1, d = i * P + k + 1
      index.push(a, b, c, a, c, d)
    }
  }
  // faixa clara no flanco, e a face do aro com raios alternados: é o que mostra a rotação
  const disc = (side) => {
    const z = side * W * 0.84
    const start = positions.length / 3
    const SPOKES = 10
    const SUB = SPOKES * 3
    const n = [0, 0, side]
    push([0, 0, z], n, [0.9, 0.9, 0.9])
    for (let i = 0; i <= SUB; i++) {
      const a = (i / SUB) * Math.PI * 2
      const spoke = Math.floor((i / SUB) * SPOKES) % 2 === 0
      const g = spoke ? 0.5 : 0.06
      push([Math.cos(a) * 0.075, Math.sin(a) * 0.075, z], n, [0.3, 0.3, 0.3])
      push([Math.cos(a) * RIM * 0.86, Math.sin(a) * RIM * 0.86, z], n, [g, g, g])
      push([Math.cos(a) * RIM, Math.sin(a) * RIM, z + side * 0.004], n, [1, 1, 1])
    }
    for (let i = 0; i < SUB; i++) {
      const a = start + 1 + i * 3
      const b = a + 3
      const tri = (x, y, w) => (side > 0 ? index.push(x, y, w) : index.push(x, w, y))
      tri(start, a, b)
      tri(a, a + 1, b + 1)
      tri(a, b + 1, b)
      tri(a + 1, a + 2, b + 2)
      tri(a + 1, b + 2, b + 1)
    }
    // anel claro do pneu
    const ring = positions.length / 3
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2
      const lift = side * 0.002
      push([Math.cos(a) * (R - 0.085), Math.sin(a) * (R - 0.085), side * W * 0.965 + lift], n, [0.2, 0.2, 0.2])
      push([Math.cos(a) * (R - 0.066), Math.sin(a) * (R - 0.066), side * W * 0.985 + lift], n, [0.2, 0.2, 0.2])
    }
    for (let i = 0; i < SEG; i++) {
      const a = ring + i * 2, b = a + 2
      if (side > 0) index.push(a, b, b + 1, a, b + 1, a + 1)
      else index.push(a, b + 1, b, a, a + 1, b + 1)
    }
  }
  disc(1)
  disc(-1)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.setIndex(index)
  return g
}

/** Mecânico: de macacão na cor da equipe, com capacete. Pés em y = 0, frente em +X. */
export function buildCrew() {
  const parts = new MeshParts()
  const SUIT = [1, 0, 0, 0.7]
  const DARK = [0, 0, 0.03, 0.8]
  const lathe = (points, x, z, paint, sides = 8) => {
    const rings = points.map(([r, y]) => {
      const ring = []
      for (let k = 0; k < sides; k++) {
        const t = (k / sides) * Math.PI * 2
        ring.push([x + Math.cos(t) * r, y, z + Math.sin(t) * r])
      }
      return ring
    })
    parts.loft(rings, paint)
  }
  for (const z of [-0.1, 0.1]) lathe([[0.075, 0], [0.085, 0.45], [0.1, 0.86]], 0, z, DARK, 6)
  lathe([[0.17, 0.82], [0.2, 1.05], [0.21, 1.38], [0.13, 1.48]], 0, 0, SUIT)
  for (const side of [-1, 1]) parts.tube([[0, 1.38, side * 0.23], [0.1, 1.08, side * 0.27], [0.32, 0.98, side * 0.2]], 0.05, SUIT, 5)
  const helmet = []
  for (let i = 0; i <= 5; i++) helmet.push([Math.sin((i / 5) * Math.PI) * 0.125, 1.52 + (i / 5) * 0.26])
  lathe(helmet.map(([r, y]) => [Math.max(r, 0.005), y]), 0, 0, WHITE)
  return parts.geometry()
}

/** Destroço: lasca de fibra de carbono, um tetraedro achatado. */
export function buildShard() {
  const g = new THREE.BufferGeometry()
  const a = [0.5, 0, 0], b = [-0.4, 0.02, 0.35], c = [-0.25, 0, -0.4], d = [0.05, 0.18, 0.02]
  const tris = [a, b, d, b, c, d, c, a, d, a, c, b]
  const position = []
  for (const p of tris) position.push(p[0], p[1], p[2])
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  g.computeVertexNormals()
  return g
}
