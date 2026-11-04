// Arredores: prédios a partir das plantas do OpenStreetMap, mata, árvores de rua, lagos e tanques.
// Tudo fica em poucas chamadas de desenho, com as sombras cozidas uma vez só.

import { CIRCUIT, N, P } from '../circuit.js'
import { atmospheric, seeded, THREE } from './common.js'
import { FINISH, rgb } from './kit.js'

// ------------------------------------------------------------------ prédios

const TILE_COLORS = [['#c9764b', 34], ['#bd6a41', 24], ['#d4865c', 12], ['#a85c39', 12], ['#8f5a42', 6]]
const FIBER_COLORS = [['#9d9a93', 30], ['#b7b3aa', 22], ['#7b7974', 20], ['#6a6d70', 8]]
const SLAB_COLORS = [['#d8d4c9', 34], ['#c2bdb0', 30], ['#a7a397', 22], ['#e6e3da', 10]]
const LARGE_COLORS = [['#d4d6d4', 40], ['#b8bab8', 26], ['#9c9fa0', 16], ['#e6e6e2', 14], ['#7f8d9a', 4]]
const WALLS = ['#d8d0bf', '#c9c1b1', '#e2dccf', '#b5ad9e', '#d2c2a8', '#c9b49a', '#e8e1d0', '#a9b2a8']

function pick(table, r) {
  const total = table.reduce((sum, [, w]) => sum + w, 0)
  let v = r * total
  for (const [value, w] of table) {
    v -= w
    if (v <= 0) return value
  }
  return table[0][0]
}

function polygonArea(pts) {
  let a = 0
  const n = pts.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) a += pts[j * 2] * pts[i * 2 + 1] - pts[i * 2] * pts[j * 2 + 1]
  return a / 2
}

/** Encolhe o contorno pela bissetriz de cada canto. Devolve null se ele se desfizer. */
function insetRing(ring, d) {
  const n = ring.length
  const out = []
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n], c = ring[i], q = ring[(i + 1) % n]
    let ax = c[0] - p[0], ay = c[1] - p[1], bx = q[0] - c[0], by = q[1] - c[1]
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1
    ax /= la; ay /= la; bx /= lb; by /= lb
    // no sentido anti-horário, o interior fica à esquerda
    const nx = -(ay + by), ny = ax + bx
    const nl = Math.hypot(nx, ny) || 1
    const cos = Math.max(0.35, (nx / nl) * -ay + (ny / nl) * ax)
    out.push([c[0] + (nx / nl) * (d / cos), c[1] + (ny / nl) * (d / cos)])
  }
  return out
}

const ringArea = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return a / 2
}

/** Coordenadas do acabamento num plano de telhado: u ao longo do beiral, v subindo a água. */
const roofUv = (origin, ux, uy) => (p) => {
  const dx = p[0] - origin[0], dy = p[1] - origin[1]
  return [dx * ux + dy * uy, -dx * uy + dy * ux]
}

/**
 * Prédios da cidade. Casas pequenas ganham telhado de duas ou quatro águas; plantas recortadas,
 * telhado com beiral inclinado; lajes têm platibanda e, às vezes, caixa d'água.
 */
export function addBuildings(kit, geo, field, skip, { simple = false } = {}) {
  const rand = seeded(777)
  const flat = (p, y) => [p[0], y, -p[1]]

  const addWalls = (ring, ground, top, wall, seed) => {
    const n = ring.length
    let along = 0
    const height = top - ground
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      kit.quad(flat(a, ground), flat(b, ground), flat(b, top), flat(a, top), wall, FINISH.WALL,
        [[along, 0], [along + len, 0], [along + len, height], [along, height]], seed)
      along += len
    }
  }

  /** Face plana de telhado, em metros no próprio plano. */
  const roofFace = (points, heights, tint, finish, seed, axis) => {
    const uvOf = roofUv(points[0], axis[0], axis[1])
    const P3 = points.map((p, i) => flat(p, heights[i]))
    const uv = points.map(uvOf)
    for (let i = 1; i < points.length - 1; i++) kit.tri(P3[0], P3[i], P3[i + 1], tint, finish, uv[0], uv[i], uv[i + 1], seed)
  }

  const addCap = (ring, y, tint, finish, seed, axis) => {
    const contour = ring.map(([x, yy]) => new THREE.Vector2(x, yy))
    const uvOf = roofUv(ring[0], axis[0], axis[1])
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      kit.tri(flat(ring[a], y), flat(ring[b], y), flat(ring[c], y), tint, finish, uvOf(ring[a]), uvOf(ring[b]), uvOf(ring[c]), seed)
    }
  }

  const addBuilding = (pts, declared) => {
    const n = pts.length / 2
    if (n < 3) return
    const area = polygonArea(pts)
    const size = Math.abs(area)
    if (size < 9) return
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) {
      cx += pts[i * 2]
      cy += pts[i * 2 + 1]
    }
    cx /= n
    cy /= n
    if (skip(cx, cy, size)) return
    const r = rand()
    const height = declared > 0 ? declared : size > 1500 ? 9 + r * 7 : size > 400 ? 6 + r * 6 : size > 120 ? 3.6 + r * 5 : 3 + r * 3.2
    const ground = field.heightAt(cx, cy) - 1
    // Em andares inteiros: assim o telhado nunca corta uma fileira de janelas.
    const top = ground + 1 + Math.max(1, Math.round(height / 3)) * 3 - 0.1
    const seed = rand()

    // sentido anti-horário visto de cima, para as paredes olharem para fora
    const ring = []
    if (area > 0) for (let i = 0; i < n; i++) ring.push([pts[i * 2], pts[i * 2 + 1]])
    else for (let i = n - 1; i >= 0; i--) ring.push([pts[i * 2], pts[i * 2 + 1]])
    // Plantas vizinhas costumam dividir parede. Dois centímetros de diferença entre uma e outra evitam
    // o chuvisco de duas faces disputando o mesmo plano.
    const shrink = 1 - (0.012 + rand() * 0.03) / Math.max(2, Math.sqrt(size) / 2)
    for (const p of ring) {
      p[0] = cx + (p[0] - cx) * shrink
      p[1] = cy + (p[1] - cy) * shrink
    }

    const shade = 0.9 + rand() * 0.2
    const wall = rgb(WALLS[Math.floor(rand() * WALLS.length)], shade)
    addWalls(ring, ground, top, wall, seed)

    // eixo principal: o lado mais comprido
    let best = 0, ax = 1, ay = 0
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n]
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      if (len > best) {
        best = len
        ax = dx / (len || 1)
        ay = dy / (len || 1)
      }
    }

    const kind = rand()
    const tone = 0.84 + rand() * 0.3
    if (size > 900) {
      const big = rand() < 0.55
      addCap(ring, top, rgb(pick(LARGE_COLORS, rand()), tone), big ? FINISH.METAL : FINISH.SLAB, seed, [ax, ay])
      return
    }

    const isTile = kind < 0.6
    const isFiber = kind >= 0.6 && kind < 0.82
    const tint = rgb(pick(isTile ? TILE_COLORS : isFiber ? FIBER_COLORS : SLAB_COLORS, rand()), tone)
    const finish = isTile ? FINISH.TILE : isFiber ? FINISH.METAL : FINISH.SLAB

    // Casa retangular: duas ou quatro águas, com a cumeeira no lado comprido.
    if (n === 4 && size < 450 && finish !== FINISH.SLAB) {
      const lenA = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1])
      const lenB = Math.hypot(ring[2][0] - ring[1][0], ring[2][1] - ring[1][1])
      const start = lenA >= lenB ? 0 : 1
      const p0 = ring[start], p1 = ring[(start + 1) % 4], p2 = ring[(start + 2) % 4], p3 = ring[(start + 3) % 4]
      const short = Math.min(lenA, lenB)
      const long = Math.max(lenA, lenB)
      const ex = (p1[0] - p0[0]) / (long || 1), ey = (p1[1] - p0[1]) / (long || 1)
      const ridge = top + Math.min(2.6, short * 0.22)
      const hip = rand() < 0.42 && long > short * 1.15 ? short * 0.5 : 0
      const m0 = [(p3[0] + p0[0]) / 2 + ex * hip, (p3[1] + p0[1]) / 2 + ey * hip]
      const m1 = [(p1[0] + p2[0]) / 2 - ex * hip, (p1[1] + p2[1]) / 2 - ey * hip]
      roofFace([p0, p1, m1, m0], [top, top, ridge, ridge], tint, finish, seed, [ex, ey])
      roofFace([p2, p3, m0, m1], [top, top, ridge, ridge], tint, finish, seed, [-ex, -ey])
      if (hip > 0) {
        roofFace([p1, p2, m1], [top, top, ridge], tint, finish, seed, [-ey, ex])
        roofFace([p3, p0, m0], [top, top, ridge], tint, finish, seed, [ey, -ex])
      } else {
        // oitão: a parede sobe até a cumeeira
        kit.tri(flat(p1, top), flat(p2, top), flat(m1, ridge), wall)
        kit.tri(flat(p3, top), flat(p0, top), flat(m0, ridge), wall)
      }
      return
    }

    // Planta recortada com telhado: água em volta de tudo, topo plano por cima.
    if (!simple && finish !== FINISH.SLAB && n <= 14 && size > 40) {
      const d = Math.min(2.2, Math.sqrt(size) * 0.17)
      const inner = insetRing(ring, d)
      if (ringArea(inner) > size * 0.25) {
        const rise = d * 0.42
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n
          const ex = ring[j][0] - ring[i][0], ey = ring[j][1] - ring[i][1]
          const len = Math.hypot(ex, ey) || 1
          roofFace([ring[i], ring[j], inner[j], inner[i]], [top, top, top + rise, top + rise], tint, finish, seed, [ex / len, ey / len])
        }
        addCap(inner, top + rise, tint, finish, seed, [ax, ay])
        return
      }
    }

    // Laje com platibanda.
    addCap(ring, top, tint, finish, seed, [ax, ay])
    if (!simple && size > 45 && n <= 16) {
      const inner = insetRing(ring, 0.28)
      const edge = rgb('#b9b4a8', tone)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        kit.quad(flat(ring[i], top + 0.55), flat(ring[j], top + 0.55), flat(inner[j], top + 0.55), flat(inner[i], top + 0.55), edge)
        kit.quad(flat(inner[j], top), flat(inner[i], top), flat(inner[i], top + 0.55), flat(inner[j], top + 0.55), edge)
        kit.quad(flat(ring[i], top), flat(ring[j], top), flat(ring[j], top + 0.55), flat(ring[i], top + 0.55), wall)
      }
    }
    // caixa d'água
    if (!simple && size > 60 && rand() < 0.45) {
      const blue = rand() < 0.7
      kit.lathe(cx, top, -cy, [[0.95, 0], [1.05, 1.1], [0.72, 1.45], [0, 1.5]], 7, rgb(blue ? '#3f70a6' : '#9a9d9e'), FINISH.PLAIN, seed)
    }
  }

  for (const { prop, pts } of geo.layers.buildings) addBuilding(pts, prop)
}

// ------------------------------------------------------------------ árvores

export function pointInPolygon(pts, x, y) {
  let c = false
  const n = pts.length / 2
  for (let a = 0, b = n - 1; a < n; b = a++) {
    const ya = pts[a * 2 + 1], yb = pts[b * 2 + 1]
    if (ya > y !== yb > y && x < ((pts[b * 2] - pts[a * 2]) * (y - ya)) / (yb - ya) + pts[a * 2]) c = !c
  }
  return c
}

function bbox(pts) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i])
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1])
  }
  return { minX, maxX, minY, maxY }
}

/** Copa de longe: até quatro lobos, poucos triângulos. O contorno ainda fica irregular. */
function farCrown(count) {
  const LOBES = [[0, 0.08, 0, 1], [0.52, -0.12, 0.28, 0.68], [-0.42, -0.08, -0.4, 0.74], [-0.24, 0.18, 0.5, 0.52]]
  return mergeLobes(LOBES.slice(0, count), 0, null)
}

/**
 * Copa de perto: muitos tufos sobre uma forma maior. As normais misturam o tufo e a copa inteira,
 * então a luz desenha o volume da árvore e, por cima, o relevo de cada tufo.
 */
function nearCrown() {
  const lobes = [[0, 0.05, 0, 0.74]]
  const rand = seeded(31337)
  const COUNT = 13
  for (let i = 0; i < COUNT; i++) {
    const t = (i + 0.5) / COUNT
    const y = 0.82 - 1.25 * t
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = i * 2.39996
    const size = 0.3 + rand() * 0.24
    const reach = 0.72 + rand() * 0.16
    lobes.push([Math.cos(a) * r * reach, y * reach * 0.82, Math.sin(a) * r * reach, size])
  }
  return mergeLobes(lobes, 1, rand)
}

function mergeLobes(lobes, detail, rand) {
  const ico = new THREE.IcosahedronGeometry(1, detail)
  const base = ico.getAttribute('position')
  const count = base.count * lobes.length
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const depth = new Float32Array(count)
  lobes.forEach(([ox, oy, oz, r], l) => {
    const wobble = rand ? 0.8 + rand() * 0.4 : 1
    for (let i = 0; i < base.count; i++) {
      const x = base.getX(i), y = base.getY(i), z = base.getZ(i)
      const k = l * base.count + i
      const bump = rand ? 1 + 0.16 * Math.sin(x * 5.1 * wobble + l) * Math.sin(y * 4.3 + l * 2.1) * Math.sin(z * 4.7 * wobble) : 1
      const px = ox + x * r * bump, py = oy + (y < 0 ? y * 0.62 : y) * r * bump, pz = oz + z * r * bump
      positions[k * 3] = px
      positions[k * 3 + 1] = py
      positions[k * 3 + 2] = pz
      // normal entre a do tufo e a da copa
      const len = Math.hypot(px, py, pz) || 1
      const mix = rand ? 0.5 : 0
      const nx = x * (1 - mix) + (px / len) * mix, ny = y * (1 - mix) + (py / len) * mix, nz = z * (1 - mix) + (pz / len) * mix
      const nl = Math.hypot(nx, ny, nz) || 1
      normals[k * 3] = nx / nl
      normals[k * 3 + 1] = ny / nl
      normals[k * 3 + 2] = nz / nl
      // perto do miolo fica o vão entre os tufos, onde quase não entra luz
      depth[k] = Math.min(1, Math.max(0, (len - 0.42) / 0.62))
    }
  })
  const crown = new THREE.BufferGeometry()
  crown.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  crown.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  crown.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
  return crown
}

export function buildTrees(geo, field, leafTexture, extraBlocks = [], { simple = false } = {}) {
  const rand = seeded(1234)
  const area = CIRCUIT.area
  const list = [] // x, y, raio, altura, tom

  // grade de bloqueio: árvore não nasce em prédio, pista ou água
  const CELL = 6
  const gw = Math.ceil((area[2] - area[0]) / CELL), gh = Math.ceil((area[3] - area[1]) / CELL)
  const blocked = new Uint8Array(gw * gh)
  const block = (x, y, radius) => {
    const r = Math.ceil(radius / CELL)
    const ci = Math.floor((x - area[0]) / CELL), cj = Math.floor((y - area[1]) / CELL)
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i >= 0 && j >= 0 && i < gw && j < gh) blocked[j * gw + i] = 1
      }
    }
  }
  for (let i = 0; i < N; i += 2) block(P[i].x, P[i].y, Math.max(P[i].left, P[i].right) + 8)
  for (const [x, y, radius] of extraBlocks) block(x, y, radius)
  for (const { pts } of geo.layers.buildings) {
    const n = pts.length / 2
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) {
      cx += pts[i * 2]
      cy += pts[i * 2 + 1]
    }
    const b = bbox(pts)
    block(cx / n, cy / n, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.45)
    // planta em L ou comprida escapa do círculo: confere célula por célula, com folga de meia célula
    for (let y = b.minY - CELL / 2; y <= b.maxY + CELL / 2; y += CELL / 2) {
      for (let x = b.minX - CELL / 2; x <= b.maxX + CELL / 2; x += CELL / 2) {
        if (pointInPolygon(pts, x, y)) block(x, y, CELL / 2)
      }
    }
  }
  for (const { prop: width, pts } of geo.layers.roads) {
    for (let i = 0; i < pts.length - 2; i += 2) {
      const steps = Math.ceil(Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]) / CELL)
      for (let k = 0; k <= steps; k++) block(pts[i] + ((pts[i + 2] - pts[i]) * k) / steps, pts[i + 1] + ((pts[i + 3] - pts[i + 1]) * k) / steps, width / 2)
    }
  }
  const isBlocked = (x, y) => {
    const i = Math.floor((x - area[0]) / CELL), j = Math.floor((y - area[1]) / CELL)
    return i < 0 || j < 0 || i >= gw || j >= gh || blocked[j * gw + i] === 1
  }

  // mata: copas densas, de tamanhos variados, com claros ocasionais
  for (const { pts } of geo.layers.forest) {
    const b = bbox(pts)
    const spacing = 4.4
    for (let y = b.minY; y < b.maxY; y += spacing) {
      for (let x = b.minX; x < b.maxX; x += spacing) {
        const px = x + (rand() - 0.5) * spacing * 1.2, py = y + (rand() - 0.5) * spacing * 1.2
        if (!pointInPolygon(pts, px, py) || isBlocked(px, py)) continue
        const big = rand()
        list.push([px, py, 2.6 + big * big * 3.8, 8 + rand() * 11, rand()])
      }
    }
  }
  // fileiras de árvores
  for (const { pts } of geo.layers.treerows) {
    for (let i = 0; i < pts.length - 2; i += 2) {
      const len = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1])
      for (let d = 0; d < len; d += 7 + rand() * 5) {
        const t = d / len
        const x = pts[i] + (pts[i + 2] - pts[i]) * t, y = pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t
        if (!isBlocked(x, y)) list.push([x, y, 3 + rand() * 3, 7 + rand() * 6, rand()])
      }
    }
  }
  // árvores de rua e de quintal, onde há espaço livre
  const roads = geo.layers.roads
  for (let n = 0; n < 16000; n++) {
    const road = roads[Math.floor(rand() * roads.length)]
    const i = Math.floor((rand() * (road.pts.length - 2)) / 2) * 2
    const t = rand()
    const side = rand() < 0.5 ? 1 : -1
    const dx = road.pts[i + 2] - road.pts[i], dy = road.pts[i + 3] - road.pts[i + 1]
    const len = Math.hypot(dx, dy) || 1
    const off = road.prop / 2 + 2 + rand() * 12
    const x = road.pts[i] + dx * t - (dy / len) * off * side
    const y = road.pts[i + 1] + dy * t + (dx / len) * off * side
    if (isBlocked(x, y)) continue
    list.push([x, y, 2.2 + rand() * rand() * 5, 4 + rand() * 7, rand()])
    block(x, y, 3)
  }
  // espalhadas pelos gramados do autódromo: poucas, para não esconder o terreno
  const b = CIRCUIT.bounds
  const inside = (x, y) => x > b[0] - 60 && x < b[2] + 200 && y > b[1] - 60 && y < b[3] + 60
  for (let n = 0; n < 460; n++) {
    const s = rand() * CIRCUIT.length
    const i = Math.floor(s / (CIRCUIT.length / N)) % N
    const off = (rand() < 0.5 ? 1 : -1) * (32 + rand() * 90)
    const x = P[i].x - P[i].ty * off, y = P[i].y + P[i].tx * off
    if (!inside(x, y) || isBlocked(x, y) || rand() > 0.45) continue
    list.push([x, y, 2.5 + rand() * 3.5, 5 + rand() * 6, rand()])
  }

  const material = atmospheric(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    key: 'trees',
    uniforms: { uLeaves: { value: leafTexture } },
    vertexHead: 'attribute float aDepth; varying float vTopness; varying float vDepth;',
    vertexBody: 'vTopness = normal.y; vDepth = aDepth;',
    fragmentHead: 'varying float vTopness; varying float vDepth; uniform sampler2D uLeaves;',
    fragment: [
      ['#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec2 leafUv = (vWPos.xz + vWPos.y * vec2(0.37, -0.29));
        vec4 foliage = texture2D(uLeaves, leafUv / 7.0);
        vec4 clumps = texture2D(uLeaves, leafUv / 31.0 + 0.37);
        {
          // folhagem: clara no topo, escura por baixo e nos vãos entre os tufos
          float top = smoothstep(-0.55, 0.85, vTopness);
          float gaps = smoothstep(0.1, 0.62, foliage.b);
          float masses = smoothstep(0.12, 0.72, clumps.b);
          diffuseColor.rgb *= mix(0.58, 1.1, top) * mix(0.42, 1.26, gaps) * mix(0.62, 1.2, masses);
          diffuseColor.rgb *= mix(0.42, 1.08, vDepth);
          // ponta de ramo pegando sol, um pouco mais amarelada
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.32, 1.22, 0.72), smoothstep(0.6, 0.95, foliage.b) * top * 0.5);
        }
      `],
      ['#include <normal_fragment_maps>', /* glsl */ `
        {
          // cada tufo de folhas pega a luz em uma direção diferente
          vec2 nn = (foliage.rg * 2.0 - 1.0) * 0.95 + (clumps.rg * 2.0 - 1.0) * 0.8;
          vec3 tx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
          vec3 tz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          normal = normalize(normal + tx * nn.x + tz * nn.y);
        }
      `],
    ],
  })

  const farGeometry = farCrown(simple ? 2 : 4)
  const nearGeometry = nearCrown()
  const matrices = new Float32Array(list.length * 16)
  const colors = new Float32Array(list.length * 3)
  const matrix = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const color = new THREE.Color()
  const axis = new THREE.Vector3(0, 1, 0)
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()
  list.forEach(([x, y, radius, height, tone], i) => {
    const ground = field.heightAt(x, y)
    q.setFromAxisAngle(axis, tone * 6.28)
    // a copa fica no alto: o tronco não aparece visto de cima
    const sy = Math.max(radius * 0.72, height * 0.32)
    position.set(x, ground + height - sy * 0.55, -y)
    scale.set(radius, sy, radius)
    matrix.compose(position, q, scale)
    matrix.toArray(matrices, i * 16)
    // verdes da mata atlântica: do quase preto ao oliva, com poucas copas claras
    const pale = tone > 0.86 ? (tone - 0.86) * 3 : 0
    const lime = tone < 0.07 ? (0.07 - tone) * 5 : 0
    color.setRGB(0.042 + tone * 0.05 + pale * 0.07 + lime * 0.12, 0.085 + tone * 0.085 + pale * 0.06 + lime * 0.16, 0.028 + tone * 0.022)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  })

  const instanced = (geometry, indices) => {
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length)
    const mat = new Float32Array(indices.length * 16)
    const col = new Float32Array(indices.length * 3)
    indices.forEach((src, i) => {
      mat.set(matrices.subarray(src * 16, src * 16 + 16), i * 16)
      col.set(colors.subarray(src * 3, src * 3 + 3), i * 3)
    })
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(mat, 16)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3)
    mesh.receiveShadow = true
    return mesh
  }

  // Vista geral: tudo numa chamada só. De perto, grupos de 150 m, que a câmera descarta sozinha, e
  // a versão detalhada só nos que estão perto do centro da tela.
  const everyone = instanced(farGeometry, list.map((_, i) => i))
  everyone.frustumCulled = false
  everyone.castShadow = true
  const group = new THREE.Group()
  group.add(everyone)

  const CHUNK = 150
  const chunks = new Map()
  list.forEach(([x, y], i) => {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`
    if (!chunks.has(key)) chunks.set(key, [])
    chunks.get(key).push(i)
  })
  const cells = [...chunks.values()].map((indices) => {
    const near = instanced(nearGeometry, indices)
    const far = instanced(farGeometry, indices)
    near.computeBoundingSphere()
    far.computeBoundingSphere()
    near.visible = far.visible = false
    group.add(near, far)
    return { near, far, center: near.boundingSphere.center.clone() }
  })

  let close = false
  return {
    group,
    count: list.length,
    /** `target` é o ponto do chão no centro da tela; a sombra já está cozida. */
    update(isClose, target, nearRadius) {
      if (isClose !== close) {
        close = isClose
        everyone.visible = !close
        if (!close) for (const cell of cells) cell.near.visible = cell.far.visible = false
      }
      if (!close) return
      const r2 = nearRadius * nearRadius
      for (const cell of cells) {
        const dx = cell.center.x - target.x, dz = cell.center.z - target.z
        const isNear = dx * dx + dz * dz < r2
        cell.near.visible = isNear
        cell.far.visible = !isNear
      }
    },
  }
}

// ------------------------------------------------------------------ lagos e tanques

export function buildWater(field, envMap, normalTex) {
  const group = new THREE.Group()
  const material = atmospheric(
    new THREE.MeshStandardMaterial({ color: '#203a22', roughness: 0.14, metalness: 0, envMap, envMapIntensity: 1.25 }),
    {
      key: 'water',
      uniforms: { uWaveN: { value: normalTex } },
      fragmentHead: 'uniform sampler2D uWaveN; uniform float uTime;',
      fragment: [
        ['#include <color_fragment>', /* glsl */ `
          #include <color_fragment>
          {
            // algas e reflexo das margens: o lago de verdade é verde-escuro e manchado
            vec2 a = texture2D(uWaveN, vWPos.xz / 310.0).xy;
            diffuseColor.rgb *= 0.72 + 0.7 * smoothstep(0.42, 0.6, a.x);
          }
        `],
        ['#include <normal_fragment_maps>', /* glsl */ `
          {
            vec2 a = texture2D(uWaveN, vWPos.xz / 23.0 + vec2(uTime * 0.006, uTime * 0.004)).xy * 2.0 - 1.0;
            vec2 b = texture2D(uWaveN, vWPos.xz / 9.0 - vec2(uTime * 0.011, -uTime * 0.007)).xy * 2.0 - 1.0;
            vec2 nn = (a + b) * 0.1;
            vec3 tx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
            vec3 tz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
            normal = normalize(normal + tx * nn.x + tz * nn.y);
          }
        `],
      ],
    },
  )
  for (const { pts, level } of field.lakes) {
    const shape = new THREE.Shape()
    shape.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) shape.lineTo(pts[i], pts[i + 1])
    const geometry = new THREE.ShapeGeometry(shape)
    // ShapeGeometry nasce no plano XY: deita para XZ com z = -y
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, level, 0)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    group.add(mesh)
  }
  return group
}

/** Reservatórios: os de cúpula azul e os abertos, como na vista aérea. */
export function addTanks(kit, geo, field) {
  for (const { prop, pts } of geo.layers.tanks) {
    const b = bbox(pts)
    const r = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2
    if (r < 4) continue
    const height = prop || Math.min(14, r * 0.5)
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
    const ground = field.heightAt(cx, cy) - 0.5
    const open = cy > 470 // os dois mais ao norte não têm cúpula
    if (open) {
      const wall = rgb('#8d8b83')
      kit.lathe(cx, ground, -cy, [[r, 0], [r, height * 0.6], [r - 0.5, height * 0.6]], 40, wall)
      kit.lathe(cx, ground + height * 0.45, -cy, [[r - 0.5, 0], [0, 0.01]], 40, rgb('#3c4436'))
      continue
    }
    const paint = rgb('#35639a')
    const dome = []
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * (Math.PI / 2)
      dome.push([Math.cos(a) * r, height + Math.sin(a) * r * 0.2])
    }
    kit.lathe(cx, ground, -cy, [[r + 0.6, 0], [r + 0.6, 0.8], [r, 0.8], [r, height], ...dome.slice(1)], 40, paint, FINISH.PLAIN)
  }
}
