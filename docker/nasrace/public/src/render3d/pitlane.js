// Prédio dos boxes: garagens abertas, com o interior montado, sacada com gente, andar de vidro e
// cobertura. Mais a torre de controle e a grande cobertura em arcos do paddock.

import { GARAGES, garageCenter } from '../circuit.js'
import { CONTROL_TOWER, PIT_BUILDING, garagePoint } from '../venue.js'
import { BRAND, boardSeed } from './brands.js'
import { FINISH, Frame, rgb, shade, triangulate } from './kit.js'

const W = (x, y, h) => [x, h, -y]
// O pit lane corre paralelo à parede: esta é a distância dele, em metros, na ponta norte dela.
const WEST_START = 420

const DOOR = 4.7 // altura do vão da garagem
const SLAB = 5.5 // piso da sacada
const BALCONY = 0.95 // quanto a sacada avança sobre a calçada: mais que isso esconderia a garagem
const GLASS = rgb('#5a7080')
const GARAGE_DEPTH = 12
const CONCRETE = rgb('#b7b5ac')
const STEEL = rgb('#7c8187')

const ccw = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return a > 0 ? ring : [...ring].reverse()
}

/** Interior de uma garagem: piso, paredes claras, luz no forro, armários e pneus. */
function addGarage(f, slot, simple, rand, people) {
  const { x0, x1, floor } = slot
  const d = -GARAGE_DEPTH
  const wall = rgb('#d4d6d6')
  const lit = FINISH.LIT
  f.quad([x0, floor, 0], [x1, floor, 0], [x1, floor, d], [x0, floor, d], rgb('#a8a6a0'), FINISH.EPOXY, undefined, rand())
  f.quad([x0, DOOR, d], [x1, DOOR, d], [x1, DOOR, 0], [x0, DOOR, 0], rgb('#e8e8e4'), lit)
  f.quad([x0, floor, d], [x1, floor, d], [x1, DOOR, d], [x0, DOOR, d], wall, lit)
  f.quad([x0, floor, 0], [x0, floor, d], [x0, DOOR, d], [x0, DOOR, 0], shade(wall, 0.86), lit)
  f.quad([x1, floor, d], [x1, floor, 0], [x1, DOOR, 0], [x1, DOOR, d], shade(wall, 0.86), lit)
  if (simple) return
  // onde o carro para: uma moldura pintada no chão
  const mid = (x0 + x1) / 2
  const paint = rgb('#e8e8e2')
  const y = floor + 0.015
  for (const [ax, az, bx, bz] of [[mid - 1.2, -1.2, mid + 1.2, -1.32], [mid - 1.2, -7.2, mid + 1.2, -7.32], [mid - 1.2, -1.2, mid - 1.08, -7.32], [mid + 1.08, -1.2, mid + 1.2, -7.32]]) {
    f.quad([ax, y, az], [bx, y, az], [bx, y, bz], [ax, y, bz], paint)
  }
  // armários de ferramentas de um lado, pilhas de pneus do outro
  const dark = rgb('#23262b')
  const top = rgb('#8f9499')
  for (let k = 0; k < 3; k++) {
    const z1 = -2.4 - k * 2.6
    f.box(x0 + 0.08, x0 + 0.72, floor, floor + 1.15, z1 - 2.2, z1, dark, { top, skip: '-x' })
  }
  for (let k = 0; k < 3; k++) {
    const z = -2.6 - k * 1.05
    f.column(x1 - 0.55, z, floor, floor + 1.25, 0.34, rgb('#101114'), 8, FINISH.PLAIN)
    f.quad([x1 - 0.82, floor + 0.62, z + 0.32], [x1 - 0.28, floor + 0.62, z + 0.32], [x1 - 0.28, floor + 0.7, z + 0.32], [x1 - 0.82, floor + 0.7, z + 0.32], rgb('#c4c6c8'))
  }
  // na calçada: carrinho de ferramentas, pneus prontos e o macaco da frente
  const cart = x0 + 1.1 + rand() * 1.2
  f.box(cart, cart + 1.05, floor + 0.2, floor + 1.05, 0.7, 1.4, rgb('#2a2d31'), { top: rgb('#8f9499') })
  for (const k of [0, 1]) f.quad([cart + k, floor, 1.38], [cart + k + 0.05, floor, 1.38], [cart + k + 0.05, floor + 0.2, 1.38], [cart + k, floor + 0.2, 1.38], rgb('#101114'))
  for (let k = 0; k < 2; k++) {
    const lx = x1 - 1 - k * 0.85
    f.column(lx, 1.3, floor, floor + 0.68, 0.33, rgb('#101114'), 8, FINISH.PLAIN)
    f.quad([lx - 0.19, floor + 0.682, 1.49], [lx + 0.19, floor + 0.682, 1.49], [lx + 0.19, floor + 0.682, 1.11], [lx - 0.19, floor + 0.682, 1.11], rgb('#c4c6c8'))
  }
  for (let k = 0; k < 2; k++) {
    const lx = mid + (rand() - 0.5) * (x1 - x0 - 2), lz = 1.2 + rand() * 1.3
    const [mx, my] = f.map(lx, lz)
    people.ground.push({ x: mx, y: f.h + floor, z: -my, yaw: rand() * 6.28 })
  }
  // quem trabalha ali
  const count = 2 + Math.floor(rand() * 3)
  for (let k = 0; k < count; k++) {
    const lx = x0 + 1.5 + rand() * (x1 - x0 - 3), lz = -1 - rand() * 7
    const [mx, my] = f.map(lx, lz)
    people.ground.push({ x: mx, y: f.h + floor, z: -my, yaw: rand() * 6.28 })
  }
}

export function addPitBuilding(kit, field, { geoPaddock, people, rand, simple = false }) {
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
  // Na peça: +x corre ao longo da parede, de norte para sul, e +z aponta para o pit lane.
  const f = new Frame(kit, a[0], a[1], base, Math.atan2(along[1], along[0]))
  const west2pit = Math.atan2(-across[1], -across[0])

  // cobertura: módulos de membrana sobre toda a planta
  kit.polygon(outline, roofY, rgb('#e9e9e4'), FINISH.MEMBRANE, coord, angle)

  // leste e pontas: fachada de escritório, com a base escurecida; platibanda em volta do telhado
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length]
    if ((p === a && q === b) || (p === b && q === a)) continue
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const y0 = roofY(p), y1 = roofY(q)
    const wall = rgb('#c9cac6')
    const dark = shade(wall, 0.66)
    kit.quadShaded(W(p[0], p[1], base), W(q[0], q[1], base), W(q[0], q[1], y1), W(p[0], p[1], y0), [dark, dark, wall, wall], FINISH.OFFICE, [[0, 0], [len, 0], [len, y1 - base], [0, y0 - base]], 0.31)
    const cap = rgb('#dededa')
    kit.quad(W(p[0], p[1], y0), W(q[0], q[1], y1), W(q[0], q[1], y1 + 0.45), W(p[0], p[1], y0 + 0.45), cap)
    kit.quad(W(q[0], q[1], y1 + 0.45), W(p[0], p[1], y0 + 0.45), W(p[0], p[1], y0), W(q[0], q[1], y1), shade(cap, 0.76))
    if (simple || len < 30) continue
    // portas de serviço e toldos no térreo, de 24 em 24 m
    const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len
    const nx = uy, ny = -ux
    for (let t = 12; t < len - 6; t += 24) {
      const door = (lo, hi, h, out, tint, finish) => {
        const A = [p[0] + ux * lo + nx * out, p[1] + uy * lo + ny * out], B = [p[0] + ux * hi + nx * out, p[1] + uy * hi + ny * out]
        kit.quad(W(A[0], A[1], base), W(B[0], B[1], base), W(B[0], B[1], base + h), W(A[0], A[1], base + h), tint, finish)
      }
      door(t - 2.4, t + 2.4, 3.1, 0.04, rgb('#1d2024'))
      door(t - 2.1, t - 0.1, 2.7, 0.06, rgb('#34383d'))
      door(t + 0.1, t + 2.1, 2.7, 0.06, rgb('#34383d'))
      // toldo sobre a porta
      const C = [p[0] + ux * (t - 3) + nx * 1.8, p[1] + uy * (t - 3) + ny * 1.8], D = [p[0] + ux * (t + 3) + nx * 1.8, p[1] + uy * (t + 3) + ny * 1.8]
      const E = [p[0] + ux * (t + 3), p[1] + uy * (t + 3)], F = [p[0] + ux * (t - 3), p[1] + uy * (t - 3)]
      kit.quad(W(C[0], C[1], base + 3.3), W(D[0], D[1], base + 3.3), W(E[0], E[1], base + 3.7), W(F[0], F[1], base + 3.7), rgb('#2c2f33'))
      kit.quad(W(C[0], C[1], base + 3.15), W(D[0], D[1], base + 3.15), W(D[0], D[1], base + 3.3), W(C[0], C[1], base + 3.3), rgb('#e10600'))
    }
  }

  // Calçada de trabalho entre o pit lane e as garagens.
  const yAlong = (t) => garagePoint(WEST_START + t).z + 0.1
  const out = 5
  for (let t = 0; t < lenWest; t += 12) {
    const t1 = Math.min(lenWest, t + 12)
    const y0 = yAlong(t) - base, y1 = yAlong(t1) - base
    f.quad([t, y0, out], [t1, y1, out], [t1, y1, 0], [t, y0, 0], rgb('#8f8d85'), FINISH.CONCRETE, [[t, 0], [t1, 0], [t1, out], [t, out]], 0.6)
    // faixa amarela: daqui para dentro é área de trabalho
    f.quad([t, y0 + 0.012, 3.1], [t1, y1 + 0.012, 3.1], [t1, y1 + 0.012, 2.98], [t, y0 + 0.012, 2.98], rgb('#d8b22d'))
  }

  // Vãos das garagens.
  const slots = []
  for (let i = 0; i < GARAGES.slots; i++) {
    const g = garagePoint(garageCenter(i))
    const t = (g.x - a[0]) * along[0] + (g.y - a[1]) * along[1]
    const half = ((GARAGES.to - GARAGES.from - 12) / GARAGES.slots) / 2 - 0.55
    if (t - half < 0 || t + half > lenWest) {
      slots.push(null)
      continue
    }
    slots.push({ t, half, x0: t - half, x1: t + half, floor: yAlong(t) - base })
  }
  const open = slots.filter(Boolean)

  // Parede de baixo: pilares entre os vãos e a verga contínua em cima.
  const pier = rgb('#c4c5c0')
  let cursor = 0
  const pierFace = (x0, x1) => {
    if (x1 - x0 < 0.01) return
    f.quad([x0, 0, 0], [x1, 0, 0], [x1, DOOR, 0], [x0, DOOR, 0], pier, FINISH.CONCRETE, [[x0, 0], [x1, 0], [x1, DOOR], [x0, DOOR]], 0.45)
  }
  for (const slot of open) {
    pierFace(cursor, slot.x0)
    cursor = slot.x1
    addGarage(f, slot, simple, rand, people)
  }
  pierFace(cursor, lenWest)
  f.quad([0, DOOR, 0], [lenWest, DOOR, 0], [lenWest, SLAB, 0], [0, SLAB, 0], rgb('#2a2d31'))

  // Sacada: laje em balanço, guarda-corpo e o painel escuro onde vão as placas de cada box.
  const deck = rgb('#c9cac6')
  f.box(0, lenWest, SLAB - 0.05, SLAB + 0.16, 0, BALCONY, deck, { top: rgb('#a9aaa6') })
  f.quad([0, SLAB - 0.05, BALCONY], [lenWest, SLAB - 0.05, BALCONY], [lenWest, SLAB - 0.05, 0], [0, SLAB - 0.05, 0], rgb('#55585c'))
  f.box(0, lenWest, DOOR + 0.05, SLAB - 0.05, BALCONY - 0.1, BALCONY - 0.01, rgb('#16181b'), { skip: 'top' })
  if (!simple) {
    const rail = SLAB + 1.25
    f.bar([0, rail, BALCONY - 0.07], [lenWest, rail, BALCONY - 0.07], 0.03, STEEL)
    for (let x = 0; x <= lenWest; x += 2.9) f.bar([x, SLAB + 0.16, BALCONY - 0.07], [x, rail, BALCONY - 0.07], 0.018, STEEL, { sides: 3 })
    for (const slot of open) {
      const count = 3 + Math.floor(rand() * 4)
      for (let k = 0; k < count; k++) {
        const lx = slot.t + (rand() - 0.5) * slot.half * 2
        const lz = 0.28 + rand() * 0.34
        const [mx, my] = f.map(lx, lz)
        people.ground.push({ x: mx, y: base + SLAB + 0.16, z: -my, yaw: west2pit + (rand() - 0.5) * 0.7 })
      }
    }
  }

  // Andar de vidro: montantes de concreto a cada box, beiral e letreiro correndo por toda a fachada.
  const up0 = SLAB + 0.16, up1 = 8.9
  f.quad([0, up0, 0], [lenWest, up0, 0], [lenWest, up1, 0], [0, up1, 0], GLASS, FINISH.GLASS, [[0, 0], [lenWest, 0], [lenWest, up1 - up0], [0, up1 - up0]], 0.13)
  for (const slot of open) f.box(slot.x1 + 0.2, slot.x1 + 0.9, up0, up1, 0, 0.3, CONCRETE, { skip: 'top' })
  f.box(0, lenWest, up1, H_WEST + 0.3, 0, 0.75, rgb('#dededa'), { top: rgb('#dededa') })
  const rep = Math.round(lenWest / (0.72 * 8))
  f.quad([0, up1 + 0.04, 0.77], [lenWest, up1 + 0.04, 0.77], [lenWest, up1 + 0.76, 0.77], [0, up1 + 0.76, 0.77], rgb('#ffffff'), FINISH.BOARD, [[0, 0], [rep, 0], [rep, 1], [0, 1]], boardSeed(BRAND.NASRACE))

  addRoofGear(kit, f, lenWest, rand, roofY, a, along, across, simple)
  addControlTower(kit, base, simple, people, rand)

  // Cobertura em arcos do paddock, do lado leste do pátio.
  if (geoPaddock) addPaddockHall(kit, field, geoPaddock, simple)

  return { slots, a, along, across, base, frame: f, lenWest }
}

/** Equipamentos sobre o telhado dos boxes: é o que quebra a cobertura branca vista de cima. */
function addRoofGear(kit, f, len, rand, roofY, a, along, across, simple) {
  if (simple) return
  const at = (t, d) => [a[0] + along[0] * t + across[0] * d, a[1] + along[1] * t + across[1] * d]
  const steel = rgb('#a2a6aa')
  const dark = rgb('#6d7176')
  for (let t = 24; t < len - 20; t += 38) {
    const p = at(t, 30 + rand() * 10)
    const y = roofY(p)
    const yaw = Math.atan2(along[1], along[0])
    kit.box(p[0], y, -p[1], 4.4, 1.5, 2.6, yaw, steel, { top: dark })
    for (const k of [-1.1, 1.1]) {
      kit.revolve([p[0] + Math.cos(yaw) * k, y + 1.5, -p[1] - Math.sin(yaw) * k], [p[0] + Math.cos(yaw) * k, y + 1.62, -p[1] - Math.sin(yaw) * k], [[0.72, 0], [0.72, 0.12], [0.001, 0.12]], 10, dark)
    }
  }
}

/** Torre de controle: pódio de escritórios e a sala de vidro inclinado, com antenas em cima. */
function addControlTower(kit, base, simple, people, rand) {
  const ring = ccw(CONTROL_TOWER)
  const top = base + 13.6
  const wall = rgb('#c4c5c0')
  const dark = shade(wall, 0.66)
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    kit.quadShaded(W(p[0], p[1], base), W(q[0], q[1], base), W(q[0], q[1], top), W(p[0], p[1], top), [dark, dark, wall, wall], FINISH.OFFICE, [[0, 0], [len, 0], [len, top - base], [0, top - base]], 0.52)
    const cap = rgb('#dededa')
    kit.quad(W(p[0], p[1], top), W(q[0], q[1], top), W(q[0], q[1], top + 0.5), W(p[0], p[1], top + 0.5), cap)
    kit.quad(W(q[0], q[1], top + 0.5), W(p[0], p[1], top + 0.5), W(p[0], p[1], top), W(q[0], q[1], top), shade(cap, 0.76))
  }
  kit.polygon(ring, top, rgb('#bcbcb6'), FINISH.SLAB, (p) => p, 0.7)

  // sala de controle, no eixo longo da torre
  const cx = -219, cy = -198
  const angle = Math.atan2(0.955, -0.295)
  const f = new Frame(kit, cx, cy, top, angle)
  const L = 15, Wd = 7
  const glass = GLASS
  const face = (x0, z0, x1, z1, lean) => {
    // vidro inclinado para fora, como nas torres de verdade
    const dx = x1 - x0, dz = z1 - z0
    const len = Math.hypot(dx, dz)
    const ox = (dz / len) * lean, oz = (-dx / len) * lean
    f.quad([x0, 0.2, z0], [x1, 0.2, z1], [x1 + ox, 4.2, z1 + oz], [x0 + ox, 4.2, z0 + oz], glass, FINISH.GLASS, [[0, 0], [len, 0], [len, 4], [0, 4]], 0.37)
  }
  f.box(-L, L, 0, 0.2, -Wd, Wd, rgb('#8f8d85'))
  face(-L, Wd, L, Wd, 0.9)
  face(L, Wd, L, -Wd, 0.9)
  face(L, -Wd, -L, -Wd, 0.9)
  face(-L, -Wd, -L, Wd, 0.9)
  const over = 1.8
  f.box(-L - over, L + over, 4.2, 4.65, -Wd - over, Wd + over, rgb('#2c2f33'), { top: rgb('#c9cac6'), topFinish: FINISH.SLAB })
  f.box(-5, 5, 4.65, 5.7, -3, 3, rgb('#a9aaa6'), { top: rgb('#7c8187') })
  // letreiro no beiral, dos dois lados
  const rep = Math.round((2 * (L + over)) / 3.6)
  f.quad([-L - over, 4.2, Wd + over + 0.02], [L + over, 4.2, Wd + over + 0.02], [L + over, 4.65, Wd + over + 0.02], [-L - over, 4.65, Wd + over + 0.02], rgb('#ffffff'), FINISH.BOARD, [[0, 0], [rep, 0], [rep, 1], [0, 1]], boardSeed(BRAND.NASRACE))
  f.quad([L + over, 4.2, -Wd - over - 0.02], [-L - over, 4.2, -Wd - over - 0.02], [-L - over, 4.65, -Wd - over - 0.02], [L + over, 4.65, -Wd - over - 0.02], rgb('#ffffff'), FINISH.BOARD, [[0, 0], [rep, 0], [rep, 1], [0, 1]], boardSeed(BRAND.NASRACE))
  if (simple) return
  // antenas e a parabólica
  f.bar([2, 5.7, 0], [2, 13, 0], 0.07, rgb('#d6d6d0'))
  f.bar([-3, 5.7, 1], [-3, 9.5, 1], 0.05, rgb('#d6d6d0'))
  kit.revolve(f.at(-1, 6.6, -2), f.at(-1.5, 7.2, -2.6), [[0.001, 0], [0.8, 0.3], [0.8, 0.34]], 12, rgb('#e6e6e0'))
  f.bar([-1, 5.7, -2], [-1, 6.6, -2], 0.05, rgb('#8f9499'))
  // gente no terraço, olhando a reta
  for (let k = 0; k < 10; k++) {
    const lx = (rand() - 0.5) * 26, lz = Wd + 2.2 + rand() * 2
    const [mx, my] = f.map(lx, lz)
    people.ground.push({ x: mx, y: top + 0.02, z: -my, yaw: angle - Math.PI / 2 + (rand() - 0.5) * 0.8 })
  }
}

/** A grande cobertura em arcos: abóbada com claraboia, beiral, fachada de vidro e marquises. */
function addPaddockHall(kit, field, pts, simple) {
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
  const white = rgb('#f0f0ec')
  const vault = (p) => {
    const v = uvOf(p)[1]
    return top + 2.6 * (1 - v * v)
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
  for (const [p, q, r] of triangulate(ring)) emit(p, q, r, simple ? 1 : 2)

  const glass = GLASS
  let along = 0
  const plinth = 0.7
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const yp = vault(p), yq = vault(q)
    // vidro até o beiral, com a base e o beiral em branco
    kit.quad(W(p[0], p[1], base + plinth), W(q[0], q[1], base + plinth), W(q[0], q[1], yq - 0.6), W(p[0], p[1], yp - 0.6), glass, FINISH.GLASS,
      [[along, 0], [along + len, 0], [along + len, yq - base], [along, yp - base]], 0.71)
    kit.quad(W(p[0], p[1], base), W(q[0], q[1], base), W(q[0], q[1], base + plinth), W(p[0], p[1], base + plinth), rgb('#5a5d61'))
    kit.quad(W(p[0], p[1], yp - 0.6), W(q[0], q[1], yq - 0.6), W(q[0], q[1], yq), W(p[0], p[1], yp), rgb('#edede8'))
    along += len
  }
  if (simple) return
  // marquises nas entradas: de 30 em 30 m ao longo do contorno
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (len < 12) continue
    const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len
    for (let t = 6; t < len - 6; t += 30) {
      const f = new Frame(kit, p[0] + ux * t, p[1] + uy * t, base, Math.atan2(uy, ux))
      f.box(-4, 4, 3.3, 3.55, 0, 3.2, rgb('#2c2f33'), { top: rgb('#8f9499') })
      for (const lx of [-3.6, 3.6]) f.bar([lx, 0, 3.1], [lx, 3.3, 3.1], 0.06, STEEL)
      f.quad([-1.8, 0.02, 0.05], [1.8, 0.02, 0.05], [1.8, 2.8, 0.05], [-1.8, 2.8, 0.05], rgb('#14171a'))
    }
  }
}
