// Paddock: caminhões das equipes, motorhomes, tendas, coberturas do pátio, carros estacionados e o
// que fica em volta deles: pneus, caixas e a gente que trabalha ali.

import { TEAMS } from '../race.js'
import { HOSPITALITY, MASTS, PARKING, TENTS, TRUCKS } from '../venue.js'
import { BRAND, boardSeed } from './brands.js'
import { FINISH, Frame, rgb, shade } from './kit.js'

const W = (x, y, h) => [x, h, -y]
const BRAND_OF = { draft: 'DRAFT', nextcloud: 'SERVER', finance: 'FINANCE', portfolio: 'PORTFOLIO', voalberto: 'VOALBERTO', monitor: 'PULSE', infra: 'SERVER' }
const TEAM_NUMBER = Object.fromEntries(Object.keys(TEAMS).map((id, i) => [id, i + 1]))
const BLACK = rgb('#0e0f11')
const CHROME = rgb('#aeb2b6')
const WHITE = rgb('#e6e6e0')
const GLASS = rgb('#5a7080')
const WINDSHIELD = rgb('#26333c')

// ------------------------------------------------------------------ caminhões

/** Perfil lateral da cabine: de trás para a frente, por baixo, e voltando pelo teto. */
const CAB = [[6.9, 1.12], [10.92, 1.12], [10.92, 2.2], [10.36, 3.42], [9.72, 3.6], [6.9, 3.98]]

/** Na peça: a carreta vai de x = -8,6 a 5, e a frente do cavalo mecânico chega a x = 10,9. */
function addTruck(kit, field, t, people, rand, simple) {
  const f = new Frame(kit, t.x, t.y, field.heightAt(t.x, t.y) - 0.05, t.angle)
  const team = rgb(TEAMS[t.team].color)
  const X0 = -8.6, X1 = 5, FLOOR = 1.16, TOP = 4.02, HW = 1.27
  const roof = rgb('#d3d4d1')

  // ---- carreta
  f.box(X0, X1, FLOOR, TOP, -HW, HW, team, { finish: FINISH.LIVERY, top: roof, topFinish: FINISH.METAL, seed: rand() })
  f.box(X0 + 0.6, X1 - 0.6, 0.82, FLOOR, -HW + 0.14, HW - 0.14, BLACK, { skip: 'top' })
  for (const side of [-1, 1]) {
    const z = side * (HW + 0.012)
    const panel = (x0, x1, y0, y1, tint, finish = FINISH.LIVERY, uv, seed = 0) => {
      if (side > 0) f.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], tint, finish, uv, seed)
      else f.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], tint, finish, uv && [uv[1], uv[0], uv[3], uv[2]], seed)
    }
    // saia prateada embaixo, faixa escura em cima e o painel com o nome do projeto no meio
    panel(X0, X1, FLOOR, FLOOR + 0.62, CHROME)
    panel(X0, X1, TOP - 0.34, TOP - 0.02, shade(team, 0.45))
    const boardW = 8.4
    const mid = (X0 + X1) / 2
    panel(mid - boardW / 2, mid + boardW / 2, FLOOR + 0.84, FLOOR + 0.84 + boardW / 8, rgb('#ffffff'), FINISH.BOARD, [[0, 0], [1, 0], [1, 1], [0, 1]], boardSeed(BRAND[BRAND_OF[t.team]]))
    // saia escura entre as rodas
    panel(X0 + 5.2, X1 - 0.8, 0.62, FLOOR, rgb('#1b1d21'), FINISH.PLAIN)
    if (simple) continue
    // luzes de posição ao longo da lateral
    for (let x = X0 + 1; x < X1; x += 3) panel(x, x + 0.1, FLOOR + 0.02, FLOOR + 0.1, rgb('#ffb020'), FINISH.EMISSIVE)
  }
  // portas de trás, com vincos, lanternas e placa
  const R = X0 - 0.012
  const door = (z0, z1, y0, y1, tint, finish = 0) => f.quad([R, y0, z0], [R, y0, z1], [R, y1, z1], [R, y1, z0], tint, finish)
  door(-0.012, 0.012, FLOOR, TOP, shade(team, 0.3))
  door(-HW, HW, FLOOR, FLOOR + 0.22, rgb('#17191c'))
  for (const s of [-1, 1]) door(Math.min(s * 0.86, s * 1.2), Math.max(s * 0.86, s * 1.2), FLOOR + 0.02, FLOOR + 0.18, rgb('#ff2412'), FINISH.EMISSIVE)
  // O teto é o que a câmera mais vê: nome do projeto, ar-condicionado e escotilha.
  f.quad([X0 + 0.5, TOP + 0.012, 0.86], [1.9, TOP + 0.012, 0.86], [1.9, TOP + 0.012, -0.86], [X0 + 0.5, TOP + 0.012, -0.86], rgb('#ffffff'), FINISH.BOARD, [[0, 0], [0.76, 0], [0.76, 1], [0, 1]], boardSeed(BRAND[BRAND_OF[t.team]]))
  f.box(2.2, 3.5, TOP, TOP + 0.34, -0.62, 0.62, rgb('#8f9499'), { top: rgb('#6f7377') })
  if (!simple) {
    // pés de apoio
    for (const s of [-1, 1]) f.box(2.6, 2.75, 0, 0.9, s * 1 - 0.08, s * 1 + 0.08, rgb('#2a2d31'), { skip: 'top' })
  }

  // ---- cavalo mecânico
  f.box(2.4, 10.7, 0.82, 1.14, -0.5, 0.5, BLACK)
  f.prism(CAB, -1.24, 1.24, team, {
    finish: FINISH.LIVERY,
    style: (i) => {
      if (i === 1) return { tint: rgb('#17191c'), finish: FINISH.PLAIN }
      if (i === 2) return { tint: WINDSHIELD, finish: FINISH.GLASS, uv: [[0, 0], [2.5, 0], [2.5, 1.3], [0, 1.3]], seed: 0.17 }
      return null
    },
    skip: [0],
  })
  // janelas e faixa da porta
  for (const side of [-1, 1]) {
    const z = side * 1.245
    const q = (x0, x1, y0, y1, tint, finish = 0, uv) => (side > 0
      ? f.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], tint, finish, uv)
      : f.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], tint, finish, uv))
    q(9.32, 10.3, 2.24, 3.1, WINDSHIELD, FINISH.GLASS, [[0, 0], [1, 0], [1, 0.8], [0, 0.8]])
    q(7, 10.88, 1.12, 1.62, shade(team, 0.5), FINISH.LIVERY)
    // retrovisor
    if (!simple) {
      f.box(10.42, 10.52, 2.62, 3.04, side * 1.46 - 0.07, side * 1.46 + 0.07, rgb('#17191c'))
      f.bar([10.46, 2.86, side * 1.24], [10.46, 2.86, side * 1.4], 0.016, CHROME, { sides: 3 })
    }
  }
  // faróis e para-choque
  f.box(10.92, 11.06, 0.72, 1.28, -1.24, 1.24, rgb('#23262b'))
  for (const s of [-1, 1]) f.quad([11.07, 1.0, s * 0.74 + 0.3], [11.07, 1.0, s * 0.74 - 0.3], [11.07, 1.22, s * 0.74 - 0.3], [11.07, 1.22, s * 0.74 + 0.3], rgb('#fff4dc'), FINISH.EMISSIVE)
  // defletor sobre a cabine
  f.box(7.1, 8.8, 3.96, 4.02, -0.95, 0.95, rgb('#8f9499'))

  if (simple) {
    for (const side of [-1, 1]) {
      for (const x of [X0 + 1.6, X0 + 2.95, X0 + 4.3, 4.6, 9.6]) f.box(x - 0.5, x + 0.5, 0, 1, side * 1.14 - 0.18, side * 1.14 + 0.18, BLACK)
    }
  } else {
    // tanques e chaminés entre a cabine e a carreta
    for (const side of [-1, 1]) {
      const z = side * 0.95
      kit.revolve(f.at(5.5, 0.72, z), f.at(6.85, 0.72, z), [[0.001, 0], [0.3, 0.02], [0.3, 1.33], [0.001, 1.35]], 8, CHROME, FINISH.STEEL)
      f.column(6.2, side * 1.05, 1.1, 4.3, 0.06, CHROME, 6)
    }
    const hub = rgb('#8a8d91')
    for (const side of [-1, 1]) {
      const z = side * 1.08
      for (const x of [X0 + 1.6, X0 + 2.95, X0 + 4.3]) f.wheel(x, z, 0.5, 0.36, BLACK, hub)
      f.wheel(4.6, z, 0.52, 0.36, BLACK, hub)
      f.wheel(4.6, side * 0.7, 0.52, 0.34, BLACK, hub)
      f.wheel(9.6, z, 0.52, 0.34, BLACK, hub)
    }
  }

  // ---- em volta: pneus, caixas e a equipe
  if (simple) return
  const tire = (lx, lz, levels) => {
    f.column(lx, lz, 0, 0.3 * levels, 0.34, rgb('#101114'), 8, FINISH.PLAIN)
    f.quad([lx - 0.2, 0.3 * levels + 0.002, lz + 0.2], [lx + 0.2, 0.3 * levels + 0.002, lz + 0.2], [lx + 0.2, 0.3 * levels + 0.002, lz - 0.2], [lx - 0.2, 0.3 * levels + 0.002, lz - 0.2], rgb('#c4c6c8'))
  }
  // atrás da carreta, onde se descarrega
  for (let k = 0; k < 3; k++) tire(X0 - 2.2 - rand() * 2, (k - 1) * 0.85 + (rand() - 0.5) * 0.2, 2 + Math.floor(rand() * 3))
  f.box(X0 - 4.2, X0 - 3, 0, 1, -1.5 - rand(), -0.4, rgb('#3a3d41'), { top: rgb('#6f7377') })
  const number = TEAM_NUMBER[t.team]
  const crew = 2 + Math.floor(rand() * 3)
  for (let k = 0; k < crew; k++) {
    const [mx, my] = f.map(X0 - 1.5 - rand() * 3.5, (rand() - 0.5) * 2.6)
    people.onFoot(mx, my, rand() * 6.28, { uniform: number })
  }
}

// ------------------------------------------------------------------ motorhomes

function addParasol(kit, f, lx, y0, lz, tint, simple, rand, people) {
  f.bar([lx, y0, lz], [lx, y0 + 2.5, lz], 0.03, rgb('#d6d6d0'), { sides: 3, finish: FINISH.PLAIN })
  kit.revolve(f.at(lx, y0 + 2.15, lz), f.at(lx, y0 + 2.72, lz), [[1.55, 0], [0.001, 0.57]], 8, tint, FINISH.PLAIN)
  if (simple) return
  f.column(lx, lz, y0, y0 + 0.74, 0.36, rgb('#e4e4de'), 8, FINISH.PLAIN)
  const seated = 1 + Math.floor(rand() * 3)
  for (let k = 0; k < seated; k++) {
    const a = rand() * 6.28
    const [mx, my] = f.map(lx + Math.cos(a) * 0.9, lz + Math.sin(a) * 0.9)
    people.ground.push({ x: mx, y: f.h + y0, z: -my, yaw: rand() * 6.28 })
  }
}

function addHospitality(kit, field, h, toward, people, rand, simple) {
  const f = new Frame(kit, h.x, h.y, field.heightAt(h.x, h.y) - 0.15, h.angle)
  const team = rgb(TEAMS[h.team].color)
  const L = 7.4, Wd = 4.6
  const glass = GLASS
  const number = TEAM_NUMBER[h.team]
  const brandSeed = boardSeed(BRAND[BRAND_OF[h.team]])
  f.box(-L - 0.5, L + 0.5, 0, 0.28, -Wd - 0.5, Wd + 0.5, rgb('#7f8186'), { top: rgb('#a6a7a3'), topFinish: FINISH.SLAB, seed: rand() })
  // térreo de vidro, recuado, com pilares nos cantos
  f.box(-L + 0.3, L - 0.3, 0.28, 3.4, -Wd + 0.3, Wd - 0.3, glass, { finish: FINISH.GLASS, uv: true, seed: rand(), top: rgb('#1a1c1f'), topFinish: FINISH.PLAIN })
  for (const x of [-L + 0.3, L - 0.3]) for (const z of [-Wd + 0.3, Wd - 0.3]) f.box(x - 0.14, x + 0.14, 0.28, 3.4, z - 0.14, z + 0.14, rgb('#d9d9d4'), { skip: 'top' })
  // cinta na cor da equipe, com o nome do projeto nos lados compridos
  f.box(-L - 0.25, L + 0.25, 3.4, 4.3, -Wd - 0.25, Wd + 0.25, team, { finish: FINISH.LIVERY, top: rgb('#d9d9d4') })
  for (const side of [-1, 1]) {
    const z = side * (Wd + 0.27)
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
    if (side > 0) f.quad([-3.2, 3.47, z], [3.2, 3.47, z], [3.2, 4.27, z], [-3.2, 4.27, z], rgb('#ffffff'), FINISH.BOARD, uv, brandSeed)
    else f.quad([3.2, 3.47, z], [-3.2, 3.47, z], [-3.2, 4.27, z], [3.2, 4.27, z], rgb('#ffffff'), FINISH.BOARD, uv, brandSeed)
  }
  // andar de cima, de vidro, e a laje do terraço em balanço
  f.box(-L + 0.1, L - 0.1, 4.3, 6.9, -Wd + 0.1, Wd - 0.1, glass, { finish: FINISH.GLASS, uv: true, seed: rand(), skip: 'top' })
  f.box(-L - 0.45, L + 0.45, 6.9, 7.16, -Wd - 0.45, Wd + 0.45, rgb('#dededa'), { top: rgb('#b4b5b1'), topFinish: FINISH.SLAB, seed: rand() })
  // marquise da entrada, virada para os caminhões
  const zA = toward * (Wd - 0.2), zB = toward * (Wd + 2.6)
  f.box(-3.6, 3.6, 3.02, 3.26, Math.min(zA, zB), Math.max(zA, zB), team, { finish: FINISH.LIVERY, top: rgb('#e6e6e0') })
  for (const x of [-3.3, 3.3]) f.bar([x, 0.28, zB - toward * 0.3], [x, 3.02, zB - toward * 0.3], 0.05, rgb('#d9d9d4'))
  if (simple) return

  // guarda-corpo do terraço, ombrelones e gente lá em cima
  const yT = 7.16, rail = yT + 1.05
  const x1 = L + 0.3, z1 = Wd + 0.3
  for (const [a, b] of [[[-x1, rail, z1], [x1, rail, z1]], [[x1, rail, z1], [x1, rail, -z1]], [[x1, rail, -z1], [-x1, rail, -z1]], [[-x1, rail, -z1], [-x1, rail, z1]]]) f.bar(a, b, 0.024, CHROME, { sides: 3 })
  for (let x = -x1; x <= x1; x += 2.4) for (const z of [-z1, z1]) f.bar([x, yT, z], [x, rail, z], 0.016, CHROME, { sides: 3 })
  for (const x of [-4, 4]) addParasol(kit, f, x, yT, 0, x < 0 ? team : WHITE, simple, rand, people)
  // lá fora: mesas, plantas e quem chega
  for (const x of [-5.2, 0, 5.2]) addParasol(kit, f, x, 0.28, toward * (Wd + 4.2), x === 0 ? team : WHITE, simple, rand, people)
  const green = rgb('#2f5a2c')
  for (const x of [-7, -4, 4, 7]) {
    const z = toward * (Wd + 0.8)
    f.box(x - 0.45, x + 0.45, 0.28, 0.72, z - 0.4, z + 0.4, rgb('#3b3d40'), { top: green })
    kit.revolve(f.at(x, 0.7, z), f.at(x, 1.7, z), [[0.45, 0], [0.5, 0.35], [0.001, 1]], 6, green, FINISH.PLAIN)
  }
  const count = 6 + Math.floor(rand() * 7)
  for (let k = 0; k < count; k++) {
    const lx = (rand() - 0.5) * 2 * (L + 1), lz = toward * (Wd + 1.2 + rand() * 7)
    const [mx, my] = f.map(lx, lz)
    const walking = rand() < 0.45
    people.onFoot(mx, my, rand() * 6.28, { uniform: rand() < 0.45 ? number : 0, ...(walking ? { path: 4 + rand() * 10, speed: 0.9 + rand() * 0.6 } : {}) })
  }
}

// ------------------------------------------------------------------ tendas

function addTent(kit, field, t, people, rand, simple) {
  const f = new Frame(kit, t.x, t.y, field.heightAt(t.x, t.y) - 0.25, t.angle)
  const canvas = rgb(t.color)
  const L = t.length / 2, Wd = t.width / 2
  const eave = 3.3, ridge = eave + Math.min(2.6, t.width * 0.24)
  const over = 0.3
  f.box(-L, L, 0, eave, -Wd, Wd, shade(canvas, 0.9), { finish: FINISH.CANVAS, uv: true, skip: 'top', ao: 0.68, seed: rand() })
  const rise = Math.hypot(Wd + over, ridge - eave)
  const uv = [[0, 0], [2 * L + 2 * over, 0], [2 * L + 2 * over, rise], [0, rise]]
  f.quad([-L - over, eave - 0.08, Wd + over], [L + over, eave - 0.08, Wd + over], [L + over, ridge, 0], [-L - over, ridge, 0], canvas, FINISH.CANVAS, uv, 0.2)
  f.quad([L + over, eave - 0.08, -Wd - over], [-L - over, eave - 0.08, -Wd - over], [-L - over, ridge, 0], [L + over, ridge, 0], canvas, FINISH.CANVAS, uv, 0.4)
  f.tri([L, eave, Wd], [L, eave, -Wd], [L, ridge, 0], shade(canvas, 0.94))
  f.tri([-L, eave, -Wd], [-L, eave, Wd], [-L, ridge, 0], shade(canvas, 0.94))
  // o forro aparece por baixo do beiral
  f.quad([-L - over, eave - 0.08, Wd + over], [-L, eave - 0.08, Wd], [L, eave - 0.08, Wd], [L + over, eave - 0.08, Wd + over], shade(canvas, 0.55))
  f.quad([L + over, eave - 0.08, -Wd - over], [L, eave - 0.08, -Wd], [-L, eave - 0.08, -Wd], [-L - over, eave - 0.08, -Wd - over], shade(canvas, 0.55))
  // friso na cumeeira
  f.box(-L - over, L + over, ridge - 0.02, ridge + 0.05, -0.1, 0.1, shade(canvas, 0.8))
  if (simple) return
  // janelas de PVC nos lados compridos, e a porta numa ponta
  const glass = GLASS
  for (let x = -L + 2.5; x < L - 2; x += 5) {
    f.quad([x - 1.7, 1.05, Wd + 0.02], [x + 1.7, 1.05, Wd + 0.02], [x + 1.7, 2.55, Wd + 0.02], [x - 1.7, 2.55, Wd + 0.02], glass, FINISH.GLASS, [[0, 0], [3.4, 0], [3.4, 1.5], [0, 1.5]], 0.91)
    f.quad([x + 1.7, 1.05, -Wd - 0.02], [x - 1.7, 1.05, -Wd - 0.02], [x - 1.7, 2.55, -Wd - 0.02], [x + 1.7, 2.55, -Wd - 0.02], glass, FINISH.GLASS, [[0, 0], [3.4, 0], [3.4, 1.5], [0, 1.5]], 0.93)
  }
  f.quad([L + 0.02, 0, 1.4], [L + 0.02, 0, -1.4], [L + 0.02, 2.5, -1.4], [L + 0.02, 2.5, 1.4], rgb('#15171a'))
  f.box(L, L + 1.8, 2.6, 2.72, -1.9, 1.9, shade(canvas, 0.96))
  for (const z of [-1.7, 1.7]) f.bar([L + 1.65, 0, z], [L + 1.65, 2.6, z], 0.03, CHROME, { sides: 3 })
  // gente na porta
  const count = Math.min(10, 2 + Math.floor(t.length / 7))
  for (let k = 0; k < count; k++) {
    const [mx, my] = f.map(L + 2 + rand() * 6, (rand() - 0.5) * 7)
    const walking = rand() < 0.3
    people.onFoot(mx, my, rand() * 6.28, walking ? { path: 3 + rand() * 8, speed: 0.9 + rand() * 0.5 } : {})
  }
}

// ------------------------------------------------------------------ coberturas do pátio

/** Cobertura tensionada: mastro central e uma estrela de lona branca, como na vista aérea. */
function addShade(kit, field, m, people, rand, simple) {
  const ground = field.heightAt(m.x, m.y) - 0.2
  const white = rgb('#ecece6')
  const top = ground + 10.8
  kit.revolve(W(m.x, m.y, ground), W(m.x, m.y, top), [[0.17, 0], [0.11, 10.8], [0.001, 10.95]], 8, white, FINISH.PLAIN)
  const POINTS = 8
  const rim = []
  for (let k = 0; k < POINTS * 2; k++) {
    const a = (k / (POINTS * 2)) * Math.PI * 2 + 0.2
    const tip = k % 2 === 0
    const r = tip ? 8.4 : 5.4
    rim.push(W(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, ground + (tip ? 6.4 : 8.2)))
  }
  const apex = W(m.x, m.y, top - 0.7)
  for (let k = 0; k < rim.length; k++) {
    const p = rim[k], q = rim[(k + 1) % rim.length]
    // uma face mais clara e outra mais escura desenham os gomos da lona, sem textura
    kit.tri(apex, p, q, k % 2 ? white : shade(white, 0.9), FINISH.PLAIN)
    kit.tri(apex, q, p, shade(white, 0.68), FINISH.PLAIN)
  }
  if (simple) return
  // cabos e gente na sombra
  for (let k = 0; k < rim.length; k += 2) kit.bar(rim[k], W(m.x + (rim[k][0] - m.x) * 1.25, m.y + (-rim[k][2] - m.y) * 1.25, field.heightAt(m.x, m.y)), 0.012, rgb('#6d7176'), { sides: 3 })
  const count = 4 + Math.floor(rand() * 6)
  for (let k = 0; k < count; k++) {
    const a = rand() * 6.28, r = 1.5 + rand() * 5.5
    const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r
    people.onFoot(x, y, rand() * 6.28)
  }
}

// ------------------------------------------------------------------ carros estacionados

const SEDAN = [[-2.2, 0.3], [2.2, 0.3], [2.2, 0.72], [1.02, 0.84], [0.36, 1.32], [-0.86, 1.34], [-1.72, 0.88], [-2.2, 0.82]]

function addParkedCars(kit, field, rand, simple) {
  const paints = ['#d9d9d6', '#b0b2b4', '#1c1e20', '#6d7073', '#7a1c1c', '#1d3f75', '#e6e6e2', '#3a3d40']
  const glass = rgb('#141a20')
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
        const f = new Frame(kit, x, y, field.heightAt(x, y) - 0.03, yaw)
        const paint = rgb(paints[Math.floor(rand() * paints.length)])
        f.prism(SEDAN, -0.88, 0.88, paint, {
          finish: FINISH.LIVERY,
          style: (i) => (i === 3 || i === 5 ? { tint: glass, finish: FINISH.PLAIN } : null),
          skip: [0],
        })
        if (simple) continue
        for (const side of [-1, 1]) {
          const z = side * 0.885
          if (side > 0) f.quad([-0.8, 0.88, z], [0.5, 0.88, z], [0.3, 1.25, z], [-0.75, 1.26, z], glass)
          else f.quad([0.5, 0.88, z], [-0.8, 0.88, z], [-0.75, 1.26, z], [0.3, 1.25, z], glass)
          for (const lx of [-1.35, 1.35]) {
            if (side > 0) f.quad([lx - 0.32, 0, z + 0.01], [lx + 0.32, 0, z + 0.01], [lx + 0.32, 0.6, z + 0.01], [lx - 0.32, 0.6, z + 0.01], BLACK)
            else f.quad([lx + 0.32, 0, z - 0.01], [lx - 0.32, 0, z - 0.01], [lx - 0.32, 0.6, z - 0.01], [lx + 0.32, 0.6, z - 0.01], BLACK)
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------ tudo junto

export function addPaddock(kit, field, people, rand, { simple = false } = {}) {
  for (const t of TRUCKS) addTruck(kit, field, t, people, rand, simple)
  // A entrada de cada motorhome fica virada para a fileira de caminhões.
  const hx = HOSPITALITY[3], tx = TRUCKS[6]
  const side = Math.sign((tx.x - hx.x) * Math.sin(hx.angle) - (tx.y - hx.y) * Math.cos(hx.angle)) || 1
  for (const h of HOSPITALITY) addHospitality(kit, field, h, side, people, rand, simple)
  for (const t of TENTS) addTent(kit, field, t, people, rand, simple)
  for (const m of MASTS) addShade(kit, field, m, people, rand, simple)
  addParkedCars(kit, field, rand, simple)

  // Quem circula entre os caminhões e os motorhomes.
  const first = TRUCKS[0], last = TRUCKS[TRUCKS.length - 1]
  const dx = last.x - first.x, dy = last.y - first.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len
  // o corredor fica do lado dos motorhomes, atrás das carretas
  const nx = hx.x - tx.x, ny = hx.y - tx.y
  const nl = Math.hypot(nx, ny) || 1
  const walkers = simple ? 30 : 110
  for (let k = 0; k < walkers; k++) {
    const t = rand() * len * 1.1 - len * 0.05
    const off = 9 + rand() * 10
    const x = first.x + ux * t + (nx / nl) * off, y = first.y + uy * t + (ny / nl) * off
    const go = rand() < 0.5 ? 1 : -1
    const ids = Object.keys(TEAMS)
    people.onFoot(x, y, Math.atan2(uy * go, ux * go), {
      uniform: rand() < 0.5 ? TEAM_NUMBER[ids[Math.floor(rand() * ids.length)]] : 0,
      ...(rand() < 0.75 ? { path: 6 + rand() * 28, speed: 0.9 + rand() * 0.7 } : {}),
    })
  }
}
