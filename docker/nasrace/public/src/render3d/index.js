// Orquestra a cena 3D: luz, sombras cozidas, câmera e o desenho por quadro. O custo por quadro é
// mantido baixo de propósito: a sombra estática sai de um único cozimento, e o terreno e a pista
// só leem texturas prontas. É o que dá margem para os 144 Hz na RTX 3050.

import { at, CIRCUIT, STEP } from '../circuit.js'
import { race, MODES } from '../race.js'
import { HOSPITALITY, MASTS, REPLACED, STANDS, TENTS, TRUCKS, PADDOCK_CENTER } from '../venue.js'
import { BRAND_ROWS, createBrandAtlas, loadBrandFont } from './brands.js'
import { bakeNoise, bakeToTarget, loadTiled, NOISE_GLSL, seeded, shared, THREE } from './common.js'
import { createCameraRig } from './camera.js'
import { createCars } from './cars.js'
import { addGrandPrix, createFlags, createPitBoards, createScreens, createStartLights } from './gp.js'
import { KitBuilder, kitMesh } from './kit.js'
import { createPeople } from './people.js'
import { createPost } from './post.js'
import { addBuildings, addTanks, buildTrees, buildWater } from './scenery.js'
import { buildHeightField, createTerrain } from './terrain.js'
import { createTrack, flagStripGeometry } from './track.js'

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

// Do melhor para o mais leve. O sistema desce sozinho se o computador não der conta (ver main.js).
export const QUALITY = [
  { name: 'alta', dpr: 1.5, samples: 4, bloom: true, treeRadius: 330 },
  { name: 'média', dpr: 1, samples: 4, bloom: true, treeRadius: 200 },
  { name: 'baixa', dpr: 1, samples: 2, bloom: true, treeRadius: 90 },
  { name: 'mínima', dpr: 0.8, samples: 0, bloom: false, treeRadius: 0 },
]

// O que é montado uma vez ao abrir. Tamanhos em pixels. A versão leve ocupa um quarto da memória nas
// texturas e tira detalhes de telhado e de copa que de longe nem aparecem (ver main.js).
export const LOADS = {
  cheia: { shadow: 8192, ground: 4096, around: 2048, simple: false },
  leve: { shadow: 4096, ground: 2048, around: 1024, simple: true },
}

// Sol da tarde vindo do lado direito da tela (norte), um pouco para o lado da câmera: ilumina a
// frente das arquibancadas e deixa sombras compridas para a esquerda.
const SUN = new THREE.Vector3(0.2, 0.62, -0.74).normalize()

function createSky(renderer) {
  const scene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(100, 32, 16)
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: SUN } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSun;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.05, 1.0);
        vec3 sky = mix(vec3(0.72, 0.8, 0.9), vec3(0.2, 0.38, 0.66), pow(max(h, 0.0), 0.55));
        sky = mix(sky, vec3(0.3, 0.32, 0.26), smoothstep(0.02, -0.05, d.y));
        float sun = max(dot(d, uSun), 0.0);
        sky += vec3(1.0, 0.9, 0.72) * (pow(sun, 8.0) * 0.5 + pow(sun, 256.0) * 12.0);
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
  scene.add(new THREE.Mesh(geometry, material))
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(scene, 0).texture
  pmrem.dispose()
  geometry.dispose()
  material.dispose()
  return env
}

/** Textura de folhagem repetível: RG = inclinação dos tufos, B = vãos entre eles. */
function bakeLeaves(renderer) {
  const target = new THREE.WebGLRenderTarget(512, 512, {
    type: THREE.UnsignedByteType,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  })
  target.texture.anisotropy = 8
  bakeToTarget(renderer, target, new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      ${NOISE_GLSL}
      // células periódicas: cada uma é um tufo de folhas, com a altura caindo para a borda
      float clump(vec2 uv, float cells, float seed) {
        vec2 p = uv * cells;
        vec2 ip = floor(p);
        float best = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 c = ip + vec2(x, y);
            vec2 w = mod(c, cells);
            vec2 o = vec2(hash21(w + seed), hash21(w + seed + 17.0));
            best = min(best, length(c + o - p));
          }
        }
        return 1.0 - smoothstep(0.0, 0.85, best);
      }
      float heightAt(vec2 uv) {
        return clump(uv, 22.0, 3.0) * 0.55 + clump(uv, 48.0, 11.0) * 0.3 + clump(uv, 96.0, 29.0) * 0.15;
      }
      void main() {
        float e = 1.0 / 512.0;
        float h = heightAt(vUv);
        float dx = heightAt(vUv + vec2(e, 0.0)) - heightAt(vUv - vec2(e, 0.0));
        float dy = heightAt(vUv + vec2(0.0, e)) - heightAt(vUv - vec2(0.0, e));
        gl_FragColor = vec4(clamp(vec2(-dx, -dy) * 9.0 + 0.5, 0.0, 1.0), h, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  }))
  return target
}

function bakeClouds(renderer) {
  const target = new THREE.WebGLRenderTarget(512, 512, {
    type: THREE.UnsignedByteType,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  })
  bakeToTarget(renderer, target, new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      ${NOISE_GLSL}
      // ruído periódico: a sombra das nuvens repete sem emenda
      float tile(vec2 p, float period) {
        vec2 q = p * period;
        vec2 i = floor(q), f = fract(q);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(mod(i, period)), b = hash21(mod(i + vec2(1, 0), period));
        float c = hash21(mod(i + vec2(0, 1), period)), d = hash21(mod(i + vec2(1, 1), period));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      void main() {
        float v = tile(vUv, 4.0) * 0.5 + tile(vUv, 8.0) * 0.25 + tile(vUv, 16.0) * 0.14 + tile(vUv, 32.0) * 0.07 + tile(vUv, 64.0) * 0.04;
        float cloud = smoothstep(0.54, 0.74, v);
        gl_FragColor = vec4(vec3(1.0 - cloud * 0.38), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  }))
  return target
}

export async function createRenderer3D({ canvas, stage, geo, onProgress, onHover, quality: firstQuality = 0, load = LOADS.cheia }) {
  const say = (text) => onProgress?.(text)
  let quality = QUALITY[firstQuality]
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
    depth: false,
    preserveDrawingBuffer: false,
  })
  renderer.info.autoReset = false
  renderer.toneMapping = THREE.NoToneMapping
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace // o sRGB sai na etapa final
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.extensions.get('OES_texture_float_linear')

  const scene = new THREE.Scene()
  const haze = new THREE.Color('#b9c6cf')
  scene.background = new THREE.Color('#aab6bd')
  scene.fog = new THREE.Fog(haze, 3000, 12000)

  say('Calculando o relevo…')
  await nextFrame()
  const field = buildHeightField(geo)

  const cloudTarget = bakeClouds(renderer)
  shared.uCloud.value = cloudTarget.texture

  say('Montando o céu e a luz…')
  await nextFrame()
  const env = createSky(renderer)

  const sun = new THREE.DirectionalLight('#fff0d8', 3.7)
  const SHADOW_RANGE = 1500
  const center = new THREE.Vector3(0, 20, 0)
  sun.position.copy(center).addScaledVector(SUN, 2400)
  sun.target.position.copy(center)
  sun.castShadow = true
  const shadowSize = Math.min(load.shadow, renderer.capabilities.maxTextureSize)
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  Object.assign(sun.shadow.camera, { left: -SHADOW_RANGE, right: SHADOW_RANGE, top: SHADOW_RANGE, bottom: -SHADOW_RANGE, near: 100, far: 5200 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.6
  sun.shadow.radius = 1.6
  scene.add(sun, sun.target)
  const skyLight = new THREE.HemisphereLight('#c7dbf2', '#7d7a58', 1.75)
  scene.add(skyLight)

  say('Pintando o terreno…')
  await loadBrandFont()
  await nextFrame()
  const terrain = await createTerrain(renderer, geo, field, load)
  terrain.renderOrder = 2 // por último: o shader mais caro não pinta o que já está coberto
  scene.add(terrain)

  say('Asfaltando a pista…')
  await nextFrame()
  const track = await createTrack(renderer, env)
  scene.add(track)

  say('Construindo os arredores…')
  await nextFrame()
  const brands = await createBrandAtlas()
  const noise = bakeNoise(renderer)
  const kitOptions = { brands, brandRows: BRAND_ROWS, envMap: env, noise }
  const city = new KitBuilder(2_400_000)
  const isReplaced = (x, y) => REPLACED.some(([rx, ry]) => Math.hypot(x - rx, y - ry) < 8)
  addBuildings(city, geo, field, isReplaced, load)
  addTanks(city, geo, field)
  scene.add(kitMesh(city, { ...kitOptions, variant: 'city' }))

  say('Montando o fim de semana de GP…')
  await nextFrame()
  const paddock = geo.layers.buildings.find(({ pts }) => {
    const n = pts.length / 2
    let x = 0, y = 0
    for (let i = 0; i < n; i++) {
      x += pts[i * 2]
      y += pts[i * 2 + 1]
    }
    return Math.hypot(x / n - PADDOCK_CENTER[0], y / n - PADDOCK_CENTER[1]) < 8
  })?.pts
  const venue = new KitBuilder(600_000)
  const gp = addGrandPrix(venue, field, { geo, paddock, simple: load.simple })
  const screens = createScreens(field, venue)
  scene.add(kitMesh(venue, { ...kitOptions, variant: 'venue' }))
  scene.add(gp.fence, screens.mesh)
  const pitBoards = createPitBoards(gp.pit)
  scene.add(pitBoards.mesh)
  scene.add(createFlags(gp.flags, seeded(77)))
  const people = createPeople({ seated: gp.people.seated, ground: gp.people.ground, sun: SUN, simple: load.simple })
  scene.add(people.group)

  // Árvore não nasce em cima do que foi montado para o GP.
  const occupied = [
    ...STANDS.flatMap((st) => st.front.map(([x, y]) => [x, y, st.depth + 6])),
    ...[...MASTS, ...TENTS, ...HOSPITALITY, ...TRUCKS].map((o) => [o.x, o.y, (o.length ?? 8) * 0.7 + 3]),
  ]
  const trees = buildTrees(geo, field, bakeLeaves(renderer).texture, occupied, load)
  scene.add(trees.group)
  const waveNormal = await loadTiled('aerial_grass_rock_nor_gl_1k', { srgb: false })
  scene.add(buildWater(field, env, waveNormal))

  const cars = createCars(renderer, env)
  scene.add(cars.group)
  const lights = createStartLights(gp.gantries[0])
  scene.add(lights.mesh)

  // faixa de bandeira amarela
  const flagMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })
  let flagMesh = null
  let flagKey = ''

  const post = createPost(renderer, { samples: quality.samples, bloom: quality.bloom })
  const rig = createCameraRig(canvas, field.heightAt)

  // ---------------------------------------------------------------- tamanho

  const view = { w: 1, h: 1, cssW: 1, cssH: 1, dpr: 1 }
  function resize() {
    const rect = stage.getBoundingClientRect()
    // Tela pequena borra com poucos pixels por ponto, e aguenta mais: 390 pontos a 1,5 dão um quarto de Full HD.
    const denser = Math.min(rect.width, rect.height) < 600 ? 1.5 : 1
    view.dpr = Math.min(quality.dpr * denser, window.devicePixelRatio || 1)
    view.cssW = Math.max(1, rect.width)
    view.cssH = Math.max(1, rect.height)
    view.w = Math.round(view.cssW * view.dpr)
    view.h = Math.round(view.cssH * view.dpr)
    renderer.setPixelRatio(1)
    renderer.setSize(view.w, view.h, false)
    post.setSize(view.w, view.h)
    const aspect = view.w / view.h
    // área livre: o painel do alto à esquerda e a legenda de baixo cobrem as bordas da tela
    rig.fit(aspect, {
      left: (28 / view.cssW) * 2,
      right: (28 / view.cssW) * 2,
      top: (66 / view.cssH) * 2,
      bottom: (86 / view.cssH) * 2,
    })
  }
  resize()
  new ResizeObserver(resize).observe(stage)

  // Sombra estática: um único cozimento. Só os prédios e as árvores projetam nela.
  say('Cozinhando as sombras…')
  await nextFrame()
  rig.update(0.016, view.w / view.h)
  renderer.shadowMap.needsUpdate = true

  // ---------------------------------------------------------------- quadro

  const tags = document.getElementById('tags')
  const tagPool = new Map()

  // Nomes das curvas: só na vista aberta, por fora da pista. De perto, atrapalhariam.
  const cornerLabels = CIRCUIT.corners.map((corner) => {
    // meio do trecho: é onde o nome faz sentido
    const s = (corner.i + 6) * STEP
    const p = at(s)
    const curve = p.curve
    const side = curve >= 0 ? -1 : 1
    const q = at(s, side * ((side < 0 ? p.right : p.left) + 15))
    const inner = at(s, -side * ((side < 0 ? p.left : p.right) + 15))
    const el = document.createElement('div')
    el.className = 'corner-label'
    el.textContent = corner.name
    tags.append(el)
    return { el, world: new THREE.Vector3(q.x, q.z + 2, -q.y), other: new THREE.Vector3(inner.x, inner.z + 2, -inner.y), shown: true }
  })
  let labelsKey = ''
  function updateCornerLabels(ppm) {
    const show = ppm < 1.75
    const c = rig.camera.position
    const key = `${show}|${c.x.toFixed(1)}|${c.y.toFixed(1)}|${c.z.toFixed(1)}|${view.cssW}|${view.cssH}`
    if (key === labelsKey) return
    labelsKey = key
    for (const label of cornerLabels) {
      if (label.shown !== show) {
        label.shown = show
        label.el.classList.toggle('is-off', !show)
      }
      if (!show) continue
      projected.copy(label.world).project(rig.camera)
      let x = (projected.x * 0.5 + 0.5) * view.cssW, y = (-projected.y * 0.5 + 0.5) * view.cssH
      // perto da borda da tela, o nome passa para o outro lado da pista
      if (x < 80 || x > view.cssW - 80 || y < 24 || y > view.cssH - 24) {
        projected.copy(label.other).project(rig.camera)
        x = (projected.x * 0.5 + 0.5) * view.cssW
        y = (-projected.y * 0.5 + 0.5) * view.cssH
      }
      label.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`
    }
  }
  const projected = new THREE.Vector3()

  function setTag(car, text, kind, x, y) {
    let el = tagPool.get(car.name)
    if (!el) {
      el = document.createElement('div')
      el.className = 'car-tag'
      tags.append(el)
      tagPool.set(car.name, el)
    }
    if (el.textContent !== text) el.textContent = text
    if (el.dataset.kind !== kind) el.dataset.kind = kind
    el.hidden = false
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`
  }

  const screen = (car) => {
    projected.set(car.x, car.z, -car.y).project(rig.camera)
    return { x: (projected.x * 0.5 + 0.5) * view.cssW, y: (-projected.y * 0.5 + 0.5) * view.cssH }
  }

  let time = 0
  let hovered = null
  const lastInfo = { calls: 0, triangles: 0 }

  function updateFlags() {
    const outs = [...race.cars.values()].filter((c) => c.state === 'out')
    const key = outs.map((c) => `${c.name}:${Math.round(c.s)}`).join('|')
    if (key === flagKey) return
    flagKey = key
    if (flagMesh) {
      scene.remove(flagMesh)
      flagMesh.geometry.dispose()
      flagMesh = null
    }
    if (outs.length) {
      flagMesh = new THREE.Mesh(flagStripGeometry(outs.map((c) => ({ s: c.s }))), flagMaterial)
      flagMesh.frustumCulled = false
      scene.add(flagMesh)
    }
  }

  function frame(dt, focusCar) {
    renderer.info.reset()
    time += dt
    if (!REDUCED) {
      shared.uTime.value = time
      // nuvens cruzando o céu, devagar
      shared.uCloudOffset.value.x = time * 4.2
      shared.uCloudOffset.value.y = time * 1.4
    }
    const wet = race.rain
    shared.uWet.value = wet
    post.setRain(wet)
    sun.intensity = 3.7 * (1 - 0.62 * wet)
    skyLight.intensity = 1.75 * (1 - 0.22 * wet)
    track.setWet(wet)
    lights.update(race.lights)

    rig.update(dt, view.w / view.h)

    // Distante, o carro precisa de um tamanho mínimo em pixels para continuar legível.
    const ppm = rig.pixelsPerMetre(view.cssH)
    const scale = THREE.MathUtils.clamp(19 / (5.6 * ppm), 1, 3.4)
    trees.update(ppm > 2.2, rig.state.target, quality.treeRadius)
    people.update(rig.state.distance)
    pitBoards.update(race.cars)
    screens.update(race.cars, MODES[race.mode].title, performance.now())
    hovered = focusCar
    // luz de chuva piscando na traseira, como manda o regulamento
    const rainLight = wet > 0.15 ? (REDUCED || Math.sin(time * 26) > -0.2 ? 1 : 0.12) : 0
    cars.update(race.cars, { dt, scale, sunDir: SUN, time, reduced: REDUCED, hovered, heightAt: field.heightAt, rainLight, wet })
    updateFlags()
    updateCornerLabels(ppm)

    // Fumaça e efeitos ficam em cima da imagem; o resto está na cena.
    renderer.setRenderTarget(post.target)
    renderer.clear()
    renderer.render(scene, rig.camera)
    lastInfo.calls = renderer.info.render.calls
    lastInfo.triangles = renderer.info.render.triangles
    post.render(REDUCED ? 0 : time)

    for (const car of race.cars.values()) {
      const box = car.state === 'toBox' || car.state === 'inPit'
      const text = car.state === 'out' ? `${car.code} OUT` : car.state === 'inPit' ? `${car.code} PIT` : car.state === 'toBox' ? `${car.code} BOX` : hovered === car ? car.code : null
      const el = tagPool.get(car.name)
      if (!text) {
        if (el && !el.hidden) el.hidden = true
        continue
      }
      const pos = screen(car)
      setTag(car, text, car.state === 'out' ? 'out' : box ? 'box' : 'hover', pos.x, pos.y - 12)
    }
  }

  // Sombra e cena inteira uma vez, antes de liberar a tela: evita o tranco do primeiro quadro.
  renderer.compile(scene, rig.camera)

  const carAt = (x, y) => {
    let best = null
    let dist = 22
    for (const car of race.cars.values()) {
      const p = screen(car)
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < dist) {
        dist = d
        best = car
      }
    }
    return best
  }

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left, y = event.clientY - rect.top
    onHover?.(carAt(x, y), x, y, rect)
  })
  canvas.addEventListener('pointerleave', () => onHover?.(null, 0, 0, null))

  return {
    frame,
    scene,
    heightAt: field.heightAt,
    rig,
    renderer,
    view,
    follow: (car) => rig.follow(car),
    /** Números para o teste automático e para o medidor de desempenho. */
    info: () => lastInfo,
    quality: () => quality.name,
    /** Desce um nível. Devolve false se já estiver no mais leve. */
    lowerQuality() {
      const next = QUALITY[QUALITY.indexOf(quality) + 1]
      if (!next) return false
      quality = next
      post.setQuality(next)
      resize()
      return true
    },
  }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
