// Arquibancadas: degraus com cadeiras, escadas, saídas de público, cobertura em balanço e, por trás,
// concreto ou andaime. As pessoas saem à parte (people.js): daqui vai só a lista de onde elas ficam.

import { TEAMS } from '../race.js'
import { BRAND, boardSeed } from './brands.js'
import { FINISH, rgb, shade } from './kit.js'

const W = (p, h) => [p[0], h, -p[1]]
const RISE = 0.47
const SEAT_WIDTH = 0.52
const AISLE_WIDTH = 1.5
const STEEL = rgb('#7c8187')
const DARK = rgb('#17191c')
const CONCRETE = rgb('#9c9a91')
const STEP = rgb('#b3b0a6')
const NOSING = rgb('#d6b02c')

/** Geometria de uma arquibancada: onde cai cada fileira, em metros ao longo da frente. */
function layout(stand, field) {
  // O fundo fica à esquerda do sentido de `front`: as faces apontam para cima e para a pista.
  const front = stand.flip ? [...stand.front].reverse() : stand.front
  const n = front.length
  const normals = front.map((p, i) => {
    const a = front[Math.max(0, i - 1)], b = front[Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [-dy / len, dx / len]
  })
  const lengths = [0]
  for (let i = 0; i < n - 1; i++) lengths.push(lengths[i] + Math.hypot(front[i + 1][0] - front[i][0], front[i + 1][1] - front[i][1]))
  const rows = stand.rows
  const rowD = stand.depth / rows
  // Quem acompanha uma ladeira sobe com ela: uma altura só deixaria as fileiras enterradas na ponta alta.
  const raw = front.map((p) => field.heightAt(p[0], p[1]) - 0.5)
  const ground = raw.map((_, i) => {
    let sum = 0, count = 0
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) {
      sum += raw[k]
      count++
    }
    return Math.max(raw[i], sum / count)
  })
  const base = stand.base ?? 2.2
  const point = (i, row) => [front[i][0] + normals[i][0] * row * rowD, front[i][1] + normals[i][1] * row * rowD]
  const total = lengths[n - 1]
  const locate = (t) => {
    const clamped = Math.max(0, Math.min(total, t))
    let i = 0
    while (i < n - 2 && lengths[i + 1] < clamped) i++
    return [i, (clamped - lengths[i]) / (lengths[i + 1] - lengths[i] || 1)]
  }
  /** Ponto a `t` metros da ponta, na fileira `row` (pode ser fração). */
  const pointAt = (t, row) => {
    const [i, k] = locate(t)
    const a = point(i, row), b = point(i + 1, row)
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
  }
  const groundAt = (t) => {
    const [i, k] = locate(t)
    return ground[i] + (ground[i + 1] - ground[i]) * k
  }
  return {
    front, n, normals, lengths, rows, rowD, ground, point, pointAt, groundAt, total,
    /** Altura do degrau `row` na ponta `i` da frente. */
    Y: (i, row) => ground[i] + base + row * RISE,
    /** O mesmo, a `t` metros. */
    YT: (t, row) => groundAt(t) + base + row * RISE,
    top: (i) => ground[i] + base + rows * RISE,
    base,
  }
}

/** Escada do corredor: dois degraus por fileira, com a borda pintada. */
function addAisle(kit, s, t, simple) {
  const w = AISLE_WIDTH / 2
  const lift = 0.02
  for (let r = 0; r < s.rows; r++) {
    const y0 = s.YT(t - w, r) + lift, y1 = s.YT(t + w, r) + lift
    const a0 = s.pointAt(t - w, r), b0 = s.pointAt(t + w, r)
    const a2 = s.pointAt(t - w, r + 1), b2 = s.pointAt(t + w, r + 1)
    if (simple) {
      kit.quad(W(a0, y0), W(b0, y1), W(b2, y1), W(a2, y0), STEP, FINISH.PLAIN)
      continue
    }
    const a1 = s.pointAt(t - w, r + 0.5), b1 = s.pointAt(t + w, r + 0.5)
    const half = RISE / 2
    const dark = shade(STEP, 0.7)
    kit.quad(W(a0, y0), W(b0, y1), W(b1, y1), W(a1, y0), STEP, FINISH.PLAIN)
    kit.quad(W(a1, y0), W(b1, y1), W(b1, y1 + half), W(a1, y0 + half), dark)
    kit.quad(W(a1, y0 + half), W(b1, y1 + half), W(b2, y1 + half), W(a2, y0 + half), STEP, FINISH.PLAIN)
    kit.quad(W(a2, y0 + half), W(b2, y1 + half), W(b2, y1 + RISE), W(a2, y0 + RISE), dark)
    // borda de cada degrau, para ninguém tropeçar
    const a3 = s.pointAt(t - w, r + 0.09), b3 = s.pointAt(t + w, r + 0.09)
    kit.quad(W(a0, y0 + 0.006), W(b0, y1 + 0.006), W(b3, y1 + 0.006), W(a3, y0 + 0.006), NOSING)
  }
}

/** Saída de público: um bloco de concreto no meio dos degraus, com a boca escura para a pista. */
function addPortal(kit, s, t, row, rows, simple) {
  const w = 1.7
  const yFloor = s.YT(t, row)
  const yTop = s.YT(t, row + rows) + 0.12
  const a = s.pointAt(t - w, row), b = s.pointAt(t + w, row)
  const c = s.pointAt(t + w, row + rows), d = s.pointAt(t - w, row + rows)
  kit.quad(W(a, yTop), W(b, yTop), W(c, yTop), W(d, yTop), CONCRETE, FINISH.CONCRETE, [[0, 0], [2 * w, 0], [2 * w, 3], [0, 3]], 0.2)
  const uvFront = [[0, 0], [2 * w, 0], [2 * w, yTop - yFloor], [0, yTop - yFloor]]
  kit.quad(W(a, yFloor), W(b, yFloor), W(b, yTop), W(a, yTop), CONCRETE, FINISH.CONCRETE, uvFront, 0.4)
  // boca, um pouco à frente da parede
  const m0 = s.pointAt(t - w * 0.72, row - 0.02), m1 = s.pointAt(t + w * 0.72, row - 0.02)
  kit.quad(W(m0, yFloor), W(m1, yFloor), W(m1, yFloor + 2.1), W(m0, yFloor + 2.1), DARK)
  // laterais
  kit.quad(W(d, yFloor), W(a, yFloor), W(a, yTop), W(d, yTop), shade(CONCRETE, 0.8), FINISH.CONCRETE, uvFront, 0.5)
  kit.quad(W(b, yFloor), W(c, yFloor), W(c, yTop), W(b, yTop), shade(CONCRETE, 0.8), FINISH.CONCRETE, uvFront, 0.6)
  if (simple) return
  // guarda-corpo em volta do topo
  const rail = yTop + 0.95
  for (const [p, q] of [[a, b], [b, c], [d, a]]) kit.bar(W(p, rail), W(q, rail), 0.022, STEEL, { sides: 3 })
  for (const p of [a, b, c, d]) kit.bar(W(p, yTop), W(p, rail), 0.022, STEEL, { sides: 3 })
}

/** Cobertura: chapa inclinada presa em colunas atrás da arquibancada, com treliças em balanço. */
function addRoof(kit, stand, s, seed, aisles, simple) {
  const { roof } = stand
  const fromRow = s.rows * roof.from
  const backRow = s.rows + 0.8
  const yBack = (i) => s.top(i) + 3.4
  const yFront = (i) => s.top(i) + 4.4
  const tint = rgb(roof.tint)
  const under = rgb('#3b3d40')
  const brandSeed = boardSeed(BRAND[roof.brand ?? (stand.temporary ? 'SERVER' : 'NASRACE')])
  for (let i = 0; i < s.n - 1; i++) {
    const j = i + 1
    const a = s.point(i, fromRow), b = s.point(j, fromRow), c = s.point(j, backRow), d = s.point(i, backRow)
    const u0 = s.lengths[i], u1 = s.lengths[j]
    const fi = yFront(i), fj = yFront(j), bi = yBack(i), bj = yBack(j)
    kit.quad(W(a, fi), W(b, fj), W(c, bj), W(d, bi), tint, FINISH.METAL, [[u0, 0], [u1, 0], [u1, stand.depth], [u0, stand.depth]], seed)
    kit.quad(W(d, bi - 0.3), W(c, bj - 0.3), W(b, fj - 0.3), W(a, fi - 0.3), under)
    // beiral com patrocínio, e a calha acima dele
    const rep = Math.max(0.5, Math.round(((u1 - u0) / 9) * 2) / 2)
    kit.quad(W(a, fi - 1.15), W(b, fj - 1.15), W(b, fj - 0.02), W(a, fi - 0.02), rgb('#ffffff'), FINISH.BOARD, [[0, 0], [rep, 0], [rep, 1], [0, 1]], brandSeed)
    kit.quad(W(a, fi - 0.02), W(b, fj - 0.02), W(b, fj + 0.1), W(a, fi + 0.1), rgb('#d9d9d4'))
    kit.quad(W(b, fj - 1.15), W(a, fi - 1.15), W(a, fi - 0.3), W(b, fj - 0.3), under)
    // fundo do telhado: fecha a vista de quem olha por trás
    kit.quad(W(c, bj - 0.3), W(d, bi - 0.3), W(d, bi), W(c, bj), rgb('#8d8e8c'))
  }
  // Colunas e treliças a cada 12 m. A coluna fica atrás da arquibancada, sem atrapalhar a vista.
  const bay = stand.temporary ? 9 : 12
  const steps = Math.max(1, Math.round(s.total / bay))
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * s.total
    const back = s.pointAt(t, backRow - 0.2)
    const tip = s.pointAt(t, fromRow + 0.2)
    const y = s.YT(t, s.rows)
    const high = y + 3.4, low0 = y + 4.4
    kit.bar(W(back, s.groundAt(t)), W(back, high - 0.3), stand.temporary ? 0.12 : 0.24, STEEL)
    if (simple) continue
    // banzo de cima, de baixo e as diagonais entre eles
    const along = (f) => [back[0] + (tip[0] - back[0]) * f, back[1] + (tip[1] - back[1]) * f]
    const yTop = (f) => high - 0.32 + (low0 - high) * f
    const yLow = (f) => yTop(f) - 1.5 * (1 - f)
    kit.bar(W(back, yTop(0)), W(tip, yTop(1)), 0.07, STEEL)
    kit.bar(W(back, yLow(0)), W(tip, yLow(0.98)), 0.07, STEEL)
    for (let w = 0; w < 5; w++) {
      const f0 = w / 5, f1 = (w + 1) / 5
      kit.bar(W(along(f0), yLow(f0)), W(along(f1), yTop(f1)), 0.04, STEEL, { sides: 3 })
    }
  }
  // Em tenda provisória, poucos postes na frente, sempre sobre as escadas.
  if (stand.temporary) {
    for (const t of aisles) {
      const p = s.pointAt(t, fromRow + 0.2)
      kit.bar(W(p, s.YT(t, fromRow)), W(p, s.YT(t, s.rows) + 3.3), 0.08, STEEL)
    }
  }
  if (roof.brand) {
    // letreiro pintado no telhado, para ser lido pela câmera: direção norte, com o topo a oeste
    const mid = s.rows * (roof.from + 1) * 0.5 + 0.4
    const a = s.point(0, mid), b = s.point(s.n - 1, mid)
    const north = b[1] > a[1]
    const start = north ? a : b, end = north ? b : a
    const len = Math.hypot(end[0] - start[0], end[1] - start[1])
    const across = [-(end[1] - start[1]) / len, (end[0] - start[0]) / len]
    const width = Math.min(stand.depth * (1 - roof.from) * 0.78, len / 8)
    const nrm = s.normals[0]
    const ux = (s.front[s.n - 1][0] - s.front[0][0]) / s.total, uy = (s.front[s.n - 1][1] - s.front[0][1]) / s.total
    const yOf = (p) => {
      const dx = p[0] - s.front[0][0], dy = p[1] - s.front[0][1]
      const f = ((dx * nrm[0] + dy * nrm[1]) / s.rowD - fromRow) / (backRow - fromRow)
      return s.YT(dx * ux + dy * uy, s.rows) + 4.4 - f + 0.06
    }
    const repeat = Math.max(1, Math.round((len / (width * 8)) * 2)) / 2
    const corner = (p, k) => [p[0] + (across[0] * width * k) / 2, p[1] + (across[1] * width * k) / 2]
    const pa = corner(start, -1), pb = corner(end, -1), pc = corner(end, 1), pd = corner(start, 1)
    kit.quad(W(pa, yOf(pa)), W(pb, yOf(pb)), W(pc, yOf(pc)), W(pd, yOf(pd)), tint, FINISH.ROOFMARK, [[0, 0], [repeat, 0], [repeat, 1], [0, 1]], boardSeed(BRAND[roof.brand]))
  }
}

/** Passeio atrás da arquibancada, com quiosques e gente circulando. */
function addConcourse(kit, s, field, stand, out, rand, simple) {
  const ROW = (m) => s.rows + m / s.rowD
  const width = 6
  const tint = rgb('#8f8d85')
  const count = Math.max(1, Math.round(s.total / 8))
  const lift = 0.1
  const h = (p) => field.heightAt(p[0], p[1]) + lift
  for (let k = 0; k < count; k++) {
    const t0 = (k / count) * s.total, t1 = ((k + 1) / count) * s.total
    const a = s.pointAt(t0, ROW(0)), b = s.pointAt(t1, ROW(0)), c = s.pointAt(t1, ROW(width)), d = s.pointAt(t0, ROW(width))
    kit.quad(W(a, h(a)), W(b, h(b)), W(c, h(c)), W(d, h(d)), tint, FINISH.CONCRETE, [[t0, 0], [t1, 0], [t1, width], [t0, width]], 0.3)
  }
  // quiosques: cobertura colorida, balcão e gente na fila
  const colors = ['#c9352b', '#e8b21f', '#1f6fb5', '#2c8a4b', '#e2e2dc']
  const every = stand.temporary ? 42 : 34
  for (let t = every / 2; t < s.total; t += every) {
    const p = s.pointAt(t, ROW(4.4)), q = s.pointAt(t + 1, ROW(4.4))
    if (out.blocked(p[0], p[1])) continue
    const angle = Math.atan2(q[1] - p[1], q[0] - p[0])
    const y = h(p)
    const color = rgb(colors[Math.floor(rand() * colors.length)])
    kit.box(p[0], y, -p[1], 4, 2.3, 2.6, angle, rgb('#d8d8d2'), { top: color, topFinish: FINISH.PLAIN })
    kit.box(p[0], y + 2.3, -p[1], 4.8, 0.14, 3.4, angle, color)
    if (simple) continue
    const nx = q[1] - p[1], ny = -(q[0] - p[0])
    for (let k = 0; k < 7; k++) {
      const d = 2.4 + k * 0.7 + rand() * 0.2
      const x = p[0] - nx * d + (q[0] - p[0]) * (rand() - 0.5) * 2, y2 = p[1] - ny * d + (q[1] - p[1]) * (rand() - 0.5) * 2
      out.onFoot(x, y2, Math.atan2(ny, nx) + (rand() - 0.5) * 0.6, { lift })
    }
  }
  // quem anda no passeio vai e volta num trecho reto
  const walkers = Math.round(s.total * (simple ? 0.05 : 0.14))
  for (let k = 0; k < walkers; k++) {
    const t = rand() * s.total
    const span = 8 + rand() * 24
    const row = ROW(0.6 + rand() * 2)
    const p = s.pointAt(t, row), q = s.pointAt(Math.min(s.total, t + span), row)
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (len < 2) continue
    out.onFoot(p[0], p[1], Math.atan2(q[1] - p[1], q[0] - p[0]), { path: len, speed: 0.9 + rand() * 0.7, lift })
  }
}

export function addStand(kit, field, stand, rand, out, { simple = false } = {}) {
  const s = layout(stand, field)
  for (let i = 0; i < s.n - 1; i++) out.mark([...s.point(i, 0), ...s.point(i + 1, 0), ...s.point(i + 1, s.rows), ...s.point(i, s.rows)])
  const seat = rgb(stand.seat)
  const seed = rand()
  const riser = rgb(stand.temporary ? '#62666b' : '#8a8880')
  const riserDark = shade(riser, 0.62)
  const hasCross = !stand.temporary && s.rows >= 15
  const cross = hasCross ? Math.round(s.rows * 0.36) : -1

  // corredores a cada 18 m ou 24 m
  const aisleEvery = stand.temporary ? 18 : 24
  const aisles = []
  for (let t = aisleEvery / 2; t < s.total - 2; t += aisleEvery) aisles.push(t)
  // saídas de público, entre um corredor e outro
  const portals = []
  if (hasCross) for (let i = 0; i < aisles.length - 1; i += 2) portals.push((aisles[i] + aisles[i + 1]) / 2)

  for (let i = 0; i < s.n - 1; i++) {
    const j = i + 1
    const u0 = s.lengths[i], u1 = s.lengths[j]
    for (let r = 0; r < s.rows; r++) {
      const a = s.point(i, r), b = s.point(j, r), c = s.point(j, r + 1), d = s.point(i, r + 1)
      const yi = s.Y(i, r), yj = s.Y(j, r)
      if (r === cross) {
        kit.quad(W(a, yi), W(b, yj), W(c, yj), W(d, yi), CONCRETE, FINISH.CONCRETE, [[u0, 0], [u1, 0], [u1, s.rowD], [u0, s.rowD]], seed)
      } else {
        kit.quad(W(a, yi), W(b, yj), W(c, yj), W(d, yi), seat, FINISH.SEATS, [[u0, r], [u1, r], [u1, r + 0.98], [u0, r + 0.98]], seed)
      }
      // espelho do degrau: a sombra junta na base dele
      kit.quadShaded(W(d, yi), W(c, yj), W(c, yj + RISE), W(d, yi + RISE), [riserDark, riserDark, riser, riser])
    }
    // mureta da frente, com painéis de marca
    const a = s.front[i], b = s.front[j]
    const gi = s.ground[i], gj = s.ground[j], yi = s.Y(i, 0), yj = s.Y(j, 0)
    const brand = [BRAND.NASRACE, BRAND.DRAFT, BRAND.FINANCE, BRAND.SERVER][i % 4]
    const u = (u1 - u0) / 10
    kit.quad(W(a, gi), W(b, gj), W(b, yj), W(a, yi), rgb('#ffffff'), FINISH.BOARD, [[0, 0], [u, 0], [u, 1], [0, 1]], boardSeed(brand))
    // costas: concreto com colunas, ou andaime nas provisórias
    const backA = s.point(i, s.rows), backB = s.point(j, s.rows)
    const finish = stand.temporary ? FINISH.SCAFFOLD : FINISH.CONCRETE
    const tint = stand.temporary ? rgb('#8d9298') : CONCRETE
    const dark = shade(tint, 0.7)
    const ti = s.top(i), tj = s.top(j)
    const Hi = ti + 0.9 - gi, Hj = tj + 0.9 - gj
    kit.quadShaded(W(backB, gj), W(backA, gi), W(backA, ti + 0.9), W(backB, tj + 0.9), [dark, dark, tint, tint], finish, [[u1, 0], [u0, 0], [u0, Hi], [u1, Hj]], 0.77)
    // parapeito no alto, visto da frente
    kit.quad(W(backA, ti), W(backB, tj), W(backB, tj + 0.9), W(backA, ti + 0.9), shade(riser, 0.9))
    kit.quad(W(backB, tj + 0.9), W(backA, ti + 0.9), W(s.point(i, s.rows - 0.3), ti + 0.9), W(s.point(j, s.rows - 0.3), tj + 0.9), shade(riser, 1.2))
    if (simple) continue
    // corrimão sobre a mureta
    kit.bar(W(a, yi + 1.05), W(b, yj + 1.05), 0.03, STEEL, { sides: 4 })
    const posts = Math.max(1, Math.round((u1 - u0) / 3))
    for (let k = 0; k <= posts; k++) {
      const f = k / posts
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
      const y = yi + (yj - yi) * f
      kit.bar(W(p, y), W(p, y + 1.05), 0.024, STEEL, { sides: 3 })
    }
  }

  // laterais, com a escada de degraus desenhada no contorno
  for (const [i, sign] of [[0, -1], [s.n - 1, 1]]) {
    const finish = stand.temporary ? FINISH.SCAFFOLD : FINISH.CONCRETE
    const tint = stand.temporary ? rgb('#8d9298') : CONCRETE
    const g = s.ground[i]
    for (let r = 0; r < s.rows; r++) {
      const a = s.point(i, r), d = s.point(i, r + 1)
      const y = s.Y(i, r + 1)
      const H = y - g
      const uv0 = r * s.rowD, uv1 = (r + 1) * s.rowD
      if (sign < 0) kit.quad(W(d, g), W(a, g), W(a, y), W(d, y), tint, finish, [[uv1, 0], [uv0, 0], [uv0, H], [uv1, H]], 0.77)
      else kit.quad(W(a, g), W(d, g), W(d, y), W(a, y), tint, finish, [[uv0, 0], [uv1, 0], [uv1, H], [uv0, H]], 0.77)
    }
  }

  for (const t of aisles) addAisle(kit, s, t, simple)
  const portalRows = 4
  for (const t of portals) addPortal(kit, s, t, cross + 1, portalRows, simple)
  if (stand.roof) addRoof(kit, stand, s, seed, aisles, simple)
  addConcourse(kit, s, field, stand, out, rand, simple)

  // Sem cobertura, uma fileira de bandeiras no alto: é o que dá movimento a um setor aberto.
  if (!stand.roof) {
    const colors = [...Object.values(TEAMS).map((team) => team.color), '#ffffff']
    let k = 0
    for (let t = 14; t < s.total; t += 28) {
      const p = s.pointAt(t, s.rows + 0.4)
      const y = s.YT(t, s.rows) + 0.9
      kit.bar(W(p, y), W(p, y + 6.5), 0.05, rgb('#d6d6d0'), { finish: FINISH.PLAIN })
      out.flags.push({ x: p[0], y: y + 5.4, z: p[1], size: 1.1, color: colors[k++ % colors.length] })
    }
  }

  // Quem está sentado: cadeira por cadeira, menos corredores e saídas. Quase lotado, com alguns vazios.
  const margin = AISLE_WIDTH / 2 + 0.18
  for (let r = 0; r < s.rows; r++) {
    if (r === cross) continue
    for (let t = SEAT_WIDTH / 2; t < s.total; t += SEAT_WIDTH) {
      if (aisles.some((x) => Math.abs(x - t) < margin)) continue
      if (r > cross && r <= cross + portalRows && portals.some((x) => Math.abs(x - t) < 2)) continue
      if (rand() > 0.9) continue
      const p = s.pointAt(t, r + 0.46), back = s.pointAt(t, r + 1)
      const yaw = Math.atan2(p[1] - back[1], p[0] - back[0]) + (rand() - 0.5) * 0.35
      const y = s.YT(t, r)
      // poucos ficam em pé: dá para ver de longe que é gente de verdade
      if (rand() < 0.035) out.ground.push({ x: p[0], y, z: -p[1], yaw })
      else out.seated.push({ x: p[0], y, z: -p[1], yaw })
    }
  }
  // no corredor de meia altura, gente indo e vindo
  if (hasCross && !simple) {
    const walkers = Math.round(s.total * 0.05)
    for (let k = 0; k < walkers; k++) {
      const t = rand() * (s.total - 14), end = t + 6 + rand() * 8
      const p = s.pointAt(t, cross + 0.5), q = s.pointAt(end, cross + 0.5)
      out.ground.push({ x: p[0], y: s.YT(t, cross), z: -p[1], yaw: Math.atan2(q[1] - p[1], q[0] - p[0]), path: Math.hypot(q[0] - p[0], q[1] - p[1]), speed: 0.8 + rand() * 0.6, rise: s.YT(end, cross) - s.YT(t, cross) })
    }
  }
}
