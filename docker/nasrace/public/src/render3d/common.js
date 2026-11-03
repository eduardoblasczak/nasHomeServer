// Peças compartilhadas do renderizador 3D. Coordenadas: X = leste, Y = altura, Z = sul.
// Os dados do circuito usam y para o norte, então world.z = -y.

import * as THREE from '../../vendor/three.module.min.js'

export { THREE }

export const seeded = (seed) => {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Cor média da imagem em espaço linear: normaliza o detalhe para não mudar o tom ao longe. */
function averageColor(image) {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(image, 0, 0, 16, 16)
  const d = g.getImageData(0, 0, 16, 16).data
  let r = 0, gr = 0, b = 0
  for (let i = 0; i < d.length; i += 4) {
    r += srgbToLinear(d[i] / 255)
    gr += srgbToLinear(d[i + 1] / 255)
    b += srgbToLinear(d[i + 2] / 255)
  }
  const n = d.length / 4
  return new THREE.Vector3(r / n, gr / n, b / n)
}

const loader = new THREE.TextureLoader()

/** Textura repetida com filtro anisotrópico. `srgb` para cor, sem ele para normal. */
export async function loadTiled(name, { srgb = true, anisotropy = 16 } = {}) {
  const texture = await loader.loadAsync(new URL(`../../textures/${name}.jpg`, import.meta.url).href)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = anisotropy
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.average = srgb ? averageColor(texture.image) : null
  return texture
}

/** Passa adiante os uniforms compartilhados, sem criar cópias. */
export const shared = {
  uCloud: { value: null },
  uCloudOffset: { value: new THREE.Vector2() },
  uTime: { value: 0 },
  uWet: { value: 0 },
}

const ATMOS_VERTEX_HEAD = /* glsl */ `
varying vec3 vWPos;
`
const ATMOS_VERTEX_BODY = /* glsl */ `
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  vWPos = (modelMatrix * wp).xyz;
}
`
const ATMOS_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vWPos;
uniform sampler2D uCloud;
uniform vec2 uCloudOffset;
uniform float uWet;
`
// Sombra das nuvens: multiplica só a luz direta, como a nuvem de verdade faz.
const ATMOS_FRAGMENT_LIGHT = /* glsl */ `
{
  float cloud = texture2D(uCloud, (vWPos.xz + uCloudOffset) / 2400.0).r;
  reflectedLight.directDiffuse *= cloud;
  reflectedLight.directSpecular *= cloud;
}
#include <aomap_fragment>
`

/**
 * Prepara um material do Three: posição no mundo, sombra de nuvens e os trechos próprios de
 * shader. `patch.fragment` é [[trecho original, substituto], ...], `patch.uniforms` são extras.
 */
export function atmospheric(material, patch = {}) {
  const key = patch.key ?? material.type
  material.customProgramCacheKey = () => `atmos:${key}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, patch.uniforms ?? {})
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ATMOS_VERTEX_HEAD}\n${patch.vertexHead ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${ATMOS_VERTEX_BODY}\n${patch.vertexBody ?? ''}`)
    let fragment = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ATMOS_FRAGMENT_HEAD}\n${patch.fragmentHead ?? ''}`)
      .replace('#include <aomap_fragment>', ATMOS_FRAGMENT_LIGHT)
    for (const [from, to] of patch.fragment ?? []) {
      if (!fragment.includes(from)) console.warn('trecho de shader não encontrado:', from)
      fragment = fragment.replace(from, to)
    }
    shader.fragmentShader = fragment
  }
  return material
}

/** Ruído em GLSL, sem textura: usado nos cozimentos, nunca por quadro. */
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p, int octaves) {
  float a = 0.5, v = 0.0, n = 0.0;
  const mat2 R = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < octaves; i++) {
    v += a * vnoise(p);
    n += a;
    a *= 0.5;
    p = R * p * 2.03 + 17.0;
  }
  return v / n;
}
`

/** Ruído periódico para os materiais lerem por textura: duas escalas e uma variação por canal. */
export function bakeNoise(renderer) {
  const target = new THREE.WebGLRenderTarget(256, 256, {
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
      float tile(vec2 p, float period, float seed) {
        vec2 q = p * period;
        vec2 i = floor(q), f = fract(q);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(mod(i, period) + seed), b = hash21(mod(i + vec2(1, 0), period) + seed);
        float c = hash21(mod(i + vec2(0, 1), period) + seed), d = hash21(mod(i + vec2(1, 1), period) + seed);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float layers(vec2 p, float seed) {
        return tile(p, 4.0, seed) * 0.5 + tile(p, 8.0, seed) * 0.26 + tile(p, 16.0, seed) * 0.14 + tile(p, 32.0, seed) * 0.1;
      }
      void main() {
        gl_FragColor = vec4(layers(vUv, 1.0), layers(vUv, 37.0), layers(vUv * 1.0, 71.0), layers(vUv, 113.0));
      }
    `,
    depthTest: false,
    depthWrite: false,
  }))
  return target.texture
}

/** Espera a GPU terminar o que já recebeu, sem travar a página. */
function gpuIdle(gl) {
  return new Promise((resolve) => {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!sync) {
      resolve() // contexto perdido: não há o que esperar
      return
    }
    gl.flush()
    const check = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) {
        setTimeout(check, 1)
      } else {
        gl.deleteSync(sync)
        resolve()
      }
    }
    setTimeout(check, 0)
  })
}

/**
 * Como `bakeToTarget`, mas em `tiles` x `tiles` ladrilhos, um de cada vez. Um único desenho de tela
 * cheia numa textura grande não pode ser interrompido, e o Windows reinicia o driver de vídeo se um
 * comando passar de 2 s (evento 153 do nvlddmkm, visto na RTX 3050 com outro programa usando a placa).
 */
export async function bakeInTiles(renderer, target, material, tiles) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  scene.add(mesh)
  const gl = renderer.getContext()
  const previous = renderer.getRenderTarget()
  const texture = target.texture
  const wantsMips = texture.generateMipmaps
  renderer.setRenderTarget(target) // reserva a textura, já com os níveis de mipmap
  renderer.clear()
  await gpuIdle(gl)
  target.scissorTest = true
  const w = target.width / tiles, h = target.height / tiles
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      // o renderizador refaria os mipmaps a cada desenho: só no último
      texture.generateMipmaps = wantsMips && y === tiles - 1 && x === tiles - 1
      target.scissor.set(x * w, y * h, w, h)
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      await gpuIdle(gl)
    }
  }
  texture.generateMipmaps = wantsMips
  target.scissorTest = false
  renderer.setRenderTarget(previous)
  mesh.geometry.dispose()
  material.dispose()
}

/** Executa um shader de tela cheia numa textura, uma vez só. */
export function bakeToTarget(renderer, target, material) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  scene.add(mesh)
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(previous)
  mesh.geometry.dispose()
  material.dispose()
}

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
