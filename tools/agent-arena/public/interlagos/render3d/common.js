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
