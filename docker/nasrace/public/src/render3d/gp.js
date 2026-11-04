// Fim de semana de GP: prédio dos boxes, arquibancadas com público, barreiras, alambrados, pórticos,
// torres de TV, telões, tendas e bandeiras. Quase tudo entra numa malha só, com a sombra cozida.

import { at, N, P, STEP } from '../circuit.js'
import { TEAMS } from '../race.js'
import { BARRIER, GANTRIES, PIT_WALL, SCREENS, STANDS, TV_TOWERS } from '../venue.js'
import { BRAND, boardSeed, FONT } from './brands.js'
import { addPaddock } from './paddock.js'
import { createCrowd } from './people.js'
import { addPitBuilding } from './pitlane.js'
import { addStand } from './stands.js'
import { seeded, shared, THREE } from './common.js'
import { FINISH, rgb } from './kit.js'

const W = (x, y, h) => [x, h, -y]

const CONCRETE = rgb('#a8a59c')
const STEEL = rgb('#6d7176')
const WHITE = rgb('#e4e4de')

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

/** Postos das equipes sobre a mureta dos boxes: cobertura, telas, a cor de cada uma e os engenheiros. */
function addPitWallStands(kit, people, rand, simple) {
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
    if (simple) return
    // quem acompanha a corrida dali olha para a pista
    const number = i + 1
    for (let k = 0; k < 4; k++) {
      const along = (k - 1.5) * SPAN * 0.2
      const side = -0.95
      const x = q.x + q.tx * along - q.ty * side, my = q.y + q.ty * along + q.tx * side
      people.ground.push({ x, y: q.z + 0.1, z: -my, yaw: Math.atan2(-q.tx, q.ty) + (rand() - 0.5) * 0.5, uniform: number, size: 0.96 })
    }
  })
}

// ------------------------------------------------------------------ tudo o que entra na malha única

export function addGrandPrix(kit, field, { geo, paddock, simple = false }) {
  // `kit` é a malha do GP: a cidade fica em outra, com um shader mais simples.
  const rand = seeded(2026)
  const people = createCrowd(field, geo)
  const fence = createFenceBuilder()
  const pit = addPitBuilding(kit, field, { geoPaddock: paddock, people, rand, simple })
  const flags = addFlagPoles(kit, pit)
  for (const stand of STANDS) addStand(kit, field, stand, rand, people, { simple })
  addBarriers(kit, field, fence)
  const gantries = GANTRIES.map((g) => addGantry(kit, field, g))
  for (const t of TV_TOWERS) addTvTower(kit, field, t, rand)
  addPaddock(kit, field, people, rand, { simple })
  addPitWallStands(kit, people, rand, simple)
  addGridMarks(kit)
  return { fence: fence.mesh(), pit, gantries, flags: [...flags, ...people.flags], people }
}

/** Mastros de bandeira sobre a cobertura dos boxes e na frente da arquibancada principal. */
function addFlagPoles(kit, pit) {
  const colors = [...Object.values(TEAMS).map((t) => t.color), '#ffffff', '#e10600']
  const points = []
  const pole = (x, y, ground, height) => {
    kit.bar(W(x, y, ground), W(x, y, ground + height), 0.06, WHITE, { finish: FINISH.PLAIN })
    points.push({ x, y: ground + height - 1.1, z: y, size: 1.1, color: colors[points.length % colors.length] })
  }
  const { a, along, across, base } = pit
  for (let t = 18; t < 277; t += 46) {
    pole(a[0] + along[0] * t + across[0] * 1.2, a[1] + along[1] * t + across[1] * 1.2, base + 9.6, 5)
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
  c.width = 4096
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
    const { frame } = pit
    const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS
    const v1 = 1 - Math.floor(i / COLS) / ROWS, v0 = v1 - 1 / ROWS
    const panel = (x0, x1, y0, y1, z, a0 = u0, a1 = u1) => {
      const A = frame.at(x0, y0, z), B = frame.at(x1, y0, z), C = frame.at(x1, y1, z), D = frame.at(x0, y1, z)
      pos.push(...A, ...B, ...C, ...A, ...C, ...D)
      uv.push(a0, v0, a1, v0, a1, v1, a0, v0, a1, v1, a0, v1)
    }
    // na frente da sacada, para quem olha o pit lane
    panel(slot.x0, slot.x1, 4.8, 5.44, 0.97)
    // e no fundo da garagem: uma parede inteira com a cor da equipe, sem letras
    panel(slot.x0 + 0.05, slot.x1 - 0.05, slot.floor + 0.05, 4.65, -11.95, u0 + 0.004 / COLS, u0 + 0.05 / COLS)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0.86, 0.86, 0.86) }))
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
        g.font = `700 ${Math.round(h * 0.8)}px ${FONT}`
        // o painel é bem mais largo que a célula do desenho: sem isto, as letras sairiam esticadas
        for (const k of [0.2, 0.5, 0.8]) {
          g.save()
          g.translate(col * w + w * k, row * h + h / 2 + 3)
          g.scale(0.42, 1)
          g.fillText(car.code, 0, 0)
          g.restore()
        }
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
        vShade = 0.62 + 0.3 * cos(p.x * 7.0 - uTime * 5.5 + phase);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: 'varying vec3 vColor; varying float vShade; void main() { gl_FragColor = vec4(vColor * vShade * 1.15, 1.0); }',
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
