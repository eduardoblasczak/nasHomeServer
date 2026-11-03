// Carros em poucas chamadas de desenho: carrocerias, rodas, sombras, rastros, equipe de box,
// destroços e fumaça, cada um instanciado. De longe, o carro é aumentado para continuar legível; de
// perto, volta ao tamanho real.

import { at } from '../circuit.js'
import { packetRate } from '../race.js'
import { FONT } from './brands.js'
import { buildCarBody, buildCrew, buildShard, buildWheel } from './carmodel.js'
import { atmospheric, seeded, THREE } from './common.js'

const CAPACITY = 40
const DECAL_ROWS = 32

// Segunda cor e desenho da pintura de cada equipe. Só estética: nenhum dado sai daqui.
const LIVERY = {
  Draft: { second: '#f3f3f0', style: 0 },
  Nextcloud: { second: '#f2f5f8', style: 2 },
  nasFinance: { second: '#0b1f17', style: 1 },
  Portfólio: { second: '#15171a', style: 2 },
  'Vô Alberto': { second: '#e8dcc2', style: 0 },
  Monitoramento: { second: '#16233f', style: 1 },
  Infraestrutura: { second: '#d3121a', style: 2 },
}

// Eixos do modelo: posição x, posição z e largura relativa da roda.
const AXLES = [
  { x: 1.72, z: 0.79, width: 0.84, front: true },
  { x: 1.72, z: -0.79, width: 0.84, front: true },
  { x: -1.68, z: 0.74, width: 1.1, front: false },
  { x: -1.68, z: -0.74, width: 1.1, front: false },
]
const WHEEL_RADIUS = 0.36

const BODY_HEAD = /* glsl */ `
varying vec3 vModel;
varying vec3 vModelN;
varying vec4 vPaint;
varying vec3 vSecond;
varying vec4 vCar;
uniform sampler2D uDecals;
float carRough;
vec3 carGlow;
float decalAt(vec2 uv, float row, float cellU, float widthU) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec2 q = vec2(cellU + uv.x * widthU, 1.0 - (row + 1.0 - uv.y) / ${DECAL_ROWS}.0);
  return texture2D(uDecals, q).r;
}
`

const BODY_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 team = diffuseColor.rgb;
  vec3 p = vModel;
  float style = vCar.y;
  // desenho da pintura, em coordenadas do carro
  float accent = 0.0;
  if (style < 0.5) {
    accent = smoothstep(0.075, 0.06, abs(p.z)) * step(0.0, vModelN.y + 0.2);
    accent = max(accent, smoothstep(-1.15, -1.3, p.x) * 0.92);
  } else if (style < 1.5) {
    accent = smoothstep(-0.25, -0.75, p.x + abs(p.z) * 0.9);
  } else {
    float w = p.x * 0.72 + abs(p.z) * 0.9;
    accent = smoothstep(0.02, -0.02, abs(w - 0.08) - 0.2);
  }
  vec3 primary = mix(team, vSecond, accent * vPaint.r);
  vec3 c = primary * vPaint.r + vSecond * vPaint.g + vec3(vPaint.b);
  carRough = vPaint.a;
  carGlow = vec3(0.0);

  if (vPaint.r > 0.5) {
    // abertura do cockpit e tomada de ar: escuros, recortados na própria carroceria
    float cockpit = length(vec2((p.x - 0.2) / 0.47, p.z / 0.255));
    float open = smoothstep(1.02, 0.96, cockpit) * step(0.55, p.y);
    c = mix(c, vec3(0.006), open);
    carRough = mix(carRough, 0.8, open);
    float inlet = smoothstep(0.1, 0.085, length(vec2(p.z, (p.y - 0.895) * 1.1))) * step(0.3, vModelN.x);
    c = mix(c, vec3(0.004), inlet);
    // decalques: as letras do serviço e o número
    float luma = dot(team, vec3(0.2126, 0.7152, 0.0722));
    vec3 ink = luma > 0.42 ? vec3(0.012) : vec3(0.9);
    float mark = 0.0;
    // em cima dos pontões, lendo de trás para a frente
    if (vModelN.y > 0.45 && abs(p.z) > 0.36) {
      float z0 = sign(p.z) * 0.56;
      mark = decalAt(vec2((p.x + 1.02) / 0.82, (z0 + 0.19 - p.z) / 0.38), vCar.x, 0.0, 0.5);
    }
    // nos dois lados da barbatana
    if (abs(p.z) < 0.02 && p.y > 0.58 && p.x < -0.9) {
      float u = (p.x + 1.62) / 0.62;
      if (vModelN.z < 0.0) u = 1.0 - u;
      mark = max(mark, decalAt(vec2(u, (p.y - 0.58) / 0.3), vCar.x, 0.5, 0.25));
    }
    // número no bico
    if (p.x > 1.1 && p.x < 1.75 && abs(p.z) < 0.16 && vModelN.y > 0.5) {
      mark = max(mark, decalAt(vec2((p.x - 1.2) / 0.42, (0.13 - p.z) / 0.26), vCar.x, 0.5, 0.25));
    }
    // placas laterais da asa traseira
    if (abs(p.z) > 0.49 && p.x < -2.1 && p.y > 0.52) {
      float u = (p.x + 2.7) / 0.54;
      if (p.z < 0.0) u = 1.0 - u;
      mark = max(mark, decalAt(vec2(u, (p.y - 0.58) / 0.34), vCar.x, 0.0, 0.5));
    }
    c = mix(c, ink, mark);
  }
  // asa traseira, vista de cima: o código bem grande para quem olha do alto
  if (vPaint.g > 0.5 && p.x < -2.0 && p.y > 0.82 && abs(p.z) < 0.48 && vModelN.y > 0.3) {
    float luma = dot(vSecond, vec3(0.2126, 0.7152, 0.0722));
    vec3 ink = luma > 0.42 ? vec3(0.012) : vec3(0.92);
    c = mix(c, ink, decalAt(vec2((p.z + 0.44) / 0.88, (p.x + 2.5) / 0.3), vCar.x, 0.0, 0.5));
  }
  // luz de chuva
  if (p.x < -2.59 && abs(p.z) < 0.05 && p.y < 0.46 && p.y > 0.38) {
    c = vec3(0.3, 0.02, 0.01);
    carGlow = vec3(9.0, 0.5, 0.25) * vCar.w;
  }
  diffuseColor.rgb = c;
}
`

function createDecals() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64 * DECAL_ROWS
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.fillRect(0, 0, c.width, c.height)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  const seen = new Set()
  return {
    texture,
    /** Desenha o código e o número de um carro na linha dele, uma vez só. */
    add(car) {
      if (seen.has(car.slot)) return
      seen.add(car.slot)
      const y = car.slot * 64
      g.fillStyle = '#000'
      g.fillRect(0, y, 256, 64)
      g.fillStyle = '#fff'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `700 60px ${FONT}`
      g.fillText(car.code, 64, y + 34, 122)
      g.fillText(String(car.slot + 1), 160, y + 34, 60)
      texture.needsUpdate = true
    },
  }
}

/** Silhueta do carro vista de cima, para a sombra no chão acompanhar a forma de verdade. */
function bakeShadow(renderer, bodyGeometry, wheelGeometry) {
  const target = new THREE.WebGLRenderTarget(256, 128, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  })
  const scene = new THREE.Scene()
  const black = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  scene.add(new THREE.Mesh(bodyGeometry, black))
  for (const a of AXLES) {
    const wheel = new THREE.Mesh(wheelGeometry, black)
    wheel.position.set(a.x, WHEEL_RADIUS, a.z)
    wheel.scale.z = a.width
    scene.add(wheel)
  }
  // De cima, com a frente do carro para a direita da textura.
  const camera = new THREE.OrthographicCamera(-3.2, 3.2, 1.6, -1.6, 0.1, 10)
  camera.position.set(0, 5, 0)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)
  const previous = renderer.getRenderTarget()
  const clear = new THREE.Color()
  renderer.getClearColor(clear)
  const alpha = renderer.getClearAlpha()
  renderer.setClearColor(0x000000, 1)
  renderer.setRenderTarget(target)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(previous)
  renderer.setClearColor(clear, alpha)
  black.dispose()
  return target.texture
}

/** Tufo de fumaça: muitas manchas suaves, para não aparecer um círculo perfeito. */
function smokeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const rand = seeded(9001)
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 70; i++) {
    const a = rand() * 6.28, d = rand() * rand() * 30
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d
    const r = 12 + rand() * 20
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(255,255,255,0.05)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.022)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

const smooth = (t) => {
  const k = Math.max(0, Math.min(1, t))
  return k * k * (3 - 2 * k)
}

export function createCars(renderer, envMap) {
  const group = new THREE.Group()
  const decals = createDecals()

  // ---------------------------------------------------------------- carroceria
  const bodyGeometry = buildCarBody()
  const secondAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const carAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage)
  bodyGeometry.setAttribute('aSecond', secondAttr)
  bodyGeometry.setAttribute('aCar', carAttr)
  const body = new THREE.InstancedMesh(
    bodyGeometry,
    atmospheric(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.12, envMap, envMapIntensity: 1.35, side: THREE.DoubleSide }), {
      key: 'car',
      uniforms: { uDecals: { value: decals.texture } },
      vertexHead: 'attribute vec4 aPaint; attribute vec3 aSecond; attribute vec4 aCar; varying vec3 vModel; varying vec3 vModelN; varying vec4 vPaint; varying vec3 vSecond; varying vec4 vCar;',
      vertexBody: 'vModel = position; vModelN = normal; vPaint = aPaint; vSecond = aSecond; vCar = aCar;',
      fragmentHead: BODY_HEAD,
      fragment: [
        ['#include <color_fragment>', BODY_COLOR],
        ['#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.08, carRough - 0.1 * uWet);'],
        ['#include <emissivemap_fragment>', 'totalEmissiveRadiance += carGlow;'],
      ],
    }),
    CAPACITY,
  )
  body.frustumCulled = false
  body.count = 0
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  body.setColorAt(0, new THREE.Color('#fff'))
  body.instanceColor.setUsage(THREE.DynamicDrawUsage)
  body.renderOrder = -1
  group.add(body)

  // ---------------------------------------------------------------- rodas
  const wheelGeometry = buildWheel()
  const brakeAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 1).setUsage(THREE.DynamicDrawUsage)
  wheelGeometry.setAttribute('aBrake', brakeAttr)
  const wheels = new THREE.InstancedMesh(
    wheelGeometry,
    atmospheric(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.1, envMap, envMapIntensity: 0.8 }), {
      key: 'wheel',
      vertexHead: 'attribute float aBrake; varying float vBrake; varying vec3 vWheel;',
      vertexBody: 'vBrake = aBrake; vWheel = position;',
      fragmentHead: 'varying float vBrake; varying vec3 vWheel;',
      fragment: [
        ['#include <emissivemap_fragment>', /* glsl */ `
          {
            // disco de freio em brasa, atrás dos raios, quando o carro freia forte
            float r = length(vWheel.xy);
            float disc = smoothstep(0.09, 0.12, r) * smoothstep(0.21, 0.18, r);
            totalEmissiveRadiance += vec3(5.0, 1.2, 0.15) * disc * vBrake;
          }
        `],
      ],
    }),
    CAPACITY * 4,
  )
  wheels.frustumCulled = false
  wheels.count = 0
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  wheels.setColorAt(0, new THREE.Color('#fff'))
  wheels.instanceColor.setUsage(THREE.DynamicDrawUsage)
  wheels.renderOrder = -1
  group.add(wheels)

  // ---------------------------------------------------------------- sombra no chão
  const shadowMap = bakeShadow(renderer, bodyGeometry, wheelGeometry)
  const shadowGeometry = new THREE.PlaneGeometry(6.4, 3.2)
  shadowGeometry.rotateX(-Math.PI / 2)
  const shadows = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: shadowMap } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D uMap;
        void main() {
          // duas leituras: o miolo definido e a borda difusa
          float a = texture2D(uMap, vUv, 1.0).r * 0.6 + texture2D(uMap, vUv, 3.0).r * 0.4;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.74);
        }
      `,
    }),
    CAPACITY,
  )
  shadows.frustumCulled = false
  shadows.count = 0
  shadows.renderOrder = 1
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(shadows)

  // ---------------------------------------------------------------- rastro de rede
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

  // ---------------------------------------------------------------- equipe de box
  const CREW_MAX = 96
  const crewGeometry = buildCrew()
  const crew = new THREE.InstancedMesh(
    crewGeometry,
    atmospheric(new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), {
      key: 'crew',
      vertexHead: 'attribute vec4 aPaint; varying vec4 vPaint;',
      vertexBody: 'vPaint = aPaint;',
      fragmentHead: 'varying vec4 vPaint;',
      fragment: [['#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = diffuseColor.rgb * vPaint.r + vec3(vPaint.b);']],
    }),
    CREW_MAX,
  )
  crew.frustumCulled = false
  crew.count = 0
  crew.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  crew.setColorAt(0, new THREE.Color('#fff'))
  crew.instanceColor.setUsage(THREE.DynamicDrawUsage)
  group.add(crew)

  // ---------------------------------------------------------------- destroços
  const SHARD_MAX = 120
  const shards = new THREE.InstancedMesh(buildShard(), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1, envMap, envMapIntensity: 0.6 }), SHARD_MAX)
  shards.frustumCulled = false
  shards.count = 0
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  shards.setColorAt(0, new THREE.Color('#fff'))
  shards.instanceColor.setUsage(THREE.DynamicDrawUsage)
  group.add(shards)

  // ---------------------------------------------------------------- fumaça e spray de chuva
  const PUFF_MAX = 320
  const puffGeometry = new THREE.PlaneGeometry(1, 1)
  const puffAttr = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_MAX * 2), 2).setUsage(THREE.DynamicDrawUsage)
  puffGeometry.setAttribute('aPuff', puffAttr)
  const puffs = new THREE.InstancedMesh(
    puffGeometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: smokeTexture() } },
      vertexShader: /* glsl */ `
        attribute vec2 aPuff; // opacidade, brilho
        varying vec2 vUv;
        varying vec2 vPuff;
        void main() {
          vUv = uv;
          vPuff = aPuff;
          // sempre de frente para a câmera
          vec4 center = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
          float size = length(instanceMatrix[0].xyz);
          center.xy += position.xy * size;
          gl_Position = projectionMatrix * center;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec2 vPuff;
        uniform sampler2D uMap;
        void main() {
          float a = texture2D(uMap, vUv).r * vPuff.x;
          gl_FragColor = vec4(vec3(vPuff.y), a);
        }
      `,
    }),
    PUFF_MAX,
  )
  puffs.frustumCulled = false
  puffs.count = 0
  puffs.renderOrder = 3
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(puffs)

  // ---------------------------------------------------------------- por quadro
  const m = new THREE.Matrix4()
  const carMatrix = new THREE.Matrix4()
  const wheelLocal = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const q2 = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YZX')
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  const color = new THREE.Color()
  const GRAY = new THREE.Color('#7c8289')
  const DARK = new THREE.Color('#15171a')
  const sunShift = new THREE.Vector3()
  const AXIS_Z = new THREE.Vector3(0, 0, 1)
  const AXIS_Y = new THREE.Vector3(0, 1, 0)
  const liveries = new Map()
  const motion = new Map() // estado só de desenho: rotação das rodas, frenagem, equipe, destroços
  const random = seeded(4711)

  const stateOf = (car) => {
    let st = motion.get(car)
    if (!st) {
      st = { spin: 0, lastSpeed: 0, accel: 0, lateral: 0, crew: 0, debris: null, sprayAt: 0 }
      motion.set(car, st)
    }
    return st
  }

  const liveryOf = (car) => {
    let l = liveries.get(car.team.name)
    if (!l) {
      const def = LIVERY[car.team.name] ?? { second: '#15171a', style: 1 }
      l = { second: new THREE.Color(def.second), style: def.style }
      liveries.set(car.team.name, l)
    }
    return l
  }

  // Onde cada mecânico trabalha, em metros no referencial do carro: x, z, altura relativa, olhando para.
  const CREW_POSTS = [
    [1.72, 1.32, 0.62, Math.PI / 2], [1.72, -1.32, 0.62, -Math.PI / 2], [-1.68, 1.3, 0.62, Math.PI / 2], [-1.68, -1.3, 0.62, -Math.PI / 2],
    [3.35, 0, 1, Math.PI], [-3.3, 0, 1, 0], [0.4, 1.5, 1, Math.PI / 2], [0.4, -1.5, 1, -Math.PI / 2],
  ]

  return {
    group,
    update(cars, { dt, scale, sunDir, time, reduced, hovered, heightAt, rainLight, wet }) {
      let n = 0
      let wheelCount = 0
      let trailCount = 0
      let crewCount = 0
      let shardCount = 0
      let puffCount = 0
      trailColors.fill(0)
      // deslocamento da sombra, na direção oposta ao sol
      sunShift.set(-sunDir.x, 0, -sunDir.z).multiplyScalar(0.34 / Math.max(0.2, sunDir.y))
      // De perto o rastro fica discreto: serve à leitura de longe, não ao close.
      const trailAlpha = 0.24 + 0.36 * Math.min(1, (scale - 1) / 1.6)

      const addPuff = (x, y, z, size, opacity, brightness) => {
        if (puffCount >= PUFF_MAX) return
        s.setScalar(size)
        p.set(x, y, z)
        q.identity()
        m.compose(p, q, s)
        puffs.setMatrixAt(puffCount, m)
        puffAttr.setXY(puffCount, opacity, brightness)
        puffCount++
      }

      for (const car of cars.values()) {
        const st = stateOf(car)
        decals.add(car)
        const live = liveryOf(car)
        // Fora da pista (batida), o chão manda na altura: ela pode estar abaixo do terreno.
        const groundY = car.state === 'out' ? Math.max(car.z, heightAt(car.x, car.y)) : car.z
        const X = car.x, Y = groundY + 0.06, Z = -car.y
        const speed = car.speed ?? 0

        // aceleração e curva: é o que faz a carroceria mergulhar na freada e rolar na curva
        if (dt > 0) {
          const accel = (speed - st.lastSpeed) / dt
          st.accel += (Math.max(-60, Math.min(40, accel)) - st.accel) * Math.min(1, dt * 7)
          st.lastSpeed = speed
          const curve = car.state === 'run' || car.state === 'toBox' ? at(car.s).curve : 0
          const lateral = speed * speed * curve
          st.lateral += (Math.max(-45, Math.min(45, lateral)) - st.lateral) * Math.min(1, dt * 6)
        }
        const moving = car.state !== 'out'
        const jack = st.crew > 0.6 ? (st.crew - 0.6) * 0.3 : 0 // macaco levanta o carro parado
        const pitch = Math.atan(car.slope ?? 0) - (moving ? st.accel * 0.00042 : 0)
        const roll = moving ? st.lateral * 0.00055 : 0
        euler.set(roll, car.heading, pitch)
        q.setFromEuler(euler)
        p.set(X, Y + jack, Z)
        const hoverBoost = hovered === car ? 1.25 : 1
        const k = scale * hoverBoost
        s.setScalar(k)
        carMatrix.compose(p, q, s)
        body.setMatrixAt(n, carMatrix)
        const noData = car.data.cpu == null && car.state !== 'out'
        color.copy(noData ? GRAY : (car.colorObj ??= new THREE.Color(car.team.color)))
        body.setColorAt(n, color)
        const second = noData ? DARK : live.second
        secondAttr.setXYZ(n, second.r, second.g, second.b)
        const braking = Math.max(0, Math.min(1, (-st.accel - 14) / 30))
        carAttr.setXYZW(n, car.slot, live.style, braking, rainLight)

        // rodas: as da frente esterçam, e todas giram na velocidade do carro
        st.spin += (speed / WHEEL_RADIUS) * dt
        const curve = moving ? at(car.s).curve : 0
        const steer = Math.max(-0.42, Math.min(0.42, curve * 3.4 * 2.2))
        AXLES.forEach((axle, wheelIndex) => {
          // na batida, a roda da frente do lado do muro se solta
          if (car.state === 'out' && wheelIndex === (car.crashSide > 0 ? 1 : 0)) return
          q2.setFromAxisAngle(AXIS_Z, -st.spin)
          if (axle.front) q2.premultiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Y, steer))
          p.set(axle.x, WHEEL_RADIUS - jack * 0.2, axle.z)
          s.set(1, 1, axle.width)
          wheelLocal.compose(p, q2, s)
          m.multiplyMatrices(carMatrix, wheelLocal)
          wheels.setMatrixAt(wheelCount, m)
          wheels.setColorAt(wheelCount, color)
          brakeAttr.setX(wheelCount, braking)
          wheelCount++
        })

        // sombra
        euler.set(0, car.heading, Math.atan(car.slope ?? 0))
        q.setFromEuler(euler)
        p.set(X + sunShift.x * k, groundY + 0.11, Z + sunShift.z * k)
        s.set(k, 1, k)
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
            const here = at(car.s)
            const dx = car.x - here.x, dy = car.y - here.y
            for (let j = 0; j <= TRAIL_SEGMENTS; j++) {
              const t = j / TRAIL_SEGMENTS
              const q0 = at(car.s - 2.6 * scale - length * t)
              const qx = q0.x + dx, qy = q0.y + dy
              const nx = -q0.ty, ny = q0.tx
              const i = base + j * 2
              trailPositions[i * 3] = qx + nx * halfW
              trailPositions[i * 3 + 1] = q0.z + 0.16
              trailPositions[i * 3 + 2] = -(qy + ny * halfW)
              trailPositions[(i + 1) * 3] = qx - nx * halfW
              trailPositions[(i + 1) * 3 + 1] = q0.z + 0.16
              trailPositions[(i + 1) * 3 + 2] = -(qy - ny * halfW)
              const a = trailAlpha * (1 - t) * (1 - t)
              for (const v of [i, i + 1]) {
                trailColors[v * 4] = c.r
                trailColors[v * 4 + 1] = c.g
                trailColors[v * 4 + 2] = c.b
                trailColors[v * 4 + 3] = a
              }
            }
            trailCount++
          }
        }

        // Equipe: sai da garagem quando o carro para, e volta quando ele arranca.
        const stopped = car.state === 'inPit' && speed === 0
        st.crew = reduced ? (stopped ? 1 : 0) : Math.max(0, Math.min(1, st.crew + (stopped ? dt * 1.6 : -dt * 2.2)))
        if (st.crew > 0.001 && crewCount + CREW_POSTS.length <= CREW_MAX) {
          const ch = Math.cos(car.heading), sh = Math.sin(car.heading)
          for (let c = 0; c < CREW_POSTS.length; c++) {
            const [fx, fz, height, face] = CREW_POSTS[c]
            const walk = smooth((st.crew - c * 0.03) * 1.25)
            // a garagem fica à esquerda do percurso, que é -z no referencial do carro
            const lz = fz - (1 - walk) * 9
            p.set(X + (fx * ch + lz * sh) * k, Y, Z + (-fx * sh + lz * ch) * k)
            euler.set(0, car.heading + face, 0)
            q.setFromEuler(euler)
            s.set(k, k * (walk > 0.95 ? height : 1), k)
            m.compose(p, q, s)
            crew.setMatrixAt(crewCount, m)
            crew.setColorAt(crewCount, car.colorObj ?? color)
            crewCount++
          }
        }

        // Batida: lascas voam do ponto do choque e ficam no chão; a fumaça sobe enquanto ele estiver fora.
        if (car.state === 'out') {
          if (!st.debris) {
            st.debris = []
            const backward = car.heading
            for (let d = 0; d < 13; d++) {
              const a = backward + (random() - 0.5) * 2.2
              st.debris.push({
                dx: Math.cos(a) * (2 + random() * 11),
                dz: -Math.sin(a) * (2 + random() * 11),
                up: 1.2 + random() * 3.2,
                turn: random() * 6.28,
                size: 0.16 + random() * 0.34,
                paint: random() < 0.5,
              })
            }
            st.wheelOff = { dx: Math.cos(backward) * 9 + (random() - 0.5) * 3, dz: -Math.sin(backward) * 9 + (random() - 0.5) * 3 }
          }
          const since = reduced ? 1 : Math.min(1, (performance.now() - car.outAt) / 1300)
          const e = 1 - (1 - since) ** 2
          for (const d of st.debris) {
            if (shardCount >= SHARD_MAX) break
            const fx = X + d.dx * e * k, fz = Z + d.dz * e * k
            const ground = Math.max(groundY, heightAt(fx, -fz)) + 0.05
            const fy = ground + 4 * d.up * since * (1 - since)
            euler.set(d.turn * since * 3, d.turn, d.turn * since * 2)
            q.setFromEuler(euler)
            p.set(fx, fy, fz)
            s.setScalar(d.size * k)
            m.compose(p, q, s)
            shards.setMatrixAt(shardCount, m)
            shards.setColorAt(shardCount, d.paint ? (car.colorObj ?? color) : DARK)
            shardCount++
          }
          // a roda solta para um pouco adiante
          {
            const wx = X + st.wheelOff.dx * e * k, wz = Z + st.wheelOff.dz * e * k
            const ground = Math.max(groundY, heightAt(wx, -wz))
            const bounce = Math.abs(Math.sin(since * 7)) * (1 - since) * 2.2
            q2.setFromAxisAngle(AXIS_Z, since * 14)
            q.setFromAxisAngle(AXIS_Y, car.heading + 0.5)
            q.multiply(q2)
            p.set(wx, ground + WHEEL_RADIUS * k + bounce * k, wz)
            s.setScalar(k)
            m.compose(p, q, s)
            wheels.setMatrixAt(wheelCount, m)
            wheels.setColorAt(wheelCount, color)
            brakeAttr.setX(wheelCount, 0)
            wheelCount++
          }
          for (let f = 0; f < 10; f++) {
            const phase = reduced ? (f + 0.5) / 10 : (time * 0.22 + f / 10) % 1
            addPuff(
              X + (phase * 3.4 + Math.sin(f * 2.3) * 0.5) * k,
              Y + (0.5 + phase * 8) * k,
              Z - phase * 2.2 * k,
              (1.5 + phase * 6.5) * k,
              0.9 * (1 - phase) * smooth(phase * 5),
              0.4 + phase * 0.32,
            )
          }
        }

        // Spray na pista molhada: atrás de cada roda traseira, conforme a velocidade.
        if (wet > 0.15 && speed > 18 && moving) {
          const ch = Math.cos(car.heading), sh = Math.sin(car.heading)
          const amount = Math.min(1, speed / 80) * wet
          for (let f = 0; f < 9; f++) {
            const phase = reduced ? (f + 0.5) / 9 : (time * 2.6 + f / 9 + car.index * 0.13) % 1
            const back = (2.4 + phase * 9.5) * k
            const side = Math.sin(f * 2.1 + car.index) * (0.5 + phase * 1.1) * k
            addPuff(
              X - ch * back + sh * side,
              Y + (0.35 + phase * 1.5) * k,
              Z + sh * back + ch * side,
              (1.5 + phase * 4.2) * k,
              0.2 * amount * (1 - phase) * smooth(phase * 6),
              0.8,
            )
          }
        }
        n++
      }
      body.count = n
      shadows.count = n
      wheels.count = wheelCount
      body.instanceMatrix.needsUpdate = true
      body.instanceColor.needsUpdate = true
      secondAttr.needsUpdate = true
      carAttr.needsUpdate = true
      wheels.instanceMatrix.needsUpdate = true
      wheels.instanceColor.needsUpdate = true
      brakeAttr.needsUpdate = true
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
      shards.count = shardCount
      if (shardCount) {
        shards.instanceMatrix.needsUpdate = true
        shards.instanceColor.needsUpdate = true
      }
      puffs.count = puffCount
      if (puffCount) {
        puffs.instanceMatrix.needsUpdate = true
        puffAttr.needsUpdate = true
      }
    },
  }
}
