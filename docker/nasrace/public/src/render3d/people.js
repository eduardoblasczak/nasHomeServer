// Gente: o público sentado nas arquibancadas e quem anda pelo paddock, boxes e passeios. São malhas de
// verdade, em dois níveis de detalhe, e só existem de perto: de longe, o pontilhado do acabamento SEATS
// (kit.js) faz o papel do público, e as pessoas no chão teriam menos de um pixel.

import { CIRCUIT, N, P } from '../circuit.js'
import { TEAMS } from '../race.js'
import { HOSPITALITY, TENTS, TRUCKS } from '../venue.js'
import { MeshParts } from './carmodel.js'
import { atmospheric, seeded, shared, THREE } from './common.js'
import { pointInPolygon } from './scenery.js'

// Partes do corpo, em `aPaint.x`. `aPaint.y` é o lado (-1 ou 1), `aPaint.z` é a altura de 0 a 1.
const TORSO = 0, SKIN = 1, LEGS = 2, SLEEVE = 3, HAIR = 4, SHOE = 5
const paint = (part, side = 0) => (p) => [part, side, Math.min(1, p[1] / 1.75), 0]
const headPaint = (p) => [p[1] > 1.668 || (p[0] < -0.05 && p[1] > 1.59) ? HAIR : SKIN, 0, Math.min(1, p[1] / 1.75), 0]
const armPaint = (side) => (p) => [p[1] > 1.2 ? SLEEVE : SKIN, side, Math.min(1, p[1] / 1.75), 0]

/** Anel elíptico na horizontal, em volta de (cx, y, cz). */
const ring = (cx, y, cz, rx, rz, sides) => {
  const out = []
  for (let k = 0; k < sides; k++) {
    const t = (k / sides) * Math.PI * 2
    out.push([cx + Math.cos(t) * rx, y, cz + Math.sin(t) * rz])
  }
  return out
}

/** Cabeça: elipsoide, um pouco à frente do pescoço. */
function addHead(parts, cx, cy, sides, stacks) {
  const rings = []
  for (let i = 1; i < stacks; i++) {
    const a = (i / stacks) * Math.PI
    const r = Math.sin(a)
    rings.push(ring(cx, cy - Math.cos(a) * 0.118, 0, r * 0.098, r * 0.086, sides))
  }
  parts.loft(rings, headPaint)
}

function addTorso(parts, levels, sides) {
  parts.loft(levels.map(([x, y, rx, rz]) => ring(x, y, 0, rx, rz, sides)), paint(TORSO))
}

/** Em pé, de frente para +x, com a origem no chão entre os pés. */
function standingNear() {
  const parts = new MeshParts()
  for (const side of [-1, 1]) {
    const z = side * 0.095
    parts.tube([[0, 0.93, z], [0.015, 0.5, z * 1.05], [-0.005, 0.1, z * 1.08]], 0.066, paint(LEGS, side), 5)
    parts.tube([[-0.04, 0.05, z * 1.08], [0.15, 0.04, z * 1.1]], 0.045, paint(SHOE, side), 4)
    parts.tube([[0, 1.44, side * 0.215], [0.015, 1.17, side * 0.245], [0.07, 0.93, side * 0.235]], 0.04, armPaint(side), 4)
  }
  addTorso(parts, [[0, 0.88, 0.115, 0.17], [0, 1.08, 0.1, 0.155], [0.005, 1.32, 0.118, 0.2], [0, 1.47, 0.08, 0.19], [0, 1.52, 0.045, 0.06]], 6)
  addHead(parts, 0.012, 1.64, 8, 6)
  return parts.geometry()
}

function standingFar() {
  const parts = new MeshParts()
  parts.loft([ring(0, 0.03, 0, 0.1, 0.15, 4), ring(0, 0.9, 0, 0.1, 0.17, 4)], paint(LEGS))
  parts.loft([ring(0, 0.9, 0, 0.11, 0.17, 4), ring(0, 1.42, 0, 0.11, 0.22, 4), ring(0, 1.52, 0, 0.05, 0.08, 4)], paint(TORSO))
  parts.loft([ring(0.01, 1.53, 0, 0.07, 0.065, 4), ring(0.01, 1.64, 0, 0.1, 0.09, 4), ring(0.01, 1.75, 0, 0.05, 0.05, 4)], (p) => [p[1] > 1.68 ? HAIR : SKIN, 0, Math.min(1, p[1] / 1.75), 0])
  return parts.geometry()
}

/** Sentado, de frente para +x, com a origem no degrau onde os pés se apoiam. */
function seatedNear() {
  const parts = new MeshParts()
  for (const side of [-1, 1]) {
    const z = side * 0.1
    parts.tube([[-0.14, 0.47, z], [0.27, 0.47, z * 1.05], [0.3, 0.08, z * 1.05]], 0.066, paint(LEGS, side), 4)
    parts.tube([[0.26, 0.05, z * 1.05], [0.42, 0.04, z * 1.08]], 0.045, paint(SHOE, side), 4)
    parts.tube([[-0.13, 1.0, side * 0.21], [-0.06, 0.74, side * 0.24], [0.17, 0.6, side * 0.17]], 0.04, armPaint(side), 4)
  }
  addTorso(parts, [[-0.16, 0.44, 0.12, 0.17], [-0.16, 0.66, 0.105, 0.155], [-0.14, 0.9, 0.118, 0.2], [-0.13, 1.03, 0.08, 0.19], [-0.12, 1.08, 0.045, 0.06]], 6)
  // a cabeça do tronco sentado fica 0,44 m abaixo da de quem está em pé
  const rings = []
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI
    const r = Math.sin(a)
    rings.push(ring(-0.1, 1.2 - Math.cos(a) * 0.118, 0, r * 0.098, r * 0.086, 8))
  }
  parts.loft(rings, (p) => [p[1] > 1.228 || (p[0] < -0.15 && p[1] > 1.15) ? HAIR : SKIN, 0, Math.min(1, p[1] / 1.75), 0])
  return parts.geometry()
}

function seatedFar() {
  const parts = new MeshParts()
  parts.loft([ring(0.08, 0.1, 0, 0.26, 0.17, 4), ring(0.08, 0.5, 0, 0.26, 0.17, 4)], paint(LEGS))
  parts.loft([ring(-0.15, 0.48, 0, 0.12, 0.18, 4), ring(-0.14, 0.98, 0, 0.12, 0.22, 4), ring(-0.12, 1.08, 0, 0.05, 0.08, 4)], paint(TORSO))
  parts.loft([ring(-0.1, 1.09, 0, 0.07, 0.065, 4), ring(-0.1, 1.2, 0, 0.1, 0.09, 4), ring(-0.1, 1.31, 0, 0.05, 0.05, 4)], (p) => [p[1] > 1.25 ? HAIR : SKIN, 0, Math.min(1, p[1] / 1.75), 0])
  return parts.geometry()
}

// ------------------------------------------------------------------ material

const PEOPLE_VERTEX_HEAD = /* glsl */ `
attribute vec4 aPaint;
attribute vec4 aLook; // camisa, calça, pele, jeito de se mexer
attribute vec4 aWalk; // comprimento do caminho, velocidade, fase, uniforme de equipe
attribute float aRise; // quanto o caminho sobe do começo ao fim
uniform float uTime;
uniform vec3 uTeams[7];
varying vec3 vPerson;
float personFacing;
// O grosso do público veste branco, preto e cinza; a cor forte fica para os torcedores.
vec3 shirtTone(float h) {
  if (h < 0.24) return vec3(0.7, 0.7, 0.67);
  if (h < 0.47) return vec3(0.03, 0.033, 0.04);
  if (h < 0.58) return vec3(0.17, 0.18, 0.2);
  if (h < 0.67) return vec3(0.05, 0.09, 0.2);
  if (h < 0.8) return vec3(0.42, 0.04, 0.03);
  if (h < 0.86) return vec3(0.6, 0.46, 0.07);
  if (h < 0.91) return vec3(0.05, 0.2, 0.09);
  if (h < 0.95) return vec3(0.55, 0.23, 0.05);
  return vec3(0.3, 0.25, 0.19);
}
vec3 pantsTone(float h) {
  if (h < 0.42) return vec3(0.05, 0.08, 0.15);
  if (h < 0.7) return vec3(0.03, 0.03, 0.035);
  if (h < 0.86) return vec3(0.3, 0.26, 0.19);
  return vec3(0.42, 0.42, 0.42);
}
vec3 skinTone(float h) {
  return mix(vec3(0.72, 0.47, 0.34), vec3(0.2, 0.11, 0.07), h * h);
}
`

const PEOPLE_NORMAL = /* glsl */ `
float pathLength = aWalk.x;
float walkSpeed = aWalk.y;
float walkCycle = pathLength > 0.0 ? fract(uTime * walkSpeed / (2.0 * pathLength) + aWalk.z) : 0.0;
personFacing = walkCycle < 0.5 ? 1.0 : -1.0;
vec3 objectNormal = vec3(normal);
objectNormal.xz *= personFacing;
`

const PEOPLE_BEGIN = /* glsl */ `
vec3 transformed = vec3(position);
{
  float part = floor(aPaint.x + 0.5);
  float side = aPaint.y;
  float high = aPaint.z;
  float t = uTime + aLook.w * 40.0;
  // respira e muda o peso de lado: vivo, sem chamar atenção
  transformed.x += sin(t * 0.9) * 0.018 * high;
  transformed.z += sin(t * 0.63) * 0.03 * high;
  // de vez em quando, um torcedor levanta os braços
  if (part > 2.5 && part < 3.5 || (part == 1.0 && high < 0.75)) {
    float wave = step(0.9, aLook.w) * smoothstep(0.55, 0.85, sin(t * 0.37) * 0.5 + 0.5);
    transformed.y += wave * 0.62 * max(0.0, 0.95 - abs(high - 0.75) * 2.0);
  }
  if (walkSpeed > 0.0) {
    float stride = sin(uTime * walkSpeed * 5.2 + aWalk.z * 40.0);
    float swing = 1.0 - smoothstep(0.0, 0.55, high);
    if (part == 2.0 || part == 5.0) {
      transformed.x += stride * side * 0.24 * swing;
      transformed.y += max(0.0, stride * side) * 0.07 * swing;
    }
    if (part == 3.0 || part == 1.0) transformed.x -= stride * side * 0.14 * smoothstep(0.72, 0.5, high);
    transformed.y += abs(stride) * 0.018;
    transformed.xz *= personFacing;
    // o caminho está em metros do mundo, e aqui a escala é a da altura de cada pessoa
    float walked = (walkCycle < 0.5 ? walkCycle * 2.0 : (1.0 - walkCycle) * 2.0) / length(instanceMatrix[0].xyz);
    transformed.x += walked * pathLength;
    transformed.y += walked * aRise;
  }
  vec3 shirt = aWalk.w > 0.5 ? uTeams[int(aWalk.w + 0.5) - 1] : shirtTone(aLook.x);
  vec3 skin = skinTone(aLook.z);
  if (part < 0.5) vPerson = shirt;
  else if (part < 1.5) vPerson = skin;
  else if (part < 2.5) vPerson = pantsTone(aLook.y);
  else if (part < 3.5) vPerson = shirt;
  else if (part < 4.5) vPerson = fract(aLook.z * 11.0) > 0.86 ? vec3(0.42, 0.34, 0.24) : vec3(0.025, 0.02, 0.018);
  else vPerson = fract(aLook.y * 9.0) > 0.6 ? vec3(0.62, 0.62, 0.6) : vec3(0.03);
  // boné, que do alto é o que mais aparece: mais ou menos um em quatro
  if (part > 3.5 && part < 4.5 && fract(aLook.x * 13.0) > 0.75) vPerson = shirtTone(fract(aLook.x * 29.0));
}
`

function peopleMaterial() {
  return atmospheric(new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 }), {
    key: 'people',
    vertexHead: PEOPLE_VERTEX_HEAD,
    vertex: [
      ['#include <beginnormal_vertex>', PEOPLE_NORMAL],
      ['#include <begin_vertex>', PEOPLE_BEGIN],
    ],
    fragmentHead: 'varying vec3 vPerson;',
    fragment: [['#include <color_fragment>', 'diffuseColor.rgb = vPerson;']],
    uniforms: { uTime: shared.uTime, uTeams: { value: Object.values(TEAMS).map((team) => new THREE.Color(team.color)) } },
  })
}

// ------------------------------------------------------------------ sombra no chão

function shadowMesh(chunk, sun) {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 0, 1, -1, 0, 0, 1, 0, 1, -1, 0, 1], 3))
  geometry.setAttribute('aOrigin', chunk.origin)
  geometry.setAttribute('aWalk', chunk.walk)
  geometry.setAttribute('aRise', chunk.rise)
  geometry.instanceCount = chunk.count
  // comprimento da sombra de 1,7 m, na direção oposta à do sol
  const shadow = new THREE.Vector2(-sun.x, -sun.z).multiplyScalar(1.7 / sun.y)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: shared.uTime, uShadow: { value: shadow } },
    vertexShader: /* glsl */ `
      attribute vec4 aOrigin; // x, y, z, ângulo
      attribute vec4 aWalk;
      attribute float aRise;
      uniform float uTime;
      uniform vec2 uShadow;
      varying vec2 vQ;
      void main() {
        float travel = 0.0;
        if (aWalk.x > 0.0) {
          float cycle = fract(uTime * aWalk.y / (2.0 * aWalk.x) + aWalk.z);
          travel = cycle < 0.5 ? cycle * 2.0 : (1.0 - cycle) * 2.0;
        }
        vec3 base = aOrigin.xyz + vec3(cos(aOrigin.w) * aWalk.x, aRise, -sin(aOrigin.w) * aWalk.x) * travel;
        vec2 across = normalize(vec2(-uShadow.y, uShadow.x));
        vec2 flat2 = base.xz + across * position.x * 0.24 + uShadow * position.z;
        vQ = vec2(position.x, position.z);
        gl_Position = projectionMatrix * viewMatrix * vec4(flat2.x, base.y + 0.04, flat2.y, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vQ;
      void main() {
        float a = (1.0 - smoothstep(0.55, 1.0, abs(vQ.x))) * smoothstep(0.0, 0.06, vQ.y) * (1.0 - smoothstep(0.72, 1.0, vQ.y));
        gl_FragColor = vec4(0.015, 0.018, 0.024, a * 0.42);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 3
  return mesh
}

// ------------------------------------------------------------------ quem fica onde

/**
 * A lista de pessoas, mais o que ocupa o chão: prédios, pista, arquibancadas, caminhões, motorhomes e
 * tendas, numa grade de 2 m. Quem cairia em cima disso não entra, e quem anda para antes de chegar lá.
 */
export function createCrowd(field, geo) {
  const CELL = 2
  const MARGIN = 260
  const [bx0, by0, bx1, by1] = CIRCUIT.bounds
  const x0 = bx0 - MARGIN, y0 = by0 - MARGIN
  const w = Math.ceil((bx1 - bx0 + 2 * MARGIN) / CELL), h = Math.ceil((by1 - by0 + 2 * MARGIN) / CELL)
  const cells = new Uint8Array(w * h)

  /** Marca um contorno, dado como lista plana x, y, x, y... */
  const mark = (pts) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let k = 0; k < pts.length; k += 2) {
      minX = Math.min(minX, pts[k]); maxX = Math.max(maxX, pts[k])
      minY = Math.min(minY, pts[k + 1]); maxY = Math.max(maxY, pts[k + 1])
    }
    const i0 = Math.max(0, Math.floor((minX - x0) / CELL)), i1 = Math.min(w - 1, Math.ceil((maxX - x0) / CELL))
    const j0 = Math.max(0, Math.floor((minY - y0) / CELL)), j1 = Math.min(h - 1, Math.ceil((maxY - y0) / CELL))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (pointInPolygon(pts, x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL)) cells[j * w + i] = 1
      }
    }
  }
  /** Retângulo de uma peça com `x`, `y` e `angle`, no mesmo sistema local dela: +x é a frente. */
  const markPiece = (t, lx0, lx1, halfWidth) => {
    const c = Math.cos(t.angle), s = Math.sin(t.angle)
    const corner = (lx, lz) => [t.x + lx * c + lz * s, t.y + lx * s - lz * c]
    mark([...corner(lx0, -halfWidth), ...corner(lx1, -halfWidth), ...corner(lx1, halfWidth), ...corner(lx0, halfWidth)])
  }
  for (const { pts } of geo.layers.buildings) mark(pts)
  for (let i = 0; i < N; i++) {
    const r = Math.ceil((Math.max(P[i].left, P[i].right) + 3) / CELL)
    const ci = Math.floor((P[i].x - x0) / CELL), cj = Math.floor((P[i].y - y0) / CELL)
    for (let j = Math.max(0, cj - r); j <= Math.min(h - 1, cj + r); j++) {
      for (let k = Math.max(0, ci - r); k <= Math.min(w - 1, ci + r); k++) cells[j * w + k] = 1
    }
  }
  for (const t of TRUCKS) markPiece(t, -9.2, 11.6, 1.9)
  for (const t of HOSPITALITY) markPiece(t, -8.2, 8.2, 5.4)
  for (const t of TENTS) markPiece(t, -t.length / 2 - 0.5, t.length / 2 + 0.5, t.width / 2 + 0.5)

  const blocked = (x, y) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((y - y0) / CELL)
    return i >= 0 && j >= 0 && i < w && j < h && cells[j * w + i] === 1
  }

  const ground = []

  /** Alguém parado ou andando em linha reta, com os pés no chão. `path` é só o desejo: o que sobra pode ser menos. */
  const onFoot = (x, y, yaw, { path = 0, speed = 0, uniform = 0, lift = 0.02 } = {}) => {
    if (blocked(x, y)) return
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const heightAt = (d) => field.heightAt(x + c * d, y + s * d)
    let length = 0
    while (length + 1 <= path && !blocked(x + c * (length + 1), y + s * (length + 1))) length++
    // A subida é uma reta do começo ao fim. Se o terreno faz curva no meio, encurta até os pés ficarem no chão.
    const start = heightAt(0)
    const fits = (len) => {
      const rise = heightAt(len) - start
      for (let d = 1; d < len; d++) if (Math.abs(start + (rise * d) / len - heightAt(d)) > 0.12) return false
      return true
    }
    while (length >= 2 && !fits(length)) length--
    const walks = length >= 2
    ground.push({ x, y: start + lift, z: -y, yaw, uniform, path: walks ? length : 0, speed: walks ? speed : 0, rise: walks ? heightAt(length) - start : 0 })
  }

  return { seated: [], ground, flags: [], blocked, mark, onFoot }
}

// ------------------------------------------------------------------ montagem

/** Separa uma lista de pessoas em grupos por área: cada um é descartado sozinho fora da tela. */
function chunked(list, size) {
  const groups = new Map()
  for (const person of list) {
    const key = `${Math.floor(person.x / size)},${Math.floor(person.z / size)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(person)
  }
  return [...groups.values()]
}

const matrix = new THREE.Matrix4()
const quaternion = new THREE.Quaternion()
const up = new THREE.Vector3(0, 1, 0)
const position = new THREE.Vector3()
const scale = new THREE.Vector3()

function buildChunk(people, rand) {
  const count = people.length
  // Torcida junta: cada bloco tem uma cor que se repete mais, e isso tira o aspecto de confete.
  const fans = rand()
  const matrices = new Float32Array(count * 16)
  const looks = new Float32Array(count * 4)
  const walks = new Float32Array(count * 4)
  const origins = new Float32Array(count * 4)
  const rises = new Float32Array(count)
  let cx = 0, cy = 0, cz = 0
  people.forEach((p, i) => {
    const size = p.size ?? 0.93 + rand() * 0.13
    quaternion.setFromAxisAngle(up, p.yaw)
    position.set(p.x, p.y, p.z)
    scale.setScalar(size)
    matrix.compose(position, quaternion, scale)
    matrix.toArray(matrices, i * 16)
    looks[i * 4] = rand() < 0.22 ? fans : rand()
    looks[i * 4 + 1] = rand()
    looks[i * 4 + 2] = rand()
    looks[i * 4 + 3] = rand()
    walks[i * 4] = p.path ?? 0
    walks[i * 4 + 1] = p.speed ?? 0
    walks[i * 4 + 2] = rand()
    // número da equipe, para quem está de uniforme; zero é roupa comum
    walks[i * 4 + 3] = p.uniform ?? 0
    origins[i * 4] = p.x
    origins[i * 4 + 1] = p.y
    origins[i * 4 + 2] = p.z
    origins[i * 4 + 3] = p.yaw
    rises[i] = p.rise ?? 0
    cx += p.x
    cy += p.y
    cz += p.z
  })
  const center = new THREE.Vector3(cx / count, cy / count, cz / count)
  let radius = 0
  for (const p of people) radius = Math.max(radius, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z) + (p.path ?? 0))
  return {
    count,
    matrix: new THREE.InstancedBufferAttribute(matrices, 16),
    look: new THREE.InstancedBufferAttribute(looks, 4),
    walk: new THREE.InstancedBufferAttribute(walks, 4),
    origin: new THREE.InstancedBufferAttribute(origins, 4),
    rise: new THREE.InstancedBufferAttribute(rises, 1),
    sphere: new THREE.Sphere(center, radius + 3),
  }
}

function instanced(geometry, material, chunk) {
  const g = geometry.clone()
  g.setAttribute('aLook', chunk.look)
  g.setAttribute('aWalk', chunk.walk)
  g.setAttribute('aRise', chunk.rise)
  const mesh = new THREE.InstancedMesh(g, material, chunk.count)
  mesh.instanceMatrix = chunk.matrix
  mesh.boundingSphere = chunk.sphere
  mesh.frustumCulled = true
  mesh.receiveShadow = true
  mesh.castShadow = false
  return mesh
}

/** Distâncias da câmera, em metros, em que cada nível entra. */
const NEAR = 100
const MID = 420

export function createPeople({ seated, ground, sun, simple }) {
  const rand = seeded(5533)
  const material = peopleMaterial()
  const group = new THREE.Group()
  const close = new THREE.Group()
  const mid = new THREE.Group()
  const shadows = new THREE.Group()
  group.add(close, mid, shadows)

  const seatedHigh = simple ? null : seatedNear()
  const seatedLow = seatedFar()
  for (const list of chunked(seated, 36)) {
    const chunk = buildChunk(list, rand)
    if (seatedHigh) close.add(instanced(seatedHigh, material, chunk))
    mid.add(instanced(seatedLow, material, chunk))
  }
  const standHigh = simple ? null : standingNear()
  const standLow = standingFar()
  for (const list of chunked(ground, 90)) {
    const chunk = buildChunk(list, rand)
    if (standHigh) close.add(instanced(standHigh, material, chunk))
    mid.add(instanced(standLow, material, chunk))
    shadows.add(shadowMesh(chunk, sun))
  }

  const midLimit = simple ? 300 : MID
  let shown = ''
  return {
    group,
    count: seated.length + ground.length,
    update(distance) {
      const level = distance < NEAR && !simple ? 'close' : distance < midLimit ? 'mid' : 'far'
      if (level === shown) return
      shown = level
      close.visible = level === 'close'
      mid.visible = level === 'mid'
      shadows.visible = level !== 'far'
      shared.uCrowd.value = level === 'far' ? 0 : 1
    },
  }
}
