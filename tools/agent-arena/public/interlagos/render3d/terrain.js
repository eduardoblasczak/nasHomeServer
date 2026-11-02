// Terreno: relevo real ajustado à pista, chão pintado a partir dos mapas e da vista aérea, e a
// passada de GPU que dá variação de cor à grama. Tudo é cozido no início: por quadro, o terreno
// só lê texturas, e é isso que deixa folga para os 144 Hz.

import { at, CIRCUIT, N, P, PIT, STEP } from '../circuit.js'
import { CLAY, LAWNS, PAINT, PATCHES, PATHS, PAVED, RUNOFF, SITE } from '../surfaces.js'
import { atmospheric, bakeToTarget, loadTiled, NOISE_GLSL, seeded, smoothstep, THREE } from './common.js'

const MESH_STEP = 8
const area = CIRCUIT.area

// ------------------------------------------------------------------ relevo

export function buildHeightField(geo) {
  const T = CIRCUIT.terrain
  const source = (i, j) => geo.heights[Math.max(0, Math.min(T.ny - 1, j)) * T.nx + Math.max(0, Math.min(T.nx - 1, i))] / 10
  const cubic = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
  const natural = (x, y) => {
    const fx = (x - T.x0) / T.step
    const fy = (y - T.y0) / T.step
    const i = Math.floor(fx), j = Math.floor(fy)
    const u = fx - i, v = fy - j
    const row = (r) => cubic(source(i - 1, r), source(i, r), source(i + 1, r), source(i + 2, r), u)
    return cubic(row(j - 1), row(j), row(j + 1), row(j + 2), v)
  }

  const nx = Math.floor((area[2] - area[0]) / MESH_STEP) + 1
  const ny = Math.floor((area[3] - area[1]) / MESH_STEP) + 1
  const h = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = natural(area[0] + i * MESH_STEP, area[1] + j * MESH_STEP)

  // Faixa em torno da pista e do pit lane: acompanha a altitude deles, com transição suave.
  const dist = new Float32Array(nx * ny).fill(1e9)
  const level = new Float32Array(nx * ny)
  const stamp = (x, y, z, half) => {
    const R = 90
    const i0 = Math.max(0, Math.floor((x - R - area[0]) / MESH_STEP)), i1 = Math.min(nx - 1, Math.ceil((x + R - area[0]) / MESH_STEP))
    const j0 = Math.max(0, Math.floor((y - R - area[1]) / MESH_STEP)), j1 = Math.min(ny - 1, Math.ceil((y + R - area[1]) / MESH_STEP))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = area[0] + i * MESH_STEP - x, dy = area[1] + j * MESH_STEP - y
        const d = Math.sqrt(dx * dx + dy * dy) - half
        const k = j * nx + i
        if (d < dist[k]) {
          dist[k] = d
          level[k] = z
        }
      }
    }
  }
  for (let i = 0; i < N; i++) stamp(P[i].x, P[i].y, P[i].z, Math.max(P[i].left, P[i].right) + 2)
  for (const p of PIT) stamp(p.x, p.y, p.z, 9)
  for (let k = 0; k < h.length; k++) {
    if (dist[k] < 80) {
      const t = smoothstep(7, 80, dist[k])
      h[k] = level[k] - 0.3 + (h[k] - level[k] + 0.3) * t
    }
  }

  // Lagos: água plana no nível mais baixo da margem, com fundo escavado.
  const lakes = []
  for (const { pts } of geo.layers.water) {
    let area2 = 0
    let lo = Infinity
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
    const n = pts.length / 2
    for (let a = 0; a < n; a++) {
      const b = (a + 1) % n
      area2 += pts[a * 2] * pts[b * 2 + 1] - pts[b * 2] * pts[a * 2 + 1]
      minX = Math.min(minX, pts[a * 2]); maxX = Math.max(maxX, pts[a * 2])
      minY = Math.min(minY, pts[a * 2 + 1]); maxY = Math.max(maxY, pts[a * 2 + 1])
    }
    if (Math.abs(area2) / 2 < 1500) continue
    const heightAtRaw = (x, y) => h[Math.max(0, Math.min(ny - 1, Math.round((y - area[1]) / MESH_STEP))) * nx + Math.max(0, Math.min(nx - 1, Math.round((x - area[0]) / MESH_STEP)))]
    for (let a = 0; a < n; a++) lo = Math.min(lo, heightAtRaw(pts[a * 2], pts[a * 2 + 1]))
    const water = lo - 0.2
    const inside = (x, y) => {
      let c = false
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ya = pts[a * 2 + 1], yb = pts[b * 2 + 1]
        if (ya > y !== yb > y && x < ((pts[b * 2] - pts[a * 2]) * (y - ya)) / (yb - ya) + pts[a * 2]) c = !c
      }
      return c
    }
    const margin = 34
    for (let j = Math.floor((minY - margin - area[1]) / MESH_STEP); j <= Math.ceil((maxY + margin - area[1]) / MESH_STEP); j++) {
      for (let i = Math.floor((minX - margin - area[0]) / MESH_STEP); i <= Math.ceil((maxX + margin - area[0]) / MESH_STEP); i++) {
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue
        const x = area[0] + i * MESH_STEP, y = area[1] + j * MESH_STEP
        const k = j * nx + i
        if (inside(x, y)) {
          h[k] = water - 2.2
        } else {
          let best = Infinity
          for (let a = 0; a < n; a++) best = Math.min(best, (pts[a * 2] - x) ** 2 + (pts[a * 2 + 1] - y) ** 2)
          best = Math.sqrt(best)
          if (best < margin) h[k] = water + 0.5 + (Math.max(h[k], water + 0.5) - water - 0.5) * smoothstep(0, margin, best)
        }
      }
    }
    lakes.push({ pts, level: water })
  }

  const heightAt = (x, y) => {
    const fx = Math.max(0, Math.min(nx - 1.001, (x - area[0]) / MESH_STEP))
    const fy = Math.max(0, Math.min(ny - 1.001, (y - area[1]) / MESH_STEP))
    const i = Math.floor(fx), j = Math.floor(fy)
    const u = fx - i, v = fy - j
    const a = h[j * nx + i] * (1 - u) + h[j * nx + i + 1] * u
    const b = h[(j + 1) * nx + i] * (1 - u) + h[(j + 1) * nx + i + 1] * u
    return a * (1 - v) + b * v
  }
  return { nx, ny, h, heightAt, lakes }
}

export function buildTerrainGeometry({ nx, ny, h }) {
  const position = new Float32Array(nx * ny * 3)
  const normal = new Float32Array(nx * ny * 3)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      position[k * 3] = area[0] + i * MESH_STEP
      position[k * 3 + 1] = h[k]
      position[k * 3 + 2] = -(area[1] + j * MESH_STEP)
      const hl = h[j * nx + Math.max(0, i - 1)], hr = h[j * nx + Math.min(nx - 1, i + 1)]
      const hd = h[Math.max(0, j - 1) * nx + i], hu = h[Math.min(ny - 1, j + 1) * nx + i]
      // z do mundo é -y dos dados
      const nxv = (hl - hr) / (2 * MESH_STEP), nzv = (hu - hd) / (2 * MESH_STEP)
      const len = Math.hypot(nxv, 1, nzv)
      normal[k * 3] = nxv / len
      normal[k * 3 + 1] = 1 / len
      normal[k * 3 + 2] = nzv / len
    }
  }
  const index = new Uint32Array((nx - 1) * (ny - 1) * 6)
  let p = 0
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      // j cresce para o norte, que é -z: enrolamento invertido em relação à grade
      index[p++] = a; index[p++] = b; index[p++] = c
      index[p++] = b; index[p++] = d; index[p++] = c
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4000)
  return geometry
}

// ------------------------------------------------------------------ pintura do chão

function canvasLayer(size, region) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const kx = size / (region.maxX - region.minX)
  const ky = size / (region.maxY - region.minY)
  g.setTransform(kx, 0, 0, -ky, -region.minX * kx, region.maxY * ky)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  return { c, g, k: kx }
}

function tracePoly(g, points, close = true) {
  g.beginPath()
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  if (close) g.closePath()
}

function traceFlat(g, pts, close = true) {
  g.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  if (close) g.closePath()
}

/** Pinta cor e máscara. Máscara: R = pavimentado, G = grama, B = oclusão (255 = sem). */
function paintLayer(geo, region, size) {
  const color = canvasLayer(size, region)
  const mask = canvasLayer(size, region)
  const rand = seeded(4242)
  const fillBoth = (trace, colorStyle, maskStyle) => {
    color.g.fillStyle = colorStyle
    mask.g.fillStyle = maskStyle
    for (const l of [color.g, mask.g]) {
      trace(l)
      l.fill()
    }
  }
  // Canto arredondado e borda difusa: corta o aspecto de recorte dos polígonos traçados à mão.
  const fillRounded = (points, colorStyle, maskStyle, grow, soft) => {
    for (const layer of [color, mask]) {
      const l = layer.g
      l.save()
      l.filter = `blur(${Math.max(1, Math.round(soft * layer.k))}px)`
      l.fillStyle = l.strokeStyle = layer === color ? colorStyle : maskStyle
      l.lineWidth = grow * 2
      tracePoly(l, points)
      l.fill()
      l.stroke()
      l.restore()
    }
  }
  const MASK_PAVED = 'rgb(255,0,255)'
  const MASK_GRASS = 'rgb(0,255,255)'
  const MASK_SOIL = 'rgb(0,0,255)'
  const MASK_CITY = 'rgb(170,0,255)'

  // cidade
  color.g.fillStyle = PAINT.city
  color.g.fillRect(region.minX, region.minY, region.maxX - region.minX, region.maxY - region.minY)
  mask.g.fillStyle = MASK_CITY
  mask.g.fillRect(region.minX, region.minY, region.maxX - region.minX, region.maxY - region.minY)
  for (const { pts } of geo.layers.grass) {
    fillBoth((l) => { l.beginPath(); traceFlat(l, pts) }, '#667a48', MASK_GRASS)
  }
  for (const { pts } of geo.layers.scrub) {
    fillBoth((l) => { l.beginPath(); traceFlat(l, pts) }, '#58703f', MASK_GRASS)
  }
  for (const { pts } of geo.layers.parking) {
    fillBoth((l) => { l.beginPath(); traceFlat(l, pts) }, '#65625b', MASK_PAVED)
  }

  // calçadas e ruas: largura real por classe, do menor para o maior
  const roads = [...geo.layers.roads].sort((a, b) => a.prop - b.prop)
  for (const { prop: width, pts } of roads) {
    if (width <= 2.5) continue
    color.g.strokeStyle = '#8b857a'
    color.g.lineWidth = width + 3
    color.g.beginPath()
    traceFlat(color.g, pts, false)
    color.g.stroke()
    mask.g.strokeStyle = MASK_PAVED
    mask.g.lineWidth = width + 3
    mask.g.beginPath()
    traceFlat(mask.g, pts, false)
    mask.g.stroke()
  }
  for (const { prop: width, pts } of roads) {
    if (width <= 2.5) continue
    color.g.strokeStyle = width >= 12 ? '#3f3f3e' : '#484846'
    color.g.lineWidth = width
    color.g.beginPath()
    traceFlat(color.g, pts, false)
    color.g.stroke()
  }

  // o autódromo em si
  fillBoth((l) => tracePoly(l, SITE), PAINT.grass, MASK_GRASS)

  // manchas suaves: capim seco, solo exposto, áreas mais verdes
  for (const [fn, X, Y, rx, ry, turn, tint, alpha] of PATCHES) {
    const [x, y] = fn(X, Y)
    const r = Math.max(rx, ry) / 3
    const g = color.g
    g.save()
    g.translate(x, y)
    g.rotate(turn)
    g.scale(rx / 3 / r, ry / 3 / r)
    const grad = g.createRadialGradient(0, 0, r * 0.25, 0, 0, r)
    const rgb = hexToRgb(tint)
    grad.addColorStop(0, `rgba(${rgb},${alpha})`)
    grad.addColorStop(0.65, `rgba(${rgb},${alpha * 0.75})`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.beginPath()
    g.arc(0, 0, r, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  // manchas aleatórias no gramado: quebram a uniformidade em todo o terreno
  const bounds = CIRCUIT.bounds
  color.g.save()
  tracePoly(color.g, SITE)
  color.g.clip()
  const tints = ['166,156,102', '118,130,76', '96,140,72', '150,124,84', '132,132,84', '92,112,66']
  for (let i = 0; i < 420; i++) {
    const x = bounds[0] - 120 + rand() * (bounds[2] - bounds[0] + 240)
    const y = bounds[1] - 120 + rand() * (bounds[3] - bounds[1] + 240)
    const r = 8 + rand() * rand() * 75
    const grad = color.g.createRadialGradient(x, y, 0, x, y, r)
    const t = tints[Math.floor(rand() * tints.length)]
    grad.addColorStop(0, `rgba(${t},${0.1 + rand() * 0.34})`)
    grad.addColorStop(1, `rgba(${t},0)`)
    color.g.fillStyle = grad
    color.g.beginPath()
    color.g.arc(x, y, r, 0, Math.PI * 2)
    color.g.fill()
  }
  color.g.restore()

  // chão da mata e água
  for (const { pts } of geo.layers.forest) {
    fillBoth((l) => { l.beginPath(); traceFlat(l, pts) }, PAINT.forestFloor, MASK_SOIL)
  }

  // vias internas: as de serviço por cima da grama
  for (const { prop: width, pts } of roads) {
    if (!pointNearSite(pts)) continue
    if (width <= 2.5) {
      color.g.strokeStyle = 'rgba(168,150,112,0.55)'
      color.g.lineWidth = Math.max(1.6, width)
      color.g.beginPath()
      traceFlat(color.g, pts, false)
      color.g.stroke()
    } else {
      color.g.strokeStyle = '#6d6b62'
      color.g.lineWidth = width * 0.9
      color.g.beginPath()
      traceFlat(color.g, pts, false)
      color.g.stroke()
      mask.g.strokeStyle = MASK_PAVED
      mask.g.lineWidth = width
      mask.g.beginPath()
      traceFlat(mask.g, pts, false)
      mask.g.stroke()
    }
  }

  for (const zone of PAVED) {
    if (zone.soft) {
      // borda difusa: a mancha se funde ao que está em volta
      color.g.save()
      color.g.filter = `blur(${Math.round(zone.soft * color.k)}px)`
      color.g.globalAlpha = zone.alpha ?? 1
      color.g.fillStyle = zone.color
      tracePoly(color.g, zone.points)
      color.g.fill()
      color.g.restore()
      mask.g.fillStyle = MASK_PAVED
      tracePoly(mask.g, zone.points)
      mask.g.fill()
    } else {
      fillBoth((l) => tracePoly(l, zone.points), zone.color, MASK_PAVED)
    }
  }
  for (const path of PATHS) {
    const g = color.g
    g.save()
    g.filter = `blur(${Math.max(1, Math.round(Math.min(2.5, path.width * 0.3) * color.k))}px)`
    g.globalAlpha = path.alpha
    g.strokeStyle = path.color
    g.lineWidth = path.width
    tracePoly(g, path.points, false)
    g.stroke()
    g.restore()
  }
  for (const lawn of LAWNS) fillRounded(lawn.points, lawn.color, MASK_GRASS, 2.2, 0.8)
  for (const points of CLAY) fillBoth((l) => tracePoly(l, points), PAINT.clay, MASK_SOIL)

  // kartódromo
  for (const { prop: width, pts } of geo.layers.kart) {
    color.g.strokeStyle = '#4a4a47'
    color.g.lineWidth = width * 0.72
    color.g.beginPath()
    traceFlat(color.g, pts, false)
    color.g.stroke()
    mask.g.strokeStyle = MASK_PAVED
    mask.g.lineWidth = width * 0.8
    mask.g.beginPath()
    traceFlat(mask.g, pts, false)
    mask.g.stroke()
  }

  // escapes e faixa asfaltada em volta da pista
  for (const zone of RUNOFF) fillRounded(zone.points, zone.color, MASK_PAVED, 0.8, zone.soft ?? 1)
  // preenche por `evenodd` usando caminho duplo: a faixa sem cobrir o miolo
  const ring = (width, style) => {
    const outerA = []
    const outerB = []
    for (let i = 0; i < N; i++) {
      const a = at(i * STEP, P[i].left + width)
      const b = at(i * STEP, -(P[i].right + width))
      outerA.push([a.x, a.y])
      outerB.push([b.x, b.y])
    }
    for (const l of [color.g, mask.g]) {
      l.fillStyle = l === color.g ? style : MASK_PAVED
      l.beginPath()
      outerA.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y)))
      l.closePath()
      outerB.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y)))
      l.closePath()
      l.fill('evenodd')
    }
  }
  ring(2.6, '#3d3e3d')

  // pit lane, por baixo da faixa própria
  color.g.strokeStyle = '#3d3e3d'
  mask.g.strokeStyle = MASK_PAVED
  for (const [layer, width] of [[color.g, 15], [mask.g, 15]]) {
    layer.lineWidth = width
    layer.beginPath()
    PIT.forEach((p, i) => (i ? layer.lineTo(p.x, p.y) : layer.moveTo(p.x, p.y)))
    layer.stroke()
  }

  // oclusão ambiente em volta do que tem altura: só escurece, no canal azul da máscara
  mask.g.save()
  mask.g.globalCompositeOperation = 'multiply'
  mask.g.filter = `blur(${Math.max(1, Math.round(3 * mask.k))}px)`
  mask.g.fillStyle = 'rgb(255,255,70)'
  mask.g.beginPath()
  for (const { pts } of geo.layers.buildings) traceFlat(mask.g, pts)
  for (const { pts } of geo.layers.stands) traceFlat(mask.g, pts)
  mask.g.fill()
  mask.g.restore()

  return { color: color.c, mask: mask.c }
}

const hexToRgb = (hex) => {
  const v = parseInt(hex.slice(1), 16)
  return `${v >> 16},${(v >> 8) & 255},${v & 255}`
}

function pointNearSite(pts) {
  const x = pts[0], y = pts[1]
  const b = CIRCUIT.bounds
  return x > b[0] - 160 && x < b[2] + 260 && y > b[1] - 140 && y < b[3] + 160
}

// ------------------------------------------------------------------ distância até a pista

function trackDistanceField(region, size) {
  const data = new Float32Array(size * size).fill(1000)
  const k = size / (region.maxX - region.minX)
  const R = 170
  // Segmentos, não círculos: com círculos, as linhas de mesma distância saem onduladas.
  const stamp = (a, b) => {
    const halfA = Math.max(a.left, a.right), halfB = Math.max(b.left, b.right)
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R - region.minX) * k)), i1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x) + R - region.minX) * k))
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - R - region.minY) * k)), j1 = Math.min(size - 1, Math.ceil((Math.max(a.y, b.y) + R - region.minY) * k))
    for (let j = j0; j <= j1; j++) {
      const py = region.minY + (j + 0.5) / k - a.y
      for (let i = i0; i <= i1; i++) {
        const px = region.minX + (i + 0.5) / k - a.x
        const t = Math.min(1, Math.max(0, (px * dx + py * dy) / len2))
        const ex = px - t * dx, ey = py - t * dy
        const d = Math.sqrt(ex * ex + ey * ey) - (halfA + (halfB - halfA) * t)
        const c = j * size + i
        if (d < data[c]) data[c] = d
      }
    }
  }
  for (let i = 0; i < N; i += 2) stamp(P[i], P[(i + 2) % N])
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType)
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

// ------------------------------------------------------------------ cozimento

const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPaint;
uniform sampler2D uMask;
uniform sampler2D uDist;
uniform vec4 uRegion; // minX, minY, tamanhoX, tamanhoY
${NOISE_GLSL}
void main() {
  vec2 w = uRegion.xy + vUv * uRegion.zw;
  vec3 c = pow(texture2D(uPaint, vUv).rgb, vec3(2.2));
  vec3 m = texture2D(uMask, vUv).rgb;
  float paved = m.r, grassy = m.g, occlusion = m.b;
  float dist = texture2D(uDist, vUv).r;

  float n1 = fbm(w * 0.0075, 5);
  float n2 = fbm(w * 0.026 + 7.3, 5);
  float n3 = fbm(w * 0.1 + 3.1, 5);
  float n4 = fbm(w * 0.55 + 13.7, 4);
  float n5 = fbm(w * vec2(0.19, 0.047) + 31.0, 3);
  float n6 = fbm(w * 2.3 + 51.0, 3);

  // grama: tufos escuros, áreas secas amareladas, faixas de corte paralelas à pista
  vec3 grass = c * (0.82 + 0.36 * n1);
  grass = mix(grass, grass * vec3(1.24, 1.08, 0.76), smoothstep(0.42, 0.68, n2) * 0.62);
  grass = mix(grass, grass * vec3(0.76, 0.88, 0.72), smoothstep(0.48, 0.72, n3) * 0.5);
  grass *= 0.86 + 0.28 * n4;
  grass *= 0.93 + 0.14 * n6;
  float mow = sin(dist * 6.2832 / 15.0) * smoothstep(135.0, 40.0, dist) * smoothstep(4.0, 14.0, dist);
  grass *= 1.0 + 0.1 * mow * (0.5 + n1);
  // grama gasta perto da pista
  grass = mix(grass, c * vec3(1.05, 0.98, 0.78) * (0.9 + 0.2 * n4), smoothstep(10.0, 1.0, dist) * 0.35);

  // solo: veios e manchas
  vec3 soil = c * (0.74 + 0.52 * n3) * (0.82 + 0.36 * n4);

  // pavimento: manchas grandes, remendos e sujeira
  vec3 paint = c * (0.8 + 0.4 * n2) * (0.9 + 0.2 * n4);
  paint = mix(paint, paint * 0.8, smoothstep(0.6, 0.72, n5) * 0.5);
  float colored = smoothstep(0.02, 0.09, c.g - c.r);
  // marcas paralelas à pista: é o que faz a área pintada parecer asfalto rodado, e não água
  float along = dot(w, vec2(0.011, 0.008));
  float streak = fbm(vec2(dist * 0.18, along * 3.0) + 91.0, 4);
  float skid = smoothstep(0.6, 0.74, fbm(vec2(dist * 0.9, along * 5.0) + 17.0, 3)) * smoothstep(70.0, 20.0, dist);
  float worn = smoothstep(0.38, 0.72, streak) * 0.5 + smoothstep(0.55, 0.7, n3) * 0.25;
  paint = mix(paint, mix(paint, vec3(0.03, 0.04, 0.042), worn), colored);
  paint = mix(paint, paint * vec3(1.0, 1.05, 1.02) * (0.86 + 0.32 * n6), colored * 0.8);
  paint *= 1.0 - 0.45 * skid;

  vec3 outColor = mix(mix(soil, grass, grassy), paint, paved);
  outColor *= 0.32 + 0.68 * occlusion;
  gl_FragColor = vec4(pow(clamp(outColor, 0.0, 1.0), vec3(1.0 / 2.2)), paved);
}
`

function bakeLayer(renderer, geo, region, size, distField) {
  const { color, mask } = paintLayer(geo, region, size)
  const paint = new THREE.CanvasTexture(color)
  const maskTex = new THREE.CanvasTexture(mask)
  paint.colorSpace = maskTex.colorSpace = THREE.NoColorSpace
  paint.generateMipmaps = maskTex.generateMipmaps = false
  paint.minFilter = maskTex.minFilter = THREE.LinearFilter
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  })
  target.texture.anisotropy = 16
  bakeToTarget(renderer, target, new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BAKE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uPaint: { value: paint },
      uMask: { value: maskTex },
      uDist: { value: distField },
      uRegion: { value: new THREE.Vector4(region.minX, region.minY, region.maxX - region.minX, region.maxY - region.minY) },
    },
  }))
  paint.dispose()
  maskTex.dispose()
  color.width = color.height = 0
  mask.width = mask.height = 0
  return target
}

// ------------------------------------------------------------------ material

export async function createTerrain(renderer, geo, field) {
  const [grass, grassN, moss, mossN, dirt, laterite, paved, pavedN] = await Promise.all([
    loadTiled('grass_ground_diff_1k'),
    loadTiled('grass_ground_nor_gl_1k', { srgb: false }),
    loadTiled('aerial_grass_rock_diff_1k'),
    loadTiled('aerial_grass_rock_nor_gl_1k', { srgb: false }),
    loadTiled('dirt_aerial_02_diff_1k'),
    loadTiled('red_laterite_soil_stones_diff_1k'),
    loadTiled('aerial_asphalt_01_diff_1k'),
    loadTiled('aerial_asphalt_01_nor_gl_1k', { srgb: false }),
  ])

  const inner = { minX: -780, maxX: 780, minY: -820, maxY: 740 }
  const outer = { minX: area[0], maxX: area[2], minY: area[1], maxY: area[3] }
  const innerDist = trackDistanceField(inner, 1024)
  const outerDist = trackDistanceField(outer, 512)
  const macroInner = bakeLayer(renderer, geo, inner, 4096, innerDist)
  const macroOuter = bakeLayer(renderer, geo, outer, 2048, outerDist)
  innerDist.dispose()
  outerDist.dispose()

  const material = atmospheric(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), {
    key: 'terrain',
    uniforms: {
      uMacroI: { value: macroInner.texture },
      uMacroO: { value: macroOuter.texture },
      uRegionI: { value: new THREE.Vector4(inner.minX, inner.minY, inner.maxX - inner.minX, inner.maxY - inner.minY) },
      uRegionO: { value: new THREE.Vector4(outer.minX, outer.minY, outer.maxX - outer.minX, outer.maxY - outer.minY) },
      uGrass: { value: grass },
      uGrassN: { value: grassN },
      uMoss: { value: moss },
      uMossN: { value: mossN },
      uDirt: { value: dirt },
      uLaterite: { value: laterite },
      uAvgLaterite: { value: laterite.average },
      uPaved: { value: paved },
      uPavedN: { value: pavedN },
      uAvgGrass: { value: grass.average },
      uAvgMoss: { value: moss.average },
      uAvgDirt: { value: dirt.average },
      uAvgPaved: { value: paved.average },
    },
    fragmentHead: /* glsl */ `
      uniform sampler2D uMacroI, uMacroO, uGrass, uGrassN, uMoss, uMossN, uDirt, uLaterite, uPaved, uPavedN;
      uniform vec4 uRegionI, uRegionO;
      uniform vec3 uAvgGrass, uAvgMoss, uAvgDirt, uAvgLaterite, uAvgPaved;
      const mat2 ROT_A = mat2(0.8, 0.6, -0.6, 0.8);
      const mat2 ROT_B = mat2(0.28, -0.96, 0.96, 0.28);
      float terrainPaved;
    `,
    fragment: [
      ['#include <map_fragment>', /* glsl */ `
        {
          vec2 xy = vec2(vWPos.x, -vWPos.z);
          vec2 uvI = (xy - uRegionI.xy) / uRegionI.zw;
          vec2 e = smoothstep(vec2(0.0), vec2(0.04), uvI) * smoothstep(vec2(0.0), vec2(0.04), 1.0 - uvI);
          vec4 macroColor = mix(texture2D(uMacroO, (xy - uRegionO.xy) / uRegionO.zw), texture2D(uMacroI, uvI), e.x * e.y);
          vec3 base = pow(macroColor.rgb, vec3(2.2));
          terrainPaved = macroColor.a;
          float dirt = smoothstep(0.012, 0.06, base.r - base.g) * (1.0 - terrainPaved);
          vec3 dGrass = texture2D(uGrass, vWPos.xz / 6.7).rgb / uAvgGrass;
          float lMoss = dot(texture2D(uMoss, ROT_A * vWPos.xz / 53.0).rgb / uAvgMoss, vec3(0.33));
          float lDirt = dot(texture2D(uDirt, ROT_B * vWPos.xz / 71.0).rgb / uAvgDirt, vec3(0.33));
          vec3 dSoil = texture2D(uLaterite, vWPos.xz / 5.3).rgb / uAvgLaterite;
          // duas escalas giradas entre si: esconde a repetição do ladrilho
          float lPavedA = dot(texture2D(uPaved, vWPos.xz / 33.0).rgb / uAvgPaved, vec3(0.33));
          float lPavedB = dot(texture2D(uPaved, ROT_B * vWPos.xz / 97.0).rgb / uAvgPaved, vec3(0.33));
          // o detalhe só altera o valor e um pouco do matiz; quem manda na cor é a pintura
          vec3 grassDetail = mix(dGrass, vec3(dot(dGrass, vec3(0.33))), 0.5) * mix(1.0, lMoss, 0.3);
          vec3 soilDetail = mix(vec3(dot(dSoil, vec3(0.33))), dSoil, 0.5) * mix(1.0, lDirt, 0.4);
          vec3 detail = mix(grassDetail, soilDetail, dirt);
          detail = mix(detail, vec3(mix(1.0, lPavedA, 0.55) * mix(1.0, lPavedB, 0.5)), terrainPaved);
          diffuseColor.rgb = base * min(detail, vec3(1.7));
        }
      `],
      ['#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.97, 0.80 - 0.45 * uWet, terrainPaved);'],
      ['#include <normal_fragment_maps>', /* glsl */ `
        {
          vec2 nGrass = (texture2D(uGrassN, vWPos.xz / 6.7).xy * 2.0 - 1.0) * 0.5 + (texture2D(uMossN, vWPos.xz / 53.0).xy * 2.0 - 1.0) * 0.6;
          vec2 nPaved = (texture2D(uPavedN, vWPos.xz / 33.0).xy * 2.0 - 1.0) * 0.4;
          vec2 nn = mix(nGrass, nPaved, terrainPaved);
          vec3 tx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
          vec3 tz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          normal = normalize(normal + tx * nn.x + tz * nn.y);
        }
      `],
    ],
  })

  const mesh = new THREE.Mesh(buildTerrainGeometry(field), material)
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}
