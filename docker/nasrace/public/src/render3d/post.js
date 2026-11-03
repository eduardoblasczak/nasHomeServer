// Etapa final: tom de cinema (ACES), brilho suave nas partes muito claras, leve vinheta e chuva.
// Tudo em poucas passadas de resolução reduzida, para sobrar tempo nos 144 Hz.

import { THREE } from './common.js'

const FULLSCREEN_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'

const DOWN_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  // filtro duplo de Kawase: pouca amostra e nenhuma cintilação
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c /= 8.0;
  if (uThreshold > 0.0) {
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(uThreshold, uThreshold * 1.8, l);
  }
  gl_FragColor = vec4(c, 1.0);
}
`

const UP_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}
`

const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uRain;
uniform float uTime;
uniform vec2 uResolution;

vec3 aces(vec3 x) {
  const mat3 inputM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outputM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  x = inputM * x;
  vec3 a = x * (x + 0.0245786) - 0.000090537;
  vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return clamp(outputM * (a / b), 0.0, 1.0);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Uma camada de riscos: finos, inclinados, com tamanho e posição diferentes em cada célula.
float rainLayer(vec2 px, float speed, vec2 cell, float rarity) {
  px.x += px.y * 0.13;
  px.y += uTime * speed;
  vec2 id = floor(px / cell);
  vec2 f = fract(px / cell);
  float h = hash(id);
  float x = abs(f.x - 0.2 - 0.6 * fract(h * 19.7)) * cell.x;
  float line = smoothstep(1.1, 0.15, x);
  float span = smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.55, f.y);
  return step(rarity, h) * line * span;
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;

  // chuva: céu fechado e riscos finos descendo pela tela
  if (uRain > 0.001) {
    c *= mix(vec3(1.0), vec3(0.62, 0.67, 0.75), uRain);
    vec2 px = vUv * uResolution;
    float drops = rainLayer(px, 2600.0, vec2(11.0, 150.0), 0.93) * 0.6 + rainLayer(px + 37.0, 1700.0, vec2(7.0, 90.0), 0.95) * 0.4;
    c += drops * 0.16 * uRain;
  }

  c *= uExposure;
  c = aces(c);
  // gama, com uma curva suave de contraste e um pouco mais de saturação
  c = pow(c, vec3(1.0 / 2.2));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.04);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);
  // vinheta de lente, quase imperceptível
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.32;
  // pontilhado: evita faixas no céu e nas áreas escuras em 8 bits
  c += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`

export function createPost(renderer, { samples = 4, bloom: bloomOn = true } = {}) {
  let bloom = bloomOn
  const quadScene = new THREE.Scene()
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  quad.frustumCulled = false
  quadScene.add(quad)

  const pass = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false })

  const down = pass(DOWN_FRAGMENT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } })
  const up = pass(UP_FRAGMENT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } })
  up.blending = THREE.AdditiveBlending
  up.transparent = true
  const composite = pass(COMPOSITE_FRAGMENT, {
    tScene: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0.28 },
    uExposure: { value: 1.02 },
    uRain: { value: 0 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
  })

  const main = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false })
  const mips = []
  const LEVELS = 4
  for (let i = 0; i < LEVELS; i++) {
    mips.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }))
  }

  const draw = (material, target) => {
    quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(quadScene, quadCamera)
  }

  return {
    target: main,
    setSize(w, h) {
      main.setSize(w, h)
      let mw = w, mh = h
      for (const m of mips) {
        mw = Math.max(2, Math.floor(mw / 2))
        mh = Math.max(2, Math.floor(mh / 2))
        m.setSize(mw, mh)
      }
      composite.uniforms.uResolution.value.set(w, h)
    },
    setRain(v) {
      composite.uniforms.uRain.value = v
    },
    setQuality({ samples: n, bloom: on }) {
      bloom = on
      if (main.samples !== n) {
        main.samples = n
        main.dispose()
      }
    },
    render(time) {
      renderer.autoClear = false
      if (bloom) {
        let src = main.texture
        for (let i = 0; i < mips.length; i++) {
          down.uniforms.tSrc.value = src
          down.uniforms.uTexel.value.set(0.5 / mips[i].width, 0.5 / mips[i].height)
          // o limiar só na primeira passada: é o que separa o brilho do resto da imagem
          down.uniforms.uThreshold.value = i === 0 ? 1.3 : 0
          draw(down, mips[i])
          src = mips[i].texture
        }
        for (let i = mips.length - 2; i >= 0; i--) {
          up.uniforms.tSrc.value = mips[i + 1].texture
          up.uniforms.uTexel.value.set(0.5 / mips[i + 1].width, 0.5 / mips[i + 1].height)
          draw(up, mips[i])
        }
      }
      composite.uniforms.tScene.value = main.texture
      composite.uniforms.tBloom.value = mips[0].texture
      composite.uniforms.uBloom.value = bloom ? 0.28 : 0
      composite.uniforms.uTime.value = time
      draw(composite, null)
      renderer.autoClear = true
    },
  }
}
