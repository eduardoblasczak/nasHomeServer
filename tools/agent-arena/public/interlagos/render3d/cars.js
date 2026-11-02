// Carros instanciados: uma chamada de desenho para os 21, uma para as sombras e uma para os rastros.
// De longe, o carro é aumentado para continuar legível; de perto, volta ao tamanho real.

import { at } from '../circuit.js'
import { packetRate } from '../race.js'
import { THREE } from './common.js'

const CAPACITY = 40

/** Monta um F1 simplificado com prismas. Frente em +X, 1 unidade = 1 metro (5,6 m de comprimento). */
function buildCarGeometry() {
  const pos = []
  const col = []
  const PAINT = [1, 1, 1]
  const DARK = [0.012, 0.012, 0.014]
  const CARBON = [0.035, 0.035, 0.04]

  const tri = (a, b, c, color) => {
    pos.push(...a, ...b, ...c)
    col.push(...color, ...color, ...color)
  }
  const quad = (a, b, c, d, color) => {
    tri(a, b, c, color)
    tri(a, c, d, color)
  }
  /** Prisma de seção variável. rings: [x, meia-largura, y-base, y-topo]. */
  const hull = (rings, color) => {
    for (let i = 0; i < rings.length - 1; i++) {
      const [x0, w0, b0, t0] = rings[i]
      const [x1, w1, b1, t1] = rings[i + 1]
      // topo, com a parte de cima mais estreita que a base: o corpo fica arredondado
      const tw0 = w0 * 0.7, tw1 = w1 * 0.7
      quad([x0, t0, -tw0], [x0, t0, tw0], [x1, t1, tw1], [x1, t1, -tw1], color)
      quad([x0, b0 + (t0 - b0) * 0.45, w0], [x1, b1 + (t1 - b1) * 0.45, w1], [x1, t1, tw1], [x0, t0, tw0], color)
      quad([x1, b1 + (t1 - b1) * 0.45, -w1], [x0, b0 + (t0 - b0) * 0.45, -w0], [x0, t0, -tw0], [x1, t1, -tw1], color)
    }
  }
  const box = (x0, x1, y0, y1, z0, z1, color) => {
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color) // topo
    quad([x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0], color) // base
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color)
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color)
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color)
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color)
  }

  // assoalho
  box(-1.75, 1.15, 0.05, 0.14, -0.72, 0.72, CARBON)
  // bico e célula de sobrevivência
  hull([[-0.1, 0.42, 0.14, 0.72], [0.65, 0.34, 0.14, 0.58], [1.55, 0.16, 0.16, 0.36], [2.55, 0.1, 0.13, 0.2]], PAINT)
  // tampa do motor e barbatana
  hull([[-2.3, 0.14, 0.2, 0.62], [-1.3, 0.36, 0.14, 0.82], [-0.45, 0.42, 0.14, 0.98], [-0.1, 0.42, 0.14, 0.72]], PAINT)
  // pontões laterais
  hull([[-1.65, 0.62, 0.12, 0.34], [-0.9, 0.78, 0.12, 0.56], [0.15, 0.78, 0.12, 0.62], [0.45, 0.62, 0.12, 0.5]], PAINT)
  // cockpit e halo
  box(0.02, 0.62, 0.72, 0.74, -0.22, 0.22, DARK)
  box(-0.12, 0.72, 0.78, 0.84, -0.03, 0.03, DARK)
  box(0.32, 0.72, 0.8, 0.84, -0.24, 0.24, DARK)
  box(-0.12, 0.18, 0.74, 0.92, -0.2, 0.2, CARBON)
  // asa dianteira
  box(2.3, 2.75, 0.07, 0.12, -0.95, 0.95, PAINT)
  box(2.15, 2.55, 0.12, 0.17, -0.95, 0.95, CARBON)
  box(2.3, 2.8, 0.07, 0.26, -0.98, -0.93, PAINT)
  box(2.3, 2.8, 0.07, 0.26, 0.93, 0.98, PAINT)
  // asa traseira
  box(-2.45, -2.05, 0.82, 0.92, -0.52, 0.52, PAINT)
  box(-2.5, -2.28, 0.95, 1.0, -0.52, 0.52, CARBON)
  box(-2.5, -2.02, 0.32, 1.0, -0.54, -0.5, PAINT)
  box(-2.5, -2.02, 0.32, 1.0, 0.5, 0.54, PAINT)
  // pneus: pretos, com a faixa lateral sugerida na tampa
  const wheel = (cx, cz, r, w) => {
    const seg = 10
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2
      const A = [cx + Math.cos(a) * r, r + Math.sin(a) * r, cz - w], B = [cx + Math.cos(b) * r, r + Math.sin(b) * r, cz - w]
      const C = [cx + Math.cos(b) * r, r + Math.sin(b) * r, cz + w], D = [cx + Math.cos(a) * r, r + Math.sin(a) * r, cz + w]
      quad(B, A, D, C, DARK)
      tri([cx, r, cz + w], D, C, DARK)
      tri([cx, r, cz - w], B, A, DARK)
    }
  }
  wheel(1.62, -0.78, 0.36, 0.17)
  wheel(1.62, 0.78, 0.36, 0.17)
  wheel(-1.52, -0.8, 0.37, 0.23)
  wheel(-1.52, 0.8, 0.37, 0.23)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function createCars(envMap) {
  const group = new THREE.Group()

  const body = new THREE.InstancedMesh(
    buildCarGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.18, envMap, envMapIntensity: 1.1, side: THREE.DoubleSide }),
    CAPACITY,
  )
  body.frustumCulled = false
  body.count = 0
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(body)
  body.setColorAt(0, new THREE.Color('#fff'))
  body.instanceColor.setUsage(THREE.DynamicDrawUsage)

  // sombra macia no chão: custa quase nada e pousa o carro no asfalto
  const shadowTexture = (() => {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 32, 8, 64, 32, 62)
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.75)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.save()
    g.scale(1, 0.5)
    g.translate(0, 32)
    g.fillStyle = grad
    g.fillRect(0, -32, 128, 128)
    g.restore()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.NoColorSpace
    return t
  })()
  const shadowGeometry = new THREE.PlaneGeometry(1, 1)
  shadowGeometry.rotateX(-Math.PI / 2)
  const shadows = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ map: shadowTexture, color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false, alphaMap: null }),
    CAPACITY,
  )
  shadows.frustumCulled = false
  shadows.count = 0
  shadows.renderOrder = 1
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(shadows)

  // rastro de rede: faixa fina atrás do carro
  const TRAIL_SEGMENTS = 7
  const trailPositions = new Float32Array(CAPACITY * (TRAIL_SEGMENTS + 1) * 2 * 3)
  const trailColors = new Float32Array(CAPACITY * (TRAIL_SEGMENTS + 1) * 2 * 4)
  const trailIndex = []
  for (let n = 0; n < CAPACITY; n++) {
    const base = n * (TRAIL_SEGMENTS + 1) * 2
    for (let k = 0; k < TRAIL_SEGMENTS; k++) {
      const a = base + k * 2
      trailIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const trailGeometry = new THREE.BufferGeometry()
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage))
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 4).setUsage(THREE.DynamicDrawUsage))
  trailGeometry.setIndex(trailIndex)
  const trails = new THREE.Mesh(
    trailGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  )
  trails.frustumCulled = false
  trails.renderOrder = 2
  group.add(trails)

  // equipe de box
  const crewGeometry = new THREE.CapsuleGeometry(0.28, 0.9, 2, 6)
  const crew = new THREE.InstancedMesh(crewGeometry, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 72)
  crew.frustumCulled = false
  crew.count = 0
  crew.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  crew.setColorAt(0, new THREE.Color('#fff'))
  group.add(crew)

  // fumaça da batida
  const smokeTexture = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31)
    grad.addColorStop(0, 'rgba(255,255,255,0.75)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.32)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const smokeMaterial = new THREE.SpriteMaterial({ map: smokeTexture, color: 0xd9dcdf, transparent: true, depthWrite: false, opacity: 0.8 })
  const smokePool = []
  for (let i = 0; i < 48; i++) {
    const s = new THREE.Sprite(smokeMaterial.clone())
    s.visible = false
    s.renderOrder = 3
    group.add(s)
    smokePool.push(s)
  }

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YZX')
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  const color = new THREE.Color()
  const GRAY = new THREE.Color('#7c8289')
  const sunShift = new THREE.Vector3()

  return {
    group,
    update(cars, { scale, sunDir, time, reduced, hovered, heightAt }) {
      let n = 0
      let trailCount = 0
      let crewCount = 0
      let smokeCount = 0
      trailColors.fill(0)
      // deslocamento da sombra, na direção oposta ao sol
      sunShift.set(-sunDir.x, 0, -sunDir.z).multiplyScalar(0.55 / Math.max(0.2, sunDir.y))
      // De perto o rastro fica discreto: serve à leitura de longe, não ao close.
      const trailAlpha = 0.28 + 0.34 * Math.min(1, (scale - 1) / 1.6)
      for (const car of cars.values()) {
        // Fora da pista (batida), o chão manda na altura: ela pode estar abaixo do terreno.
        const groundY = car.state === 'out' ? Math.max(car.z, heightAt(car.x, car.y)) : car.z
        const X = car.x, Y = groundY + 0.08, Z = -car.y
        euler.set(0, car.heading, Math.atan(car.slope ?? 0))
        q.setFromEuler(euler)
        p.set(X, Y, Z)
        const hoverBoost = hovered === car ? 1.25 : 1
        s.setScalar(scale * hoverBoost)
        m.compose(p, q, s)
        body.setMatrixAt(n, m)
        const noData = car.data.cpu == null && car.state !== 'out'
        color.copy(noData ? GRAY : (car.colorObj ??= new THREE.Color(car.team.color)))
        body.setColorAt(n, color)

        // sombra
        euler.set(0, car.heading, 0)
        q.setFromEuler(euler)
        p.set(X + sunShift.x * scale, groundY + 0.1, Z + sunShift.z * scale)
        s.set(6.4 * scale, 1, 2.5 * scale)
        m.compose(p, q, s)
        shadows.setMatrixAt(n, m)

        // rastro
        if (car.state === 'run' || car.state === 'toBox') {
          const rate = packetRate((car.data.rxBps ?? 0) + (car.data.txBps ?? 0))
          if (rate >= 0.2) {
            const length = (10 + rate * 13) * Math.max(1, scale * 0.8)
            const halfW = 0.3 * scale
            const base = trailCount * (TRAIL_SEGMENTS + 1) * 2
            const c = car.colorObj ?? color
            for (let k = 0; k <= TRAIL_SEGMENTS; k++) {
              const t = k / TRAIL_SEGMENTS
              const q0 = at(car.s - 2.6 * scale - length * t)
              const dx = car.x - at(car.s).x, dy = car.y - at(car.s).y
              const qx = q0.x + dx, qy = q0.y + dy
              const nx = -q0.ty, ny = q0.tx
              const i = base + k * 2
              trailPositions[i * 3] = qx + nx * halfW
              trailPositions[i * 3 + 1] = q0.z + 0.16
              trailPositions[i * 3 + 2] = -(qy + ny * halfW)
              trailPositions[(i + 1) * 3] = qx - nx * halfW
              trailPositions[(i + 1) * 3 + 1] = q0.z + 0.16
              trailPositions[(i + 1) * 3 + 2] = -(qy - ny * halfW)
              const a = trailAlpha * (1 - t) * (1 - t)
              for (const j of [i, i + 1]) {
                trailColors[j * 4] = c.r
                trailColors[j * 4 + 1] = c.g
                trailColors[j * 4 + 2] = c.b
                trailColors[j * 4 + 3] = a
              }
            }
            trailCount++
          }
        }

        // equipe parada ao redor do carro
        if (car.state === 'inPit' && car.speed === 0 && crewCount + 6 <= 72) {
          const offs = [[1.9, 1.5], [-1.7, 1.55], [1.9, -1.5], [-1.7, -1.55], [3.1, 0], [-3, 0]]
          const ch = Math.cos(car.heading), sh = Math.sin(car.heading)
          for (const [fx, fy] of offs) {
            p.set(X + (fx * ch + fy * sh) * scale, Y + 0.75 * scale, Z + (-fx * sh + fy * ch) * scale)
            q.identity()
            s.setScalar(scale)
            m.compose(p, q, s)
            crew.setMatrixAt(crewCount, m)
            crew.setColorAt(crewCount, car.colorObj ?? color)
            crewCount++
          }
        }

        // fumaça: parada se o sistema pede menos animação
        if (car.state === 'out') {
          for (let k = 0; k < 8 && smokeCount < smokePool.length; k++) {
            const phase = reduced ? (k + 0.5) / 8 : (time * 0.25 + k / 8) % 1
            const sp = smokePool[smokeCount++]
            sp.visible = true
            sp.position.set(X + phase * 3 * scale + Math.sin(k * 2.3) * scale * 0.4, Y + (0.6 + phase * 7) * scale, Z - phase * 2 * scale)
            const r = (1.6 + phase * 6) * scale
            sp.scale.set(r, r, 1)
            sp.material.opacity = 0.55 * (1 - phase)
          }
        }
        n++
      }
      body.count = n
      shadows.count = n
      body.instanceMatrix.needsUpdate = true
      body.instanceColor.needsUpdate = true
      shadows.instanceMatrix.needsUpdate = true
      trailGeometry.setDrawRange(0, trailCount * TRAIL_SEGMENTS * 6)
      if (trailCount) {
        trailGeometry.attributes.position.needsUpdate = true
        trailGeometry.attributes.color.needsUpdate = true
      }
      crew.count = crewCount
      if (crewCount) {
        crew.instanceMatrix.needsUpdate = true
        crew.instanceColor.needsUpdate = true
      }
      for (let i = smokeCount; i < smokePool.length; i++) smokePool[i].visible = false
    },
  }
}
