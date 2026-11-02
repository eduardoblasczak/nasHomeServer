// Arredores: prédios a partir das plantas do OpenStreetMap, mata, árvores de rua e lagos.
// Tudo fica junto em poucas chamadas de desenho, com as sombras cozidas uma vez só.

import { CIRCUIT, N, P } from '../circuit.js'
import { atmospheric, seeded, THREE } from './common.js'

// ------------------------------------------------------------------ prédios

const ROOF_SMALL = [
  ['#c9764b', 30], ['#c06a42', 20], ['#d4865c', 10], ['#9d9a93', 14], ['#b7b3aa', 9], ['#7b7974', 8], ['#d8d4c9', 7], ['#6a5a50', 2],
]
const ROOF_LARGE = [['#d4d6d4', 40], ['#b8bab8', 26], ['#9c9fa0', 16], ['#e6e6e2', 14], ['#7f8d9a', 4]]
const WALLS = ['#d8d0bf', '#c9c1b1', '#e2dccf', '#b5ad9e', '#d2c2a8']

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

export function buildBuildings(geo, field) {
  const rand = seeded(777)
  const positions = []
  const normals = []
  const colors = []
  const tmp = new THREE.Color()

  const pushTri = (a, b, c, color) => {
    // normal plana
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2])
      normals.push(nx, ny, nz)
      colors.push(color.r, color.g, color.b)
    }
  }

  const addBuilding = (pts, declared, large) => {
    const n = pts.length / 2
    if (n < 3) return
    const area = polygonArea(pts)
    const size = Math.abs(area)
    if (size < 9) return
    const r = rand()
    const height = declared > 0 ? declared : size > 1500 ? 9 + r * 7 : size > 400 ? 6 + r * 6 : size > 120 ? 3.6 + r * 5 : 3 + r * 3.2
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) {
      cx += pts[i * 2]
      cy += pts[i * 2 + 1]
    }
    cx /= n
    cy /= n
    const ground = field.heightAt(cx, cy) - 1
    const top = ground + 1 + height

    // sentido anti-horário visto de cima, para as paredes olharem para fora
    const ring = []
    if (area > 0) for (let i = 0; i < n; i++) ring.push([pts[i * 2], pts[i * 2 + 1]])
    else for (let i = n - 1; i >= 0; i--) ring.push([pts[i * 2], pts[i * 2 + 1]])

    const wall = tmp.clone().set(WALLS[Math.floor(rand() * WALLS.length)])
    const shade = 0.9 + rand() * 0.2
    wall.multiplyScalar(shade)
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n]
      const A = [a[0], ground, -a[1]], B = [b[0], ground, -b[1]], C = [b[0], top, -b[1]], D = [a[0], top, -a[1]]
      pushTri(A, B, C, wall)
      pushTri(A, C, D, wall)
    }

    const roof = tmp.clone().set(large || size > 900 ? pick(ROOF_LARGE, rand()) : pick(ROOF_SMALL, rand()))
    roof.multiplyScalar(0.84 + rand() * 0.3)

    // Casa retangular pequena: telhado de duas águas, com a cumeeira no lado comprido.
    if (n === 4 && size < 450 && !large) {
      const lenA = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1])
      const lenB = Math.hypot(ring[2][0] - ring[1][0], ring[2][1] - ring[1][1])
      const start = lenA >= lenB ? 0 : 1
      const p0 = ring[start], p1 = ring[(start + 1) % 4], p2 = ring[(start + 2) % 4], p3 = ring[(start + 3) % 4]
      const m0 = [(p3[0] + p0[0]) / 2, (p3[1] + p0[1]) / 2]
      const m1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
      const ridge = top + Math.min(2.4, Math.min(lenA, lenB) * 0.2)
      const T = (p, y) => [p[0], y, -p[1]]
      pushTri(T(p0, top), T(p1, top), T(m1, ridge), roof)
      pushTri(T(p0, top), T(m1, ridge), T(m0, ridge), roof)
      pushTri(T(p2, top), T(p3, top), T(m0, ridge), roof)
      pushTri(T(p2, top), T(m0, ridge), T(m1, ridge), roof)
      pushTri(T(p1, top), T(p2, top), T(m1, ridge), wall)
      pushTri(T(p3, top), T(p0, top), T(m0, ridge), wall)
      return
    }

    const contour = ring.map(([x, y]) => new THREE.Vector2(x, y))
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      pushTri([ring[a][0], top, -ring[a][1]], [ring[b][0], top, -ring[b][1]], [ring[c][0], top, -ring[c][1]], roof)
    }
  }

  for (const { prop, pts } of geo.layers.buildings) addBuilding(pts, prop, false)
  for (const { prop, pts } of geo.layers.stands) addBuilding(pts, prop || 14, true)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mesh = new THREE.Mesh(geometry, atmospheric(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), { key: 'buildings' }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

// ------------------------------------------------------------------ árvores

function pointInPolygon(pts, x, y) {
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

export function buildTrees(geo, field, leafTexture) {
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
  for (const { pts } of geo.layers.buildings) {
    const n = pts.length / 2
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) {
      cx += pts[i * 2]
      cy += pts[i * 2 + 1]
    }
    const b = bbox(pts)
    block(cx / n, cy / n, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.45)
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

  // Copa: lobos sobrepostos, com normais a partir do centro de cada um. O contorno fica irregular,
  // como o de uma árvore de verdade, e a luz ainda desenha volume. Duas versões: de longe,
  // poucos triângulos; de perto, a copa arredondada.
  const LOBES = [[0, 0.08, 0, 1], [0.52, -0.12, 0.28, 0.68], [-0.42, -0.08, -0.4, 0.74], [-0.24, 0.18, 0.5, 0.52]]
  const makeCrown = (detail) => {
    const lobe = new THREE.IcosahedronGeometry(1, detail)
    const lobePos = lobe.getAttribute('position')
    const crownPos = new Float32Array(lobePos.count * LOBES.length * 3)
    const crownNor = new Float32Array(lobePos.count * LOBES.length * 3)
    LOBES.forEach(([ox, oy, oz, r], l) => {
      for (let i = 0; i < lobePos.count; i++) {
        const x = lobePos.getX(i), y = lobePos.getY(i), z = lobePos.getZ(i)
        const k = (l * lobePos.count + i) * 3
        crownPos[k] = ox + x * r
        crownPos[k + 1] = oy + (y < 0 ? y * 0.55 : y) * r
        crownPos[k + 2] = oz + z * r
        crownNor[k] = x
        crownNor[k + 1] = y
        crownNor[k + 2] = z
      }
    })
    const crown = new THREE.BufferGeometry()
    crown.setAttribute('position', new THREE.BufferAttribute(crownPos, 3))
    crown.setAttribute('normal', new THREE.BufferAttribute(crownNor, 3))
    return crown
  }

  const material = atmospheric(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    key: 'trees',
    uniforms: { uLeaves: { value: leafTexture } },
    vertexHead: 'varying float vTopness;',
    vertexBody: 'vTopness = normal.y;',
    fragmentHead: 'varying float vTopness; uniform sampler2D uLeaves;',
    fragment: [
      ['#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec4 foliage = texture2D(uLeaves, (vWPos.xz + vWPos.y * vec2(0.37, -0.29)) / 7.0);
        {
          // folhagem: mais clara no topo, escura por baixo, com vãos escuros entre os galhos
          float top = smoothstep(-0.55, 0.85, vTopness);
          float gaps = smoothstep(0.1, 0.62, foliage.b);
          diffuseColor.rgb *= mix(0.6, 1.1, top) * mix(0.34, 1.32, gaps);
        }
      `],
      ['#include <normal_fragment_maps>', /* glsl */ `
        {
          // cada tufo de folhas pega a luz em uma direção diferente
          vec2 nn = (foliage.rg * 2.0 - 1.0) * 1.15;
          vec3 tx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
          vec3 tz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          normal = normalize(normal + tx * nn.x + tz * nn.y);
        }
      `],
    ],
  })

  const near = new THREE.InstancedMesh(makeCrown(1), material, list.length)
  const far = new THREE.InstancedMesh(makeCrown(0), material, list.length)
  const matrix = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const color = new THREE.Color()
  const axis = new THREE.Vector3(0, 1, 0)
  list.forEach(([x, y, radius, height, tone], i) => {
    const ground = field.heightAt(x, y)
    q.setFromAxisAngle(axis, tone * 6.28)
    // a copa fica no alto: o tronco não aparece visto de cima
    const sy = Math.max(radius * 0.72, height * 0.32)
    matrix.compose(new THREE.Vector3(x, ground + height - sy * 0.55, -y), q, new THREE.Vector3(radius, sy, radius))
    near.setMatrixAt(i, matrix)
    far.setMatrixAt(i, matrix)
    // verdes da mata atlântica: do quase preto ao oliva, com poucas copas claras
    const pale = tone > 0.86 ? (tone - 0.86) * 3 : 0
    color.setRGB(0.042 + tone * 0.05 + pale * 0.07, 0.085 + tone * 0.085 + pale * 0.06, 0.028 + tone * 0.022)
    near.setColorAt(i, color)
    far.setColorAt(i, color)
  })
  const group = new THREE.Group()
  for (const mesh of [near, far]) {
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    group.add(mesh)
  }
  // A sombra sai sempre da versão leve: de cima, o contorno é o mesmo.
  far.castShadow = true
  near.visible = false
  return {
    group,
    count: list.length,
    /** Troca a versão conforme a distância da câmera; a sombra já está cozida. */
    setDetail(close) {
      near.visible = close
      far.visible = !close
    },
  }
}

// ------------------------------------------------------------------ lagos e tanques

export function buildWater(field, envMap, normalTex) {
  const group = new THREE.Group()
  const material = atmospheric(
    new THREE.MeshStandardMaterial({ color: '#27401f', roughness: 0.16, metalness: 0, envMap, envMapIntensity: 0.9 }),
    {
      key: 'water',
      uniforms: { uWaveN: { value: normalTex } },
      fragmentHead: 'uniform sampler2D uWaveN; uniform float uTime;',
      fragment: [
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

export function buildTanks(geo, field) {
  const group = new THREE.Group()
  const material = atmospheric(new THREE.MeshStandardMaterial({ color: '#35639a', roughness: 0.62, metalness: 0.05 }), { key: 'tanks' })
  for (const { prop, pts } of geo.layers.tanks) {
    const b = bbox(pts)
    const r = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2
    if (r < 4) continue
    const height = prop || Math.min(14, r * 0.5)
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
    const body = new THREE.CylinderGeometry(r, r, height, 40, 1)
    const dome = new THREE.SphereGeometry(r, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    dome.scale(1, 0.18, 1)
    dome.translate(0, height / 2, 0)
    const mesh = new THREE.Group()
    const walls = new THREE.Mesh(body, material)
    const top = new THREE.Mesh(dome, material)
    for (const part of [walls, top]) {
      part.castShadow = true
      part.receiveShadow = true
    }
    mesh.add(walls, top)
    mesh.position.set(cx, field.heightAt(cx, cy) + height / 2, -cy)
    group.add(mesh)
  }
  return group
}
