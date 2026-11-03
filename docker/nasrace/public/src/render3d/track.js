// A pista: malha seguindo o traçado medido, com tudo que é pintura e desgaste cozido numa textura
// ao longo do traçado (eixo u = metros de pista, eixo v = metros laterais). Assim as linhas ficam
// nítidas em qualquer zoom e o custo por quadro é uma só leitura de textura.

import { at, GARAGES, LENGTH, N, P, PACE, PIT, pitAt, PIT_LENGTH, racingOffset, STEP } from '../circuit.js'
import { atmospheric, loadTiled, seeded, THREE } from './common.js'

const HALF = 11 // metros cobertos pela textura para cada lado do eixo
const MAP_W = 8192
const MAP_H = 256
const LIFT = 0.05

// ------------------------------------------------------------------ textura ao longo da pista

function paintTrackMap(renderer) {
  const c = document.createElement('canvas')
  c.width = MAP_W
  c.height = MAP_H
  const g = c.getContext('2d', { willReadFrequently: true }) // na CPU, como o chão: milhares de retângulos
  const rand = seeded(90210)
  // unidade do desenho: metros. x = s, y = deslocamento lateral (esquerda positiva).
  g.setTransform(MAP_W / LENGTH, 0, 0, MAP_H / (2 * HALF), 0, MAP_H / 2)

  // base: asfalto com largas variações de tom
  g.fillStyle = 'rgb(86,87,88)'
  g.fillRect(0, -HALF, LENGTH, 2 * HALF)
  for (let s = 0; s < LENGTH;) {
    const len = 40 + rand() * 170
    const v = rand()
    g.fillStyle = v < 0.5 ? `rgba(40,40,42,${0.06 + rand() * 0.16})` : `rgba(140,140,138,${0.03 + rand() * 0.09})`
    g.fillRect(s, -HALF, len, 2 * HALF)
    s += len
  }
  // trecho claro, recapeado, antes do Café (visível na vista aérea)
  const light = g.createLinearGradient(3285, 0, 3550, 0)
  light.addColorStop(0, 'rgba(165,163,155,0)')
  light.addColorStop(0.06, 'rgba(165,163,155,0.8)')
  light.addColorStop(0.94, 'rgba(165,163,155,0.8)')
  light.addColorStop(1, 'rgba(165,163,155,0)')
  g.fillStyle = light
  g.fillRect(3285, -HALF, 265, 2 * HALF)
  // reta dos boxes e S do Senna: recapeados, mais escuros
  g.fillStyle = 'rgba(14,14,15,0.26)'
  g.fillRect(0, -HALF, 470, 2 * HALF)
  g.fillRect(3900, -HALF, LENGTH - 3900, 2 * HALF)
  g.fillStyle = 'rgba(14,14,15,0.3)'
  g.fillRect(1960, -HALF, 260, 2 * HALF)
  g.fillRect(1250, -HALF, 330, 2 * HALF)
  g.fillRect(2970, -HALF, 300, 2 * HALF)

  // faixas de pavimentação: emendas longitudinais, com o tom diferente de cada passada
  const lanes = [-6.2, -2, 2.2, 6.4]
  for (let k = 0; k < lanes.length - 1; k++) {
    for (let s = 0; s < LENGTH;) {
      const len = 60 + rand() * 240
      g.fillStyle = `rgba(${rand() < 0.5 ? '12,12,14' : '135,135,135'},${0.018 + rand() * 0.05})`
      g.fillRect(s, lanes[k], len, lanes[k + 1] - lanes[k])
      s += len
    }
  }
  for (const y of lanes) {
    g.strokeStyle = `rgba(18,18,20,0.32)`
    g.lineWidth = 0.09
    g.beginPath()
    for (let s = 0; s <= LENGTH; s += 12) {
      const v = y + Math.sin(s * 0.013 + y) * 0.2
      s ? g.lineTo(s, v) : g.moveTo(s, v)
    }
    g.stroke()
  }

  // remendos e rachaduras seladas
  for (let i = 0; i < 240; i++) {
    const s = rand() * LENGTH
    const y = (rand() - 0.5) * 11
    const w = 3 + rand() * 18
    const h = 0.8 + rand() * 3
    g.fillStyle = rand() < 0.75 ? `rgba(16,16,18,${0.12 + rand() * 0.3})` : `rgba(115,115,115,${0.07 + rand() * 0.13})`
    g.fillRect(s, y, w, h)
  }
  g.lineCap = 'round'
  for (let i = 0; i < 300; i++) {
    let s = rand() * LENGTH
    let y = (rand() - 0.5) * 12
    g.strokeStyle = `rgba(10,10,11,${0.25 + rand() * 0.4})`
    g.lineWidth = 0.05 + rand() * 0.06
    g.beginPath()
    g.moveTo(s, y)
    const n = 3 + Math.floor(rand() * 7)
    for (let k = 0; k < n; k++) {
      s += 0.8 + rand() * 3.5
      y += (rand() - 0.5) * 0.7
      g.lineTo(s, y)
    }
    g.stroke()
  }

  // borracha: várias passadas sobrepostas em torno da linha de corrida, com a linha central
  // bem marcada nas curvas e difusa nas retas
  const band = (width, alpha, offset, style = '8,8,9') => {
    g.strokeStyle = `rgba(${style},${alpha})`
    g.lineWidth = width
    g.lineCap = 'butt'
    g.beginPath()
    for (let i = 0; i <= N; i++) {
      const s = i * STEP
      const y = racingOffset(s) + offset
      i ? g.lineTo(s, y) : g.moveTo(s, y)
    }
    g.stroke()
  }
  band(4.6, 0.14, 0)
  band(3, 0.2, 0)
  band(1.9, 0.24, 0)
  band(0.6, 0.2, 0.85)
  band(0.6, 0.2, -0.85)

  // marcas de frenagem: mais densas onde o ritmo cai
  for (let i = 0; i < N; i++) {
    const before = PACE[(i + N - 2) % N]
    const after = PACE[(i + 4) % N]
    const drop = before - after
    if (drop < 0.012) continue
    const count = Math.min(9, Math.floor(drop * 110))
    for (let k = 0; k < count; k++) {
      const s = i * STEP + rand() * 6
      const y = racingOffset(s) + (rand() - 0.5) * 2.4
      const len = 8 + rand() * 30
      g.strokeStyle = `rgba(6,6,7,${0.1 + rand() * 0.3})`
      g.lineWidth = 0.22 + rand() * 0.14
      g.beginPath()
      g.moveTo(s, y)
      g.lineTo(s + len, racingOffset(s + len) + (y - racingOffset(s)) * 0.8)
      g.stroke()
    }
  }

  // poeira e "marbles" fora da linha, nas bordas das curvas
  for (let i = 0; i < 6500; i++) {
    const s = rand() * LENGTH
    const p = at(s)
    const out = Math.abs(p.curve) > 0.005 ? 1 : 0.25
    if (rand() > out) continue
    const line = racingOffset(s)
    const side = rand() < 0.5 ? 1 : -1
    const limit = side > 0 ? p.left : p.right
    const y = side * (Math.max(1.5, Math.abs(line) * 0.2) + rand() * limit)
    if (Math.abs(y - line) < 2.2) continue
    g.fillStyle = `rgba(150,146,130,${0.04 + rand() * 0.12})`
    g.fillRect(s, y, 0.3 + rand() * 1.2, 0.05 + rand() * 0.12)
  }

  // grama e terra carregadas para a borda
  const edgeLine = (side, inset, width, style) => {
    g.strokeStyle = style
    g.lineWidth = width
    g.beginPath()
    for (let i = 0; i <= N; i++) {
      const p = P[i % N]
      const y = side > 0 ? p.left - inset : -(p.right - inset)
      const s = i * STEP
      i ? g.lineTo(s, y) : g.moveTo(s, y)
    }
    g.stroke()
  }
  for (const side of [1, -1]) {
    edgeLine(side, 0.55, 1.1, 'rgba(120,112,90,0.13)')
    // linha branca de borda, com falhas de desgaste
    edgeLine(side, 0.32, 0.34, 'rgba(236,236,230,0.94)')
  }
  for (let i = 0; i < 900; i++) {
    const s = rand() * LENGTH
    const p = at(s)
    const side = rand() < 0.5 ? 1 : -1
    g.fillStyle = `rgba(40,40,42,${0.3 + rand() * 0.5})`
    g.fillRect(s, (side > 0 ? p.left : -p.right) - side * 0.5, 0.4 + rand() * 1.8, side * 0.4)
  }

  // grid de largada: marcas em U, alternadas, atrás da linha
  g.fillStyle = 'rgba(240,240,236,0.95)'
  for (let r = 0; r < 22; r++) {
    const s0 = -8 - r * 8
    const side = r % 2 ? 1 : -1
    const center = side * 3.1
    for (const shift of [0, LENGTH]) {
      const x = s0 + shift
      g.fillRect(x, center - 1.5, 0.35, 3)
      g.fillRect(x - 3.6, center - 1.5, 3.6, 0.22)
      g.fillRect(x - 3.6, center + 1.28, 3.6, 0.22)
    }
  }
  // linha de chegada: faixa branca e quadriculado junto à mureta
  g.fillStyle = 'rgba(240,240,236,0.96)'
  g.fillRect(-0.3, -HALF, 0.75, 2 * HALF)
  g.fillRect(LENGTH - 0.3, -HALF, 0.75, 2 * HALF)
  const p0 = at(0)
  for (let k = -p0.right; k < p0.left; k += 0.7) {
    for (let j = 0; j < 3; j++) {
      g.fillStyle = (Math.round((k + 10) / 0.7) + j) % 2 ? '#101011' : '#efefec'
      g.fillRect(0.5 + j * 0.7, k, 0.7, 0.7)
    }
  }

  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.flipY = false
  texture.anisotropy = 16
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  renderer.initTexture(texture)
  c.width = c.height = 0
  return texture
}

// ------------------------------------------------------------------ malha

function buildTrackGeometry() {
  const SPACING = 2.5
  const rows = Math.round(LENGTH / SPACING)
  const columns = [-1, -0.62, -0.25, 0, 0.25, 0.62, 1]
  const cols = columns.length
  const position = new Float32Array((rows + 1) * cols * 3)
  const normal = new Float32Array((rows + 1) * cols * 3)
  const uv = new Float32Array((rows + 1) * cols * 2)
  for (let r = 0; r <= rows; r++) {
    const s = (r / rows) * LENGTH
    const p = at(s)
    const ahead = at(s + 2)
    const behind = at(s - 2)
    const slope = (ahead.z - behind.z) / 4
    // leve inclinação lateral nas curvas: dá vida ao reflexo do sol
    const bank = Math.max(-0.035, Math.min(0.035, p.curve * 0.7))
    const nx0 = -p.ty, ny0 = p.tx
    for (let c = 0; c < cols; c++) {
      const d = columns[c] < 0 ? columns[c] * p.right : columns[c] * p.left
      const k = r * cols + c
      const x = p.x + nx0 * d
      const y = p.y + ny0 * d
      position[k * 3] = x
      position[k * 3 + 1] = p.z + LIFT + d * bank * 0.5
      position[k * 3 + 2] = -y
      const up = 1 / Math.hypot(slope, 1, bank)
      normal[k * 3] = (-p.tx * slope + nx0 * -bank * 0.5) * up
      normal[k * 3 + 1] = up
      normal[k * 3 + 2] = -(-p.ty * slope + ny0 * -bank * 0.5) * up
      uv[k * 2] = s / LENGTH
      uv[k * 2 + 1] = 0.5 + d / (2 * HALF)
    }
  }
  const index = new Uint32Array(rows * (cols - 1) * 6)
  let q = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1
      index[q++] = a; index[q++] = d; index[q++] = b
      index[q++] = b; index[q++] = d; index[q++] = e
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  return geometry
}

// ------------------------------------------------------------------ zebras

/** Trechos de zebra a partir da curvatura: por dentro das curvas e, nas fortes, na saída por fora. */
export function kerbSegments() {
  const found = []
  for (const side of [1, -1]) {
    let start = null
    for (let i = 0; i <= N + 40; i++) {
      const idx = i % N
      // suaviza a leitura para não picotar a zebra
      let c = 0
      for (let j = -2; j <= 2; j++) c += P[(idx + j + N) % N].curve
      c = (c / 5) * side
      const on = c > 0.0052
      if (on && start === null) start = i
      if (!on && start !== null) {
        if ((i - start) * STEP > 14 && start < N) found.push({ side, s0: (start - 2) * STEP, s1: (i + 2) * STEP, outer: false })
        start = null
      }
    }
    // por fora, na saída das curvas fortes
    start = null
    for (let i = 0; i <= N + 40; i++) {
      const idx = i % N
      let c = 0
      for (let j = -2; j <= 2; j++) c += P[(idx + j + N) % N].curve
      c = (c / 5) * side
      const on = c < -0.0115
      if (on && start === null) start = i
      if (!on && start !== null) {
        if ((i - start) * STEP > 12 && start < N) found.push({ side, s0: (i - 2) * STEP - 26, s1: (i + 6) * STEP, outer: true })
        start = null
      }
    }
  }
  return found
}

function buildKerbGeometry() {
  const WIDTH = 2.0
  const STRIPE = 3.2
  const RED = new THREE.Color('#c8201b')
  const WHITE = new THREE.Color('#ecebe6')
  const pos = []
  const col = []
  const nor = []
  const idx = []
  // perfil: borda baixa, crista e queda para o gramado
  const profile = [[0, 0.02], [0.28, 0.1], [0.72, 0.12], [1, 0.0]]
  for (const { side, s0, s1 } of kerbSegments()) {
    const stripes = Math.max(2, Math.round((s1 - s0) / STRIPE))
    const step = (s1 - s0) / stripes
    for (let n = 0; n < stripes; n++) {
      const a = s0 + n * step
      const b = a + step
      const color = n % 2 ? RED : WHITE
      const base = pos.length / 3
      const sub = 2
      for (let k = 0; k <= sub; k++) {
        const s = a + ((b - a) * k) / sub
        const p = at(s)
        const edge = side > 0 ? p.left : p.right
        // termina em bico: a zebra entra e sai do asfalto sem degrau
        const taper = Math.min(1, Math.min(s - s0, s1 - s) / 5)
        for (const [t, height] of profile) {
          const d = side * (edge - 0.05 + t * WIDTH * Math.max(0.25, taper))
          const q = at(s, d)
          pos.push(q.x, p.z + LIFT + 0.02 + height * taper, -q.y)
          col.push(color.r, color.g, color.b)
          // normal com caimento para fora
          const lean = t < 0.3 ? -0.22 : t > 0.7 ? 0.35 : 0
          const nx = -p.ty * side * lean
          const ny = p.tx * side * lean
          const len = Math.hypot(nx, 1, ny)
          nor.push(nx / len, 1 / len, -ny / len)
        }
      }
      for (let k = 0; k < sub; k++) {
        for (let t = 0; t < profile.length - 1; t++) {
          const row = base + k * profile.length + t
          const next = row + profile.length
          if (side > 0) {
            idx.push(row, next, row + 1, row + 1, next, next + 1)
          } else {
            idx.push(row, row + 1, next, row + 1, next + 1, next)
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geometry.setIndex(idx)
  return geometry
}

// ------------------------------------------------------------------ pit lane

function pitNormal(p) {
  // à esquerda do sentido de percurso do pit lane
  return { x: -p.ty, y: p.tx }
}

function paintPitMap() {
  const W = 4096
  const H = 128
  const HALF_W = 9
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })
  const rand = seeded(5150)
  g.setTransform(W / PIT_LENGTH, 0, 0, H / (2 * HALF_W), 0, H / 2)
  g.fillStyle = 'rgb(82,83,84)'
  g.fillRect(0, -HALF_W, PIT_LENGTH, 2 * HALF_W)
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${rand() < 0.6 ? '15,15,16' : '125,125,125'},${0.04 + rand() * 0.13})`
    g.fillRect(rand() * PIT_LENGTH, -HALF_W + rand() * 2 * HALF_W, 4 + rand() * 40, 0.5 + rand() * 3)
  }
  // borracha da via rápida
  g.fillStyle = 'rgba(8,8,9,0.3)'
  g.fillRect(0, -2.8, PIT_LENGTH, 3)
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(6,6,7,${0.08 + rand() * 0.2})`
    g.fillRect(rand() * PIT_LENGTH, -3 + rand() * 3.4, 3 + rand() * 22, 0.14)
  }
  // bordas da via
  g.fillStyle = 'rgba(236,236,230,0.92)'
  const half = (d) => (d > GARAGES.from - 30 && d < GARAGES.to + 30 ? 7.4 : 4.1)
  for (let d = 0; d < PIT_LENGTH; d += 3) {
    const h = half(d)
    g.fillRect(d, h - 0.2, 3.02, 0.2)
    g.fillRect(d, -h, 3.02, 0.2)
  }
  // via de trabalho diante das garagens: linha contínua e os boxes marcados
  g.fillStyle = 'rgba(236,236,230,0.92)'
  g.fillRect(GARAGES.from, 1.2, GARAGES.to - GARAGES.from, 0.18)
  const each = (GARAGES.to - GARAGES.from - 12) / GARAGES.slots
  for (let n = 0; n < GARAGES.slots; n++) {
    const x = GARAGES.from + 6 + n * each
    g.fillStyle = 'rgba(236,236,230,0.85)'
    g.fillRect(x, 1.2, 0.2, 6)
    g.fillStyle = n % 2 ? 'rgba(200,190,120,0.24)' : 'rgba(170,170,170,0.2)'
    g.fillRect(x + 1.4, 2.2, each - 2.8, 3.8)
    g.fillStyle = 'rgba(236,236,230,0.6)'
    g.fillRect(x + each * 0.5 - 2.4, 3.9, 4.8, 0.14)
  }
  // chevrons na entrada e na saída
  g.fillStyle = 'rgba(236,236,230,0.85)'
  for (let k = 0; k < 8; k++) {
    const x = 24 + k * 7
    g.beginPath()
    g.moveTo(x, -3.8)
    g.lineTo(x + 3, 0)
    g.lineTo(x, 3.8)
    g.lineTo(x + 1, 3.8)
    g.lineTo(x + 4, 0)
    g.lineTo(x + 1, -3.8)
    g.closePath()
    g.fill()
  }
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.anisotropy = 16
  return { texture, halfWidth: HALF_W }
}

function buildPitGeometry(halfWidth) {
  const rows = PIT.length * 1
  const cols = 3
  const position = new Float32Array(rows * cols * 3)
  const normal = new Float32Array(rows * cols * 3)
  const uv = new Float32Array(rows * cols * 2)
  for (let r = 0; r < rows; r++) {
    const d = (r / (rows - 1)) * PIT_LENGTH
    const p = pitAt(d)
    const n = pitNormal(p)
    const half = d > GARAGES.from - 30 && d < GARAGES.to + 30 ? 7.6 : 4.3
    const blendIn = Math.min(1, Math.min(Math.abs(d - (GARAGES.from - 30)), Math.abs(d - (GARAGES.to + 30))) / 18)
    const taper = Math.min(1, Math.min(d, PIT_LENGTH - d) / 34)
    const width = (half > 5 ? 4.3 + (7.6 - 4.3) * blendIn : 4.3) * (0.32 + 0.68 * taper)
    for (let c = 0; c < cols; c++) {
      const t = (c / (cols - 1)) * 2 - 1
      const off = t * width
      const k = r * cols + c
      position[k * 3] = p.x + n.x * off
      position[k * 3 + 1] = p.z + LIFT - 0.025
      position[k * 3 + 2] = -(p.y + n.y * off)
      normal[k * 3 + 1] = 1
      uv[k * 2] = d / PIT_LENGTH
      uv[k * 2 + 1] = 0.5 + off / (2 * halfWidth)
    }
  }
  const index = new Uint32Array((rows - 1) * (cols - 1) * 6)
  let q = 0
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1
      index[q++] = a; index[q++] = d; index[q++] = b
      index[q++] = b; index[q++] = d; index[q++] = e
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  return geometry
}

// ------------------------------------------------------------------ material e montagem

const asphaltPatch = (key, map, asphalt, asphaltN, avg, tracks, avgTracks) => ({
  key,
  uniforms: {
    uTrackMap: { value: map },
    uAsphalt: { value: asphalt },
    uAsphaltN: { value: asphaltN },
    uTracks: { value: tracks },
    uAvgAsphalt: { value: avg },
    uAvgTracks: { value: avgTracks },
  },
  vertexHead: 'varying vec2 vTrackUv;',
  vertexBody: 'vTrackUv = uv;',
  fragmentHead: /* glsl */ `
    varying vec2 vTrackUv;
    uniform sampler2D uTrackMap, uAsphalt, uAsphaltN, uTracks;
    uniform vec3 uAvgAsphalt, uAvgTracks;
    float trackRubber;
    float trackPuddle;
  `,
  fragment: [
    ['#include <map_fragment>', /* glsl */ `
      {
        vec3 paint = texture2D(uTrackMap, vTrackUv).rgb;
        float a = dot(texture2D(uAsphalt, vWPos.xz / 2.9).rgb / uAvgAsphalt, vec3(0.33));
        float t = dot(texture2D(uTracks, vWPos.xz / 33.0).rgb / uAvgTracks, vec3(0.33));
        // asfalto fino e marcas largas: a tinta branca sofre menos o efeito
        float luma = dot(paint, vec3(0.33));
        float isPaint = smoothstep(0.32, 0.6, luma);
        float detail = mix(mix(1.0, a, 0.75) * mix(1.0, t, 0.5), mix(1.0, a, 0.25), isPaint);
        // molhado, o asfalto escurece e a água junta nas partes baixas
        diffuseColor.rgb = paint * detail * mix(1.0, 0.58, uWet);
        trackRubber = 1.0 - smoothstep(0.03, 0.08, luma);
        trackPuddle = smoothstep(0.86, 1.1, t) * uWet;
      }
    `],
    ['#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(0.86, 0.66, trackRubber), mix(0.3, 0.08, trackPuddle), uWet);'],
    ['#include <normal_fragment_maps>', /* glsl */ `
      {
        vec2 nn = (texture2D(uAsphaltN, vWPos.xz / 2.9).xy * 2.0 - 1.0) * 0.5;
        vec3 tx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
        vec3 tz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
        normal = normalize(normal + tx * nn.x + tz * nn.y);
      }
    `],
  ],
})

export async function createTrack(renderer, envMap) {
  const [asphalt, asphaltN, tracks] = await Promise.all([
    loadTiled('asphalt_track_diff_1k'),
    loadTiled('asphalt_track_nor_gl_1k', { srgb: false }),
    loadTiled('aerial_asphalt_01_diff_1k'),
  ])
  const group = new THREE.Group()

  const trackMap = paintTrackMap(renderer)
  const trackMesh = new THREE.Mesh(
    buildTrackGeometry(),
    atmospheric(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMap, envMapIntensity: 0.25 }), asphaltPatch('track', trackMap, asphalt, asphaltN, asphalt.average, tracks, tracks.average)),
  )
  trackMesh.receiveShadow = true
  trackMesh.frustumCulled = false
  group.add(trackMesh)

  const { texture: pitMap, halfWidth } = paintPitMap()
  const pitMesh = new THREE.Mesh(
    buildPitGeometry(halfWidth),
    atmospheric(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMap, envMapIntensity: 0.25 }), asphaltPatch('pit', pitMap, asphalt, asphaltN, asphalt.average, tracks, tracks.average)),
  )
  pitMesh.receiveShadow = true
  pitMesh.frustumCulled = false
  group.add(pitMesh)

  const kerbs = new THREE.Mesh(
    buildKerbGeometry(),
    atmospheric(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }), { key: 'kerb' }),
  )
  kerbs.receiveShadow = true
  kerbs.frustumCulled = false
  group.add(kerbs)

  group.setWet = (wet) => {
    trackMesh.material.envMapIntensity = pitMesh.material.envMapIntensity = 0.25 + wet * 0.5
  }
  return group
}

/** Faixa amarela de bandeira numa extensão da pista: reconstruída só quando muda. */
export function flagStripGeometry(segments) {
  const pos = []
  const idx = []
  for (const { s } of segments) {
    for (const side of [1, -1]) {
      const base = pos.length / 3
      const count = 40
      for (let i = 0; i <= count; i++) {
        const q = s - 50 + (100 * i) / count
        const p = at(q)
        const edge = side > 0 ? p.left : p.right
        const a = at(q, side * (edge + 0.1))
        const b = at(q, side * (edge + 0.65))
        pos.push(a.x, p.z + LIFT + 0.16, -a.y, b.x, p.z + LIFT + 0.16, -b.y)
      }
      for (let i = 0; i < count; i++) {
        const k = base + i * 2
        if (side > 0) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
        else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setIndex(idx)
  return geometry
}
