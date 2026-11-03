// Fim de semana de GP: prédio dos boxes, arquibancadas com público, barreiras, alambrados, pórticos,
// torres de TV, telões, tendas e bandeiras. Quase tudo entra numa malha só, com a sombra cozida.

import { at, GARAGES, garageCenter, N, P, STEP } from '../circuit.js'
import { TEAMS } from '../race.js'
import { BARRIER, CONTROL_TOWER, GANTRIES, HOSPITALITY, MASTS, PARKING, PIT_BUILDING, PIT_WALL, SCREENS, STANDS, TENTS, TRUCKS, TV_TOWERS, garagePoint } from '../venue.js'
import { BRAND, boardSeed, FONT } from './brands.js'
import { seeded, shared, THREE } from './common.js'
import { FINISH, rgb } from './kit.js'

const W = (x, y, h) => [x, h, -y]

// O pit lane corre paralelo à parede: esta é a distância dele, em metros, na ponta norte dela.
const WEST_START = 420

const CONCRETE = rgb('#a8a59c')
const STEEL = rgb('#6d7176')
const DARK_STEEL = rgb('#2c2f33')
const WHITE = rgb('#e4e4de')

// ------------------------------------------------------------------ prédio dos boxes

function addPitBuilding(kit, field, { geoPaddock }) {
  const { outline, west, across } = PIT_BUILDING
  // o pit lane é o nível de referência: o relevo em volta dele foi moldado para isso
  const base = Math.min(garagePoint(GARAGES.from).z, garagePoint(GARAGES.to).z) - 0.3
  const H_WEST = 9.5, H_EAST = 12.8
  const [a, b] = west
  const lenWest = Math.hypot(b[0] - a[0], b[1] - a[1])
  const along = [(b[0] - a[0]) / lenWest, (b[1] - a[1]) / lenWest]
  const coord = (p) => {
    const dx = p[0] - a[0], dy = p[1] - a[1]
    return [dx * along[0] + dy * along[1], dx * across[0] + dy * across[1]]
  }
  const roofY = (p) => base + H_WEST + (coord(p)[1] / 50) * (H_EAST - H_WEST)
  const angle = Math.atan2(-along[1], along[0])

  // cobertura: módulos de membrana sobre toda a planta
  const contour = outline.map(([x, y]) => new THREE.Vector2(x, y))
  const white = rgb('#e9e9e4')
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const p = outline[i], q = outline[j], r = outline[k]
    kit.tri(W(p[0], p[1], roofY(p)), W(q[0], q[1], roofY(q)), W(r[0], r[1], roofY(r)), white, FINISH.MEMBRANE, coord(p), coord(q), coord(r), angle)
  }

  // paredes: leste com janelas de serviço; oeste montada em seguida, com as garagens
  const wall = rgb('#c9cac6')
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length]
    if (p === a && q === b) continue
    if (p === b && q === a) continue
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const y0 = roofY(p), y1 = roofY(q)
    kit.quad(W(p[0], p[1], base), W(q[0], q[1], base), W(q[0], q[1], y1), W(p[0], p[1], y0), wall, FINISH.WALL, [[0, 0], [len, 0], [len, y1 - base], [0, y0 - base]], 0.31)
  }

  // Fachada das garagens: parede clara, faixa de vidro em cima e uma porta para cada box.
  const facade = (t0, t1, y0, y1, tint, finish = 0, uv, seed = 0, inset = 0) => {
    const ax = a[0] + along[0] * t0 - across[0] * inset, ay = a[1] + along[1] * t0 - across[1] * inset
    const bx = a[0] + along[0] * t1 - across[0] * inset, by = a[1] + along[1] * t1 - across[1] * inset
    // visto de fora (de oeste para leste), o eixo `along` corre para a direita: anti-horário
    kit.quad(W(ax, ay, y0), W(bx, by, y0), W(bx, by, y1), W(ax, ay, y1), tint, finish, uv, seed)
  }
  const roofWest = base + H_WEST
  facade(0, lenWest, base, roofWest, rgb('#d3d4d0'))
  facade(0, lenWest, base + 5.4, base + 8.9, rgb('#2a3942'), FINISH.GLASS, [[0, 0], [lenWest, 0], [lenWest, 3.5], [0, 3.5]], 0, 0.04)

  const slots = []
  for (let i = 0; i < GARAGES.slots; i++) {
    const center = garageCenter(i)
    const g = garagePoint(center)
    const t = (g.x - a[0]) * along[0] + (g.y - a[1]) * along[1]
    const half = ((GARAGES.to - GARAGES.from - 12) / GARAGES.slots) / 2 - 0.5
    if (t - half < 0 || t + half > lenWest) {
      slots.push(null)
      continue
    }
    facade(t - half, t + half, base, base + 4.3, rgb('#101215'), 0, undefined, 0, 0.05)
    // luz de dentro da garagem
    facade(t - half + 0.2, t + half - 0.2, base + 3.75, base + 4.05, rgb('#fff4dc', 1.1), FINISH.EMISSIVE, undefined, 0, 0.06)
    slots.push({ t, half })
  }

  // Calçada de trabalho entre o pit lane e as garagens.
  const apron = rgb('#8f8d85')
  const out = 5
  const yAlong = (t) => garagePoint(WEST_START + t).z + 0.1
  for (let t = 0; t < lenWest; t += 12) {
    const t1 = Math.min(lenWest, t + 12)
    const ax = a[0] + along[0] * t, ay = a[1] + along[1] * t
    const bx = a[0] + along[0] * t1, by = a[1] + along[1] * t1
    const y0 = yAlong(t), y1 = yAlong(t1)
    kit.quad(W(ax - across[0] * out, ay - across[1] * out, y0), W(bx - across[0] * out, by - across[1] * out, y1), W(bx, by, y1), W(ax, ay, y0), apron)
  }

  // Torre de controle na ponta norte.
  const ring = CONTROL_TOWER
  const top = base + 12.5
  const glass = rgb('#22323c')
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    kit.quad(W(p[0], p[1], base), W(q[0], q[1], base), W(q[0], q[1], top), W(p[0], p[1], top), glass, FINISH.GLASS, [[0, 0], [len, 0], [len, top - base], [0, top - base]])
  }
  const towerContour = ring.map(([x, y]) => new THREE.Vector2(x, y))
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(towerContour, [])) {
    const p = ring[i], q = ring[j], r = ring[k]
    kit.tri(W(p[0], p[1], top), W(q[0], q[1], top), W(r[0], r[1], top), rgb('#d2d2cc'), FINISH.SLAB, p, q, r, 0.7)
  }

  // Cobertura em arcos do paddock, do lado leste do pátio.
  if (geoPaddock) addPaddock(kit, field, geoPaddock)

  return { slots, a, along, across, base }
}

function addPaddock(kit, field, pts) {
  const ring = []
  const n = pts.length / 2
  let area = 0
  for (let i = 0, j = n - 1; i < n; j = i++) area += pts[j * 2] * pts[i * 2 + 1] - pts[i * 2] * pts[j * 2 + 1]
  if (area > 0) for (let i = 0; i < n; i++) ring.push([pts[i * 2], pts[i * 2 + 1]])
  else for (let i = n - 1; i >= 0; i--) ring.push([pts[i * 2], pts[i * 2 + 1]])
  let cx = 0, cy = 0
  for (const [x, y] of ring) {
    cx += x
    cy += y
  }
  cx /= n
  cy /= n
  const base = field.heightAt(cx, cy) - 0.8
  const top = base + 12.5
  // eixo longo do prédio, medido na vista aérea: vai do canto sudoeste ao nordeste
  const axis = [Math.cos(0.76), Math.sin(0.76)]
  const across = [-axis[1], axis[0]]
  let halfW = 1
  for (const [x, y] of ring) halfW = Math.max(halfW, Math.abs((x - cx) * across[0] + (y - cy) * across[1]))
  const uvOf = ([x, y]) => [(x - cx) * axis[0] + (y - cy) * axis[1], ((x - cx) * across[0] + (y - cy) * across[1]) / halfW]
  const angle = Math.atan2(-axis[1], axis[0])
  const contour = ring.map(([x, y]) => new THREE.Vector2(x, y))
  const white = rgb('#f0f0ec')
  const vault = (p) => {
    const v = uvOf(p)[1]
    return top + 2.2 * (1 - v * v)
  }
  // subdivide para a abóbada aparecer na silhueta
  const emit = (p, q, r, depth) => {
    if (depth > 0) {
      const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2]
      const pq = mid(p, q), qr = mid(q, r), rp = mid(r, p)
      emit(p, pq, rp, depth - 1)
      emit(pq, q, qr, depth - 1)
      emit(rp, qr, r, depth - 1)
      emit(pq, qr, rp, depth - 1)
      return
    }
    kit.tri(W(p[0], p[1], vault(p)), W(q[0], q[1], vault(q)), W(r[0], r[1], vault(r)), white, FINISH.RIBS, uvOf(p), uvOf(q), uvOf(r), angle)
  }
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) emit(ring[i], ring[j], ring[k], 2)
  const glass = rgb('#2e3f49')
  let along = 0
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    kit.quad(W(p[0], p[1], base), W(q[0], q[1], base), W(q[0], q[1], vault(q)), W(p[0], p[1], vault(p)), glass, FINISH.GLASS,
      [[along, 0], [along + len, 0], [along + len, vault(q) - base], [along, vault(p) - base]])
    along += len
  }
}

// ------------------------------------------------------------------ arquibancadas

/** Coloca uma faixa de marca sobre um telhado: `a`→`b` é o sentido da leitura. */
function roofBoard(kit, a, b, width, across, brand, yOf) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const repeat = Math.max(1, Math.round(len / (width * 8) * 2)) / 2
  const pa = [a[0] - across[0] * width / 2, a[1] - across[1] * width / 2]
  const pb = [b[0] - across[0] * width / 2, b[1] - across[1] * width / 2]
  const pc = [b[0] + across[0] * width / 2, b[1] + across[1] * width / 2]
  const pd = [a[0] + across[0] * width / 2, a[1] + across[1] * width / 2]
  kit.quad(W(pa[0], pa[1], yOf(pa)), W(pb[0], pb[1], yOf(pb)), W(pc[0], pc[1], yOf(pc)), W(pd[0], pd[1], yOf(pd)), rgb('#ffffff'), FINISH.BOARD, [[0, 0], [repeat, 0], [repeat, 1], [0, 1]], boardSeed(BRAND[brand]))
}

function addStand(kit, field, stand, rand) {
  // O fundo fica à esquerda do sentido de `front`: as faces apontam para cima e para a pista.
  const front = stand.flip ? [...stand.front].reverse() : stand.front
  const n = front.length
  const normals = front.map((p, i) => {
    const a = front[Math.max(0, i - 1)], b = front[Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [-dy / len, dx / len]
  })
  const depth = stand.depth, rows = stand.rows
  const rowD = depth / rows
  const rise = 0.47
  let ground = Infinity
  for (const p of front) ground = Math.min(ground, field.heightAt(p[0], p[1]))
  ground -= 0.5
  const y0 = ground + (stand.base ?? 2.2)
  const seat = rgb(stand.seat)
  const seed = rand()
  const point = (i, row) => [front[i][0] + normals[i][0] * row * rowD, front[i][1] + normals[i][1] * row * rowD]
  const riser = rgb(stand.temporary ? '#5d6166' : '#74736d')

  const lengths = [0]
  for (let i = 0; i < n - 1; i++) lengths.push(lengths[i] + Math.hypot(front[i + 1][0] - front[i][0], front[i + 1][1] - front[i][1]))

  for (let i = 0; i < n - 1; i++) {
    for (let r = 0; r < rows; r++) {
      const a = point(i, r), b = point(i + 1, r), c = point(i + 1, r + 1), d = point(i, r + 1)
      const y = y0 + r * rise
      kit.quad(W(a[0], a[1], y), W(b[0], b[1], y), W(c[0], c[1], y), W(d[0], d[1], y), seat, FINISH.CROWD,
        [[lengths[i], r], [lengths[i + 1], r], [lengths[i + 1], r + 0.98], [lengths[i], r + 0.98]], seed)
      kit.quad(W(d[0], d[1], y), W(c[0], c[1], y), W(c[0], c[1], y + rise), W(d[0], d[1], y + rise), riser)
    }
    // mureta da frente, com painéis de marca
    const a = front[i], b = front[i + 1]
    const brand = [BRAND.NASRACE, BRAND.DRAFT, BRAND.FINANCE, BRAND.SERVER][i % 4]
    const u = (lengths[i + 1] - lengths[i]) / 10
    kit.quad(W(a[0], a[1], ground), W(b[0], b[1], ground), W(b[0], b[1], y0), W(a[0], a[1], y0), rgb('#ffffff'), FINISH.BOARD, [[0, 0], [u, 0], [u, 1], [0, 1]], boardSeed(brand))
    // costas
    const top = y0 + rows * rise
    const backA = point(i, rows), backB = point(i + 1, rows)
    const backTint = stand.temporary ? DARK_STEEL : rgb('#8e8c84')
    kit.quad(W(backB[0], backB[1], ground), W(backA[0], backA[1], ground), W(backA[0], backA[1], top + 0.6), W(backB[0], backB[1], top + 0.6), backTint, stand.temporary ? FINISH.STEEL : FINISH.PLAIN)
    kit.quad(W(backB[0], backB[1], top + 0.6), W(backA[0], backA[1], top + 0.6), W(backA[0], backA[1], top), W(backB[0], backB[1], top), backTint)
  }
  // laterais
  for (const [i, sign] of [[0, -1], [n - 1, 1]]) {
    for (let r = 0; r < rows; r++) {
      const a = point(i, r), d = point(i, r + 1)
      const y = y0 + (r + 1) * rise
      if (sign < 0) kit.quad(W(d[0], d[1], ground), W(a[0], a[1], ground), W(a[0], a[1], y), W(d[0], d[1], y), riser)
      else kit.quad(W(a[0], a[1], ground), W(d[0], d[1], ground), W(d[0], d[1], y), W(a[0], a[1], y), riser)
    }
  }

  // Cobertura: placa inclinada que sobe para a pista, apoiada no fundo e em colunas na frente dela.
  if (stand.roof) {
    const top = y0 + rows * rise
    const from = stand.roof.from
    const fromRow = rows * from
    const tint = rgb(stand.roof.tint)
    const yBack = top + 3.4
    const yFront = top + 4.4
    const edge = (i, row) => point(i, row)
    for (let i = 0; i < n - 1; i++) {
      const a = edge(i, fromRow), b = edge(i + 1, fromRow), c = edge(i + 1, rows + 0.8), d = edge(i, rows + 0.8)
      const u0 = lengths[i], u1 = lengths[i + 1]
      kit.quad(W(a[0], a[1], yFront), W(b[0], b[1], yFront), W(c[0], c[1], yBack), W(d[0], d[1], yBack), tint, FINISH.METAL,
        [[u0, 0], [u1, 0], [u1, depth], [u0, depth]], seed)
      kit.quad(W(d[0], d[1], yBack - 0.3), W(c[0], c[1], yBack - 0.3), W(b[0], b[1], yFront - 0.3), W(a[0], a[1], yFront - 0.3), rgb('#3b3d40'))
      kit.quad(W(a[0], a[1], yFront - 0.3), W(b[0], b[1], yFront - 0.3), W(b[0], b[1], yFront), W(a[0], a[1], yFront), rgb('#b4b5b2'))
      // colunas
      const steps = Math.max(1, Math.round((u1 - u0) / 16))
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t
        const qx = d[0] + (c[0] - d[0]) * t, qy = d[1] + (c[1] - d[1]) * t
        const mid = y0 + fromRow * rise
        kit.bar(W(px, py, mid), W(px, py, yFront - 0.2), 0.16, STEEL)
        kit.bar(W(qx, qy, ground), W(qx, qy, yBack - 0.2), 0.2, STEEL)
      }
    }
    if (stand.roof.brand) {
      // letreiro no telhado, para ser lido pela câmera: direção norte, com o topo a oeste
      const mid = rows * (from + 1) * 0.5 + 0.4
      const a = point(0, mid), b = point(n - 1, mid)
      const north = b[1] > a[1]
      const start = north ? a : b, end = north ? b : a
      const len = Math.hypot(end[0] - start[0], end[1] - start[1])
      const across = [-(end[1] - start[1]) / len, (end[0] - start[0]) / len]
      const width = Math.min(depth * (1 - from) * 0.8, len / 8)
      // sobre o plano do telhado, um palmo acima dele
      const nrm = normals[0]
      const yOf = (p) => {
        const row = ((p[0] - front[0][0]) * nrm[0] + (p[1] - front[0][1]) * nrm[1]) / rowD
        return yFront + ((yBack - yFront) * (row - fromRow)) / (rows + 0.8 - fromRow) + 0.08
      }
      roofBoard(kit, start, end, width, across, stand.roof.brand, yOf)
    }
  }
  // corredores: faixa de cor na frente de cada escada
  if (stand.aisle) {
    const tint = rgb(stand.aisle)
    for (let i = 0; i < n - 1; i += 2) {
      for (let r = 0; r < rows; r += 1) {
        const a = point(i, r), d = point(i, r + 1)
        const y = y0 + r * rise + 0.04
        const ex = (front[i + 1][0] - front[i][0]) * 0.1, ey = (front[i + 1][1] - front[i][1]) * 0.1
        kit.quad(W(a[0], a[1], y), W(a[0] + ex, a[1] + ey, y), W(d[0] + ex, d[1] + ey, y), W(d[0], d[1], y), tint)
      }
    }
  }
}

// ------------------------------------------------------------------ barreiras e alambrados

/** Muro com painéis de marca voltados para a pista. Alambrado sai numa malha à parte. */
function addBarriers(kit, field, fence) {
  const brands = [BRAND.NASRACE, BRAND.DRAFT, BRAND.FINANCE, BRAND.PORTFOLIO, BRAND.VOALBERTO, BRAND.SERVER, BRAND.PULSE, BRAND.ARENA]
  for (const side of [1, -1]) {
    const data = side > 0 ? BARRIER.left : BARRIER.right
    const pointOf = (i, extra = 0) => {
      const p = P[i % N]
      const d = data.offset[i % N] + extra
      return { x: p.x - p.ty * d * side, y: p.y + p.tx * d * side, z: p.z, s: i * STEP }
    }
    let run = 0
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      if (!data.on[i] || !data.on[j]) continue
      const a = pointOf(i), b = pointOf(j)
      const a2 = pointOf(i, 0.45), b2 = pointOf(j, 0.45)
      const h0 = field.heightAt(a.x, a.y) - 0.25, h1 = field.heightAt(b.x, b.y) - 0.25
      const isPit = side > 0 && PIT_WALL[i]
      const tall = isPit ? 1.55 : 1.22
      const top0 = Math.max(h0, a.z - 0.1) + tall, top1 = Math.max(h1, b.z - 0.1) + tall
      // face voltada para a pista: visto da pista, a direção de percurso corre para a direita ou para a esquerda conforme o lado
      const row = brands[Math.floor(i / 16) % brands.length]
      const u0 = (run % 2) * 0.5, u1 = u0 + 0.5
      const painted = (Math.floor(i / 4) % 5) !== 4
      const faceTint = painted ? rgb('#ffffff') : rgb('#e6e4dc')
      const faceFinish = painted ? FINISH.BOARD : FINISH.PLAIN
      const uv = (lo, hi) => (painted ? [[lo, 0], [hi, 0], [hi, 1], [lo, 1]] : undefined)
      if (side > 0) kit.quad(W(a.x, a.y, h0), W(b.x, b.y, h1), W(b.x, b.y, top1), W(a.x, a.y, top0), faceTint, faceFinish, uv(u0, u1), boardSeed(row))
      else kit.quad(W(b.x, b.y, h1), W(a.x, a.y, h0), W(a.x, a.y, top0), W(b.x, b.y, top1), faceTint, faceFinish, uv(u0, u1), boardSeed(row))
      // topo e costas
      if (side > 0) kit.quad(W(a.x, a.y, top0), W(b.x, b.y, top1), W(b2.x, b2.y, top1), W(a2.x, a2.y, top0), CONCRETE)
      else kit.quad(W(a2.x, a2.y, top0), W(b2.x, b2.y, top1), W(b.x, b.y, top1), W(a.x, a.y, top0), CONCRETE)
      if (side > 0) kit.quad(W(b2.x, b2.y, h1), W(a2.x, a2.y, h0), W(a2.x, a2.y, top0), W(b2.x, b2.y, top1), CONCRETE)
      else kit.quad(W(a2.x, a2.y, h0), W(b2.x, b2.y, h1), W(b2.x, b2.y, top1), W(a2.x, a2.y, top0), CONCRETE)
      run++

      // alambrado: longe dos prédios não faz falta na leitura, e por cima dele ninguém anda
      fence.add(a, b, top0, top1, side > 0 && !isPit ? 2.2 : 3.2)
    }
  }
}

function createFenceBuilder() {
  const pos = []
  const uv = []
  let along = 0
  return {
    add(a, b, y0, y1, height) {
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      pos.push(a.x, y0, -a.y, b.x, y1, -b.y, b.x, y1 + height, -b.y, a.x, y0, -a.y, b.x, y1 + height, -b.y, a.x, y0 + height, -a.y)
      uv.push(along, 0, along + len, 0, along + len, height, along, 0, along + len, height, along, height)
      along += len
    },
    mesh() {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            // malha em losango, mourões a cada 3 m e um cabo no topo
            vec2 d = vec2(vUv.x + vUv.y, vUv.x - vUv.y) / 0.34;
            vec2 w = fwidth(d);
            vec2 g = abs(fract(d) - 0.5);
            float wire = 1.0 - min(smoothstep(0.0, w.x + 0.06, g.x), smoothstep(0.0, w.y + 0.06, g.y));
            float fine = 1.0 - smoothstep(0.3, 0.9, max(w.x, w.y));
            float postW = fwidth(vUv.x);
            float post = 1.0 - smoothstep(0.05, 0.05 + postW * 1.5, abs(fract(vUv.x / 3.0) - 0.5) * 3.0);
            float alpha = mix(0.1, wire * 0.55, fine);
            alpha = max(alpha, post * 0.75);
            gl_FragColor = vec4(vec3(0.12, 0.125, 0.13), alpha);
          }
        `,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      mesh.renderOrder = 4
      return mesh
    },
  }
}

// ------------------------------------------------------------------ estruturas

function addGantry(kit, field, g) {
  const p = at(g.s)
  const half = Math.max(p.left, p.right) + 4
  const a = at(g.s, half), b = at(g.s, -half)
  const groundA = field.heightAt(a.x, a.y) - 0.3, groundB = field.heightAt(b.x, b.y) - 0.3
  const y = p.z + g.height
  const depth = g.bridge ? 3 : 1.4
  const tx = p.tx * depth / 2, ty = p.ty * depth / 2
  const color = g.bridge ? rgb('#3a3d41') : rgb('#22252a')
  // colunas
  for (const [q, ground] of [[a, groundA], [b, groundB]]) {
    kit.box(q.x, ground, -q.y, depth + 0.3, y + 1.8 - ground, 1.1, Math.atan2(p.ty, p.tx), color, { finish: FINISH.STEEL })
  }
  // vão: face de marca para quem vem, topo e face de trás
  const A = (d, k) => [a.x + tx * d, a.y + ty * d, k]
  const B = (d, k) => [b.x + tx * d, b.y + ty * d, k]
  const rep = Math.max(1, Math.round((2 * half) / 12))
  const seed = boardSeed(BRAND[g.brand])
  const uv = [[0, 0], [rep, 0], [rep, 1], [0, 1]]
  const tall = g.bridge ? 1.5 : 1.6
  const v = (q) => W(q[0], q[1], q[2])
  // face virada para os carros que chegam, a de trás e o topo: a marca aparece na vista do alto
  kit.quad(v(A(-1, y)), v(B(-1, y)), v(B(-1, y + tall)), v(A(-1, y + tall)), rgb('#ffffff'), FINISH.BOARD, uv, seed)
  kit.quad(v(B(1, y)), v(A(1, y)), v(A(1, y + tall)), v(B(1, y + tall)), rgb('#ffffff'), FINISH.BOARD, uv, seed)
  kit.quad(v(A(-1, y + tall)), v(B(-1, y + tall)), v(B(1, y + tall)), v(A(1, y + tall)), rgb('#ffffff'), FINISH.BOARD, uv, seed)
  kit.quad(v(A(1, y)), v(B(1, y)), v(B(-1, y)), v(A(-1, y)), color)
  return { a, b, y: y + tall, p }
}

function addTvTower(kit, field, t, rand) {
  const ground = field.heightAt(t.x, t.y) - 0.3
  const h = t.h
  const size = 2.4
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const yaw = rand() * 6.28
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const at3 = (i, k) => {
    const [lx, ly] = corners[i % 4]
    return W(t.x + (lx * c - ly * s) * size / 2, t.y + (lx * s + ly * c) * size / 2, ground + k)
  }
  for (let i = 0; i < 4; i++) kit.bar(at3(i, 0), at3(i, h), 0.07, STEEL)
  const LEVELS = Math.round(h / 2.6)
  for (let l = 0; l < LEVELS; l++) {
    const k0 = (l / LEVELS) * h, k1 = ((l + 1) / LEVELS) * h
    for (let i = 0; i < 4; i++) {
      kit.bar(at3(i, k1), at3(i + 1, k1), 0.04, STEEL)
      kit.bar(at3(l % 2 ? i : i + 1, k0), at3(l % 2 ? i + 1 : i, k1), 0.03, STEEL)
    }
  }
  // plataforma, toldo e operador
  kit.box(t.x, ground + h, -t.y, size + 0.8, 0.14, size + 0.8, yaw, rgb('#54575c'))
  kit.box(t.x, ground + h + 2.4, -t.y, size + 1, 0.1, size + 1, yaw, rgb('#e2e3e2'))
  for (let i = 0; i < 4; i++) kit.bar(at3(i, h), at3(i, h + 2.4), 0.04, STEEL)
  kit.box(t.x + c * 0.8, ground + h + 0.14, -t.y - s * 0.8, 0.5, 1.5, 0.45, yaw, rgb('#20325c'))
  kit.box(t.x + c * 1.3, ground + h + 1.2, -t.y - s * 1.3, 0.75, 0.32, 0.28, yaw, rgb('#16181b'))
}

function addMast(kit, field, m) {
  const ground = field.heightAt(m.x, m.y) - 0.2
  const white = rgb('#e8e8e4')
  const top = ground + 11.5
  kit.bar(W(m.x, m.y, ground), W(m.x, m.y, top), 0.24, white, { sides: 6, finish: FINISH.PLAIN })
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * 6.283
    const r = 5.2 + (k % 2) * 2.2
    const tip = W(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, top - 1.3 + (k % 3) * 1.5)
    kit.bar(W(m.x, m.y, top - 0.8), tip, 0.09, white, { sides: 4, finish: FINISH.PLAIN })
    const next = (k + 1) / 9 * 6.283
    kit.bar(tip, W(m.x + Math.cos(next) * 3.4, m.y + Math.sin(next) * 3.4, top + 0.3), 0.05, white, { sides: 3, finish: FINISH.PLAIN })
  }
}

/**
 * Grid e linha de chegada em geometria: a textura ao longo da pista não tem resolução para linhas
 * transversais vistas de perto. Ficam um dedo acima do asfalto.
 */
function addGridMarks(kit) {
  const paint = rgb('#e8e8e2')
  const dark = rgb('#101114')
  const LIFT = 0.075
  const patch = (s0, s1, d0, d1, tint) => {
    const a = at(s0, d0), b = at(s1, d0), c = at(s1, d1), e = at(s0, d1)
    // d cresce para a esquerda de quem anda: s0→s1 e d0→d1 formam a face virada para cima
    kit.quad(W(a.x, a.y, a.z + LIFT), W(b.x, b.y, b.z + LIFT), W(c.x, c.y, c.z + LIFT), W(e.x, e.y, e.z + LIFT), tint)
  }
  for (let r = 0; r < 24; r++) {
    const s0 = -8 - r * 8
    const center = (r % 2 ? 1 : -1) * 3.1
    patch(s0, s0 + 0.35, center - 1.5, center + 1.5, paint)
    patch(s0 - 3.6, s0, center - 1.5, center - 1.28, paint)
    patch(s0 - 3.6, s0, center + 1.28, center + 1.5, paint)
  }
  const p0 = at(0)
  patch(-0.3, 0.45, -p0.right, p0.left, paint)
  const cell = 0.72
  const count = Math.floor((p0.left + p0.right) / cell)
  for (let k = 0; k < count; k++) {
    for (let j = 0; j < 3; j++) {
      const d = -p0.right + (k + 0.1) * cell
      patch(0.5 + j * cell, 0.5 + (j + 1) * cell, d, d + cell, (k + j) % 2 ? dark : paint)
    }
  }
}

/** Postos das equipes sobre a mureta dos boxes: cobertura, telas e a cor de cada uma. */
function addPitWallStands(kit) {
  const teams = Object.values(TEAMS)
  const S0 = 4262, SPAN = 15
  teams.forEach((team, i) => {
    const s = (S0 + i * SPAN * 1.6) % (P.length * STEP)
    const q = at(s, BARRIER.left.offset[Math.floor(s / STEP) % N] + 0.3)
    const yaw = Math.atan2(q.ty, q.tx)
    const y = q.z + 1.55
    const color = rgb(team.color)
    kit.box(q.x, y, -q.y, SPAN * 0.8, 1.15, 1.5, yaw, rgb('#202328'))
    kit.box(q.x, y + 1.15, -q.y, SPAN * 0.86, 0.14, 2.1, yaw, color, { top: color })
  })
}

function addTent(kit, field, t) {
  const ground = field.heightAt(t.x, t.y) - 0.3
  const eave = ground + 3.4, ridge = eave + Math.min(2.2, t.width * 0.22)
  const c = Math.cos(t.angle), s = Math.sin(t.angle)
  const hl = t.length / 2, hw = t.width / 2
  const P2 = (lx, ly, y) => W(t.x + lx * c - ly * s, t.y + lx * s + ly * c, y)
  const tint = rgb(t.color)
  // quatro paredes de lona
  const a = [-hl, -hw], b = [hl, -hw], d = [hl, hw], e = [-hl, hw]
  const wall = (p, q) => kit.quad(P2(p[0], p[1], ground), P2(q[0], q[1], ground), P2(q[0], q[1], eave), P2(p[0], p[1], eave), tint, FINISH.PLAIN)
  wall(a, b)
  wall(b, d)
  wall(d, e)
  wall(e, a)
  kit.quad(P2(-hl, -hw, eave), P2(hl, -hw, eave), P2(hl, 0, ridge), P2(-hl, 0, ridge), tint, FINISH.METAL, [[0, 0], [t.length, 0], [t.length, hw], [0, hw]], 0.2)
  kit.quad(P2(hl, hw, eave), P2(-hl, hw, eave), P2(-hl, 0, ridge), P2(hl, 0, ridge), tint, FINISH.METAL, [[0, 0], [t.length, 0], [t.length, hw], [0, hw]], 0.4)
  kit.tri(P2(hl, -hw, eave), P2(hl, hw, eave), P2(hl, 0, ridge), tint)
  kit.tri(P2(-hl, hw, eave), P2(-hl, -hw, eave), P2(-hl, 0, ridge), tint)
}

function addHospitality(kit, field, h) {
  const ground = field.heightAt(h.x, h.y) - 0.2
  const team = rgb(TEAMS[h.team].color)
  kit.box(h.x, ground, -h.y, h.length, h.height * 0.46, h.width, h.angle, rgb('#20303a'), { finish: FINISH.GLASS, wallUv: true, top: rgb('#d9d9d4') })
  kit.box(h.x, ground + h.height * 0.46, -h.y, h.length + 0.7, 0.9, h.width + 0.7, h.angle, team, { top: team })
  kit.box(h.x, ground + h.height * 0.46 + 0.9, -h.y, h.length, h.height * 0.4, h.width, h.angle, rgb('#26343d'), { finish: FINISH.GLASS, wallUv: true, top: rgb('#e6e6e0'), topFinish: FINISH.SLAB, seed: 0.3 })
}

function addTruck(kit, field, t) {
  const ground = field.heightAt(t.x, t.y) - 0.2
  const team = rgb(TEAMS[t.team].color)
  const c = Math.cos(t.angle), s = Math.sin(t.angle)
  kit.box(t.x, ground + 0.5, -t.y, 13.2, 3.5, 2.55, t.angle, team, { top: rgb('#e4e4e0') })
  const fx = t.x + c * 8.1, fy = t.y + s * 8.1
  kit.box(fx, ground + 0.4, -fy, 2.3, 2.9, 2.5, t.angle, rgb('#14161a'))
}

function addParkedCars(kit, field, rand) {
  const paints = ['#d9d9d6', '#b0b2b4', '#1c1e20', '#6d7073', '#7a1c1c', '#1d3f75', '#e6e6e2', '#3a3d40']
  for (const lot of PARKING) {
    const dx = lot.to.x - lot.from.x, dy = lot.to.y - lot.from.y
    const len = Math.hypot(dx, dy)
    const ux = dx / len, uy = dy / len
    const nx = -uy, ny = ux
    for (let row = 0; row < lot.rows; row++) {
      for (let d = 0; d < len; d += 2.7) {
        if (rand() < 0.22) continue
        const x = lot.from.x + ux * d + nx * row * 6, y = lot.from.y + uy * d + ny * row * 6
        const yaw = Math.atan2(ny, nx) + (rand() - 0.5) * 0.08
        const ground = field.heightAt(x, y) - 0.05
        const paint = rgb(paints[Math.floor(rand() * paints.length)])
        kit.box(x, ground + 0.3, -y, 4.3, 0.55, 1.8, yaw, paint)
        kit.box(x, ground + 0.85, -y, 2.2, 0.45, 1.5, yaw, rgb('#20262c'), { top: paint })
      }
    }
  }
}

// ------------------------------------------------------------------ tudo o que entra na malha única

export function addGrandPrix(kit, field, { paddock }) {
  // `kit` é a malha do GP: a cidade fica em outra, com um shader mais simples.
  const rand = seeded(2026)
  const fence = createFenceBuilder()
  const pit = addPitBuilding(kit, field, { geoPaddock: paddock })
  const flags = addFlagPoles(kit, pit)
  for (const stand of STANDS) addStand(kit, field, stand, rand)
  addBarriers(kit, field, fence)
  const gantries = GANTRIES.map((g) => addGantry(kit, field, g))
  for (const t of TV_TOWERS) addTvTower(kit, field, t, rand)
  for (const m of MASTS) addMast(kit, field, m)
  for (const t of TENTS) addTent(kit, field, t)
  for (const h of HOSPITALITY) addHospitality(kit, field, h)
  addPitWallStands(kit)
  addGridMarks(kit)
  for (const t of TRUCKS) addTruck(kit, field, t)
  addParkedCars(kit, field, rand)
  return { fence: fence.mesh(), pit, gantries, flags }
}

/** Mastros de bandeira sobre a cobertura dos boxes e na frente da arquibancada principal. */
function addFlagPoles(kit, pit) {
  const colors = [...Object.values(TEAMS).map((t) => t.color), '#ffffff', '#e10600']
  const points = []
  const pole = (x, y, ground, height) => {
    kit.bar(W(x, y, ground), W(x, y, ground + height), 0.06, WHITE, { finish: FINISH.PLAIN })
    points.push({ x, y: ground + height - 1.5, z: y, size: 1.5, color: colors[points.length % colors.length] })
  }
  const { a, along, across, base } = pit
  for (let t = 12; t < 277; t += 22) {
    pole(a[0] + along[0] * t + across[0] * 1.2, a[1] + along[1] * t + across[1] * 1.2, base + 9.6, 5.5)
  }
  const [p, q] = STANDS[0].front
  for (let k = 0; k <= 7; k++) {
    const t = k / 7
    pole(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, base + 2, 8)
  }
  return points
}

// ------------------------------------------------------------------ o que muda em tempo real

/** As cinco luzes de largada, no pórtico da reta. Grandes o bastante para aparecerem do alto. */
export function createStartLights(gantry) {
  const geometry = new THREE.SphereGeometry(0.32, 10, 8)
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ toneMapped: false }), 10)
  const m = new THREE.Matrix4()
  const off = new THREE.Color(0.05, 0.015, 0.012)
  const on = new THREE.Color(6, 0.2, 0.08)
  const { a, b, y, p } = gantry
  const positions = []
  for (let i = 0; i < 5; i++) {
    const t = 0.34 + (i / 4) * 0.32
    const x = a.x + (b.x - a.x) * t, n = a.y + (b.y - a.y) * t
    for (const lift of [0.1, 0.72]) positions.push([x - p.tx * 0.8, y - 1.6 + lift + 0.5, -(n - p.ty * 0.8)])
  }
  positions.forEach(([x, h, z], i) => {
    m.makeTranslation(x, h, z)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, off)
  })
  mesh.frustumCulled = false
  let shown = -1
  return {
    mesh,
    update(count) {
      if (count === shown) return
      shown = count
      for (let i = 0; i < 10; i++) mesh.setColorAt(i, Math.floor(i / 2) < count ? on : off)
      mesh.instanceColor.needsUpdate = true
    },
  }
}

/** Placas das garagens: o código de quem usa cada box, sobre a cor da equipe. */
export function createPitBoards(pit) {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 256
  const g = c.getContext('2d')
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const COLS = 8
  const ROWS = 3
  const pos = []
  const uv = []
  pit.slots.forEach((slot, i) => {
    if (!slot) return
    const { a, along, across, base } = pit
    const ax = a[0] + along[0] * (slot.t - slot.half) - across[0] * 0.07, ay = a[1] + along[1] * (slot.t - slot.half) - across[1] * 0.07
    const bx = a[0] + along[0] * (slot.t + slot.half) - across[0] * 0.07, by = a[1] + along[1] * (slot.t + slot.half) - across[1] * 0.07
    const y0 = base + 4.3, y1 = base + 5.35
    const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS
    const v1 = 1 - Math.floor(i / COLS) / ROWS, v0 = v1 - 1 / ROWS
    pos.push(ax, y0, -ay, bx, y0, -by, bx, y1, -by, ax, y0, -ay, bx, y1, -by, ax, y1, -ay)
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.1, 1.1, 1.1) }))
  mesh.frustumCulled = false
  let signature = ''
  return {
    mesh,
    update(cars) {
      const list = [...cars.values()]
      const key = list.map((car) => `${car.slot}:${car.code}`).join('|')
      if (key === signature) return
      signature = key
      g.fillStyle = '#16181b'
      g.fillRect(0, 0, c.width, c.height)
      const w = c.width / COLS, h = c.height / ROWS
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      for (const car of list) {
        const col = car.slot % COLS, row = Math.floor(car.slot / COLS)
        g.fillStyle = car.team.color
        g.fillRect(col * w + 2, row * h + 2, w - 4, h - 4)
        g.fillStyle = luminance(car.team.color) > 0.5 ? '#101215' : '#ffffff'
        g.font = `700 ${Math.round(h * 0.72)}px ${FONT}`
        g.fillText(car.code, col * w + w / 2, row * h + h / 2 + 3)
      }
      texture.needsUpdate = true
    },
  }
}

const luminance = (hex) => {
  const v = parseInt(hex.slice(1), 16)
  return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255
}

/** Telões: mostram os três primeiros de verdade, e nada além do que está na corrida. */
export function createScreens(field, kit) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 288
  const g = c.getContext('2d')
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  const pos = []
  const uv = []
  const dark = rgb('#17191c')
  for (const s of SCREENS) {
    const ground = field.heightAt(s.x, s.y) - 0.3
    const bottom = ground + s.top - s.h
    const yaw = s.facing
    // normal da tela: para leste, com o desvio `facing`; a câmera olha de leste para oeste
    const nx = Math.cos(yaw), ny = Math.sin(yaw)
    const rx = -ny, ry = nx // à direita de quem olha para a tela, olhando de leste
    const hw = s.w / 2
    const A = [s.x - rx * hw + nx * 0.3, s.y - ry * hw + ny * 0.3], B = [s.x + rx * hw + nx * 0.3, s.y + ry * hw + ny * 0.3]
    // quem olha de leste vê o norte à direita: o sentido da leitura é +r
    pos.push(A[0], bottom, -A[1], B[0], bottom, -B[1], B[0], bottom + s.h, -B[1], A[0], bottom, -A[1], B[0], bottom + s.h, -B[1], A[0], bottom + s.h, -A[1])
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
    // moldura e pernas
    kit.box(s.x, bottom - 0.3, -s.y, 0.5, s.h + 0.6, s.w + 0.6, yaw, dark, { finish: FINISH.STEEL })
    for (const k of [-0.35, 0.35]) kit.box(s.x + rx * s.w * k, ground, -(s.y + ry * s.w * k), 0.4, bottom - ground, 0.5, yaw, dark, { finish: FINISH.STEEL })
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide }))
  mesh.frustumCulled = false
  let last = 0
  return {
    mesh,
    update(cars, title, now) {
      if (now - last < 2000 && last) return
      last = now
      const ranked = [...cars.values()].filter((car) => car.state !== 'out').sort((a, b) => b.dist - a.dist).slice(0, 3)
      g.fillStyle = '#0a0b0d'
      g.fillRect(0, 0, c.width, c.height)
      g.fillStyle = '#e10600'
      g.fillRect(0, 0, c.width, 46)
      g.fillStyle = '#ffffff'
      g.textBaseline = 'middle'
      g.textAlign = 'left'
      g.font = `700 36px ${FONT}`
      g.fillText('NASRACE', 16, 25)
      g.textAlign = 'right'
      g.font = `600 26px ${FONT}`
      g.fillText(title, c.width - 16, 25)
      ranked.forEach((car, i) => {
        const y = 66 + i * 72
        g.fillStyle = car.team.color
        g.fillRect(16, y, 12, 58)
        g.fillStyle = '#ffffff'
        g.textAlign = 'left'
        g.font = `700 54px ${FONT}`
        g.fillText(`${i + 1}  ${car.code}`, 42, y + 31)
        g.textAlign = 'right'
        g.font = `600 44px ${FONT}`
        g.fillText(car.data.cpu != null ? `${car.data.cpu.toFixed(1)}%` : '–', c.width - 16, y + 31)
      })
      texture.needsUpdate = true
    },
  }
}

/** Bandeiras nos mastros: balançam no shader, e param junto com as animações do sistema. */
export function createFlags(points, rand) {
  const SEG = 6
  const positions = []
  const uvs = []
  const index = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    positions.push(t, 0, 0, t, 1, 0)
    uvs.push(t, 0, t, 1)
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vColor;
      varying float vShade;
      void main() {
        vec3 p = position;
        float phase = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2];
        float wave = sin(p.x * 7.0 - uTime * 5.5 + phase) * p.x;
        p.z += wave * 0.2;
        p.y -= p.x * p.x * 0.1;
        vColor = instanceColor;
        vShade = 0.72 + 0.34 * cos(p.x * 7.0 - uTime * 5.5 + phase);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: 'varying vec3 vColor; varying float vShade; void main() { gl_FragColor = vec4(vColor * vShade * 2.4, 1.0); }',
  })
  const mesh = new THREE.InstancedMesh(geometry, material, points.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const axis = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  points.forEach((f, i) => {
    q.setFromAxisAngle(axis, f.yaw ?? 0.6 + (rand() - 0.5) * 0.3)
    m.compose(new THREE.Vector3(f.x, f.y, -f.z), q, new THREE.Vector3(f.size * 1.5, f.size, 1))
    mesh.setMatrixAt(i, m)
    color.set(f.color)
    mesh.setColorAt(i, color)
  })
  mesh.frustumCulled = false
  return mesh
}
