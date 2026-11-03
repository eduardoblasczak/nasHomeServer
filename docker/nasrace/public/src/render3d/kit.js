// Peças de cenário: um construtor de malhas e um único material com vários acabamentos. Prédios,
// arquibancadas, barreiras e estruturas do GP ficam em poucas chamadas de desenho, e o detalhe sai
// do shader, em metros reais. Coordenadas do mundo: x = leste, y = altura, z = -norte.

import { atmospheric, THREE } from './common.js'

/** Acabamentos do material. O valor vai para a malha em `aKit.z`. */
export const FINISH = { PLAIN: 0, WALL: 1, TILE: 2, SLAB: 3, METAL: 4, MEMBRANE: 5, CROWD: 6, BOARD: 7, STEEL: 8, GLASS: 9, RIBS: 10, EMISSIVE: 11 }

const color = new THREE.Color()

/** Cor linear [r, g, b] a partir de '#rrggbb'. */
export const rgb = (hex, k = 1) => {
  color.set(hex)
  return [color.r * k, color.g * k, color.b * k]
}

export class KitBuilder {
  constructor(capacity = 200_000) {
    this.count = 0
    this.alloc(capacity)
  }

  alloc(capacity) {
    const grow = (old, size) => {
      const next = new Float32Array(capacity * size)
      if (old) next.set(old.subarray(0, this.count * size))
      return next
    }
    this.pos = grow(this.pos, 3)
    this.nor = grow(this.nor, 3)
    this.col = grow(this.col, 3)
    this.kit = grow(this.kit, 4)
    this.capacity = capacity
  }

  /** Triângulo com normal plana. `uv` são as coordenadas do acabamento em cada vértice. */
  tri(a, b, c, tint, finish = 0, uvA = ZERO, uvB = ZERO, uvC = ZERO, seed = 0) {
    if (this.count + 3 > this.capacity) this.alloc(this.capacity * 2)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    this.vertex(a, nx, ny, nz, tint, finish, uvA, seed)
    this.vertex(b, nx, ny, nz, tint, finish, uvB, seed)
    this.vertex(c, nx, ny, nz, tint, finish, uvC, seed)
  }

  vertex(p, nx, ny, nz, tint, finish, uv, seed) {
    const i = this.count++
    const i3 = i * 3, i4 = i * 4
    this.pos[i3] = p[0]; this.pos[i3 + 1] = p[1]; this.pos[i3 + 2] = p[2]
    this.nor[i3] = nx; this.nor[i3 + 1] = ny; this.nor[i3 + 2] = nz
    this.col[i3] = tint[0]; this.col[i3 + 1] = tint[1]; this.col[i3 + 2] = tint[2]
    this.kit[i4] = uv[0]; this.kit[i4 + 1] = uv[1]; this.kit[i4 + 2] = finish; this.kit[i4 + 3] = seed
  }

  /** Quadrilátero a, b, c, d no sentido anti-horário visto de fora. */
  quad(a, b, c, d, tint, finish = 0, uv = NO_UV, seed = 0) {
    this.tri(a, b, c, tint, finish, uv[0], uv[1], uv[2], seed)
    this.tri(a, c, d, tint, finish, uv[0], uv[2], uv[3], seed)
  }

  /** Caixa de tamanho (sx, sy, sz) com a base em (cx, y, cz), girada `yaw` em torno de y. */
  box(cx, y, cz, sx, sy, sz, yaw, tint, { finish = 0, top = null, topFinish = null, bottom = false, seed = 0, wallUv = false } = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const hx = sx / 2, hz = sz / 2
    const P = (lx, h, lz) => [cx + lx * c + lz * s, y + h, cz - lx * s + lz * c]
    const a = P(-hx, 0, hz), b = P(hx, 0, hz), d = P(hx, 0, -hz), e = P(-hx, 0, -hz)
    const a1 = P(-hx, sy, hz), b1 = P(hx, sy, hz), d1 = P(hx, sy, -hz), e1 = P(-hx, sy, -hz)
    const uvFor = (w) => (wallUv ? [[0, 0], [w, 0], [w, sy], [0, sy]] : NO_UV)
    this.quad(a, b, b1, a1, tint, finish, uvFor(sx), seed)
    this.quad(b, d, d1, b1, tint, finish, uvFor(sz), seed)
    this.quad(d, e, e1, d1, tint, finish, uvFor(sx), seed)
    this.quad(e, a, a1, e1, tint, finish, uvFor(sz), seed)
    this.quad(a1, b1, d1, e1, top ?? tint, topFinish ?? finish, topFinish != null ? [[0, 0], [sx, 0], [sx, sz], [0, sz]] : NO_UV, seed)
    if (bottom) this.quad(e, d, b, a, tint, finish, NO_UV, seed)
  }

  /** Barra de seção quadrada ou prismática entre dois pontos: mastros, treliças, cabos. */
  bar(p0, p1, radius, tint, { sides = 4, finish = FINISH.STEEL, seed = 0 } = {}) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2]
    const len = Math.hypot(dx, dy, dz) || 1
    const ax = dx / len, ay = dy / len, az = dz / len
    // base ortogonal ao eixo
    const ref = Math.abs(ay) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    let ux = ay * ref[2] - az * ref[1], uy = az * ref[0] - ax * ref[2], uz = ax * ref[1] - ay * ref[0]
    const ul = Math.hypot(ux, uy, uz) || 1
    ux /= ul; uy /= ul; uz /= ul
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux
    const ring = []
    for (let i = 0; i < sides; i++) {
      const t = (i / sides) * Math.PI * 2
      const k = Math.cos(t) * radius, l = Math.sin(t) * radius
      ring.push([ux * k + vx * l, uy * k + vy * l, uz * k + vz * l])
    }
    for (let i = 0; i < sides; i++) {
      const r0 = ring[i], r1 = ring[(i + 1) % sides]
      const a = [p0[0] + r0[0], p0[1] + r0[1], p0[2] + r0[2]], b = [p0[0] + r1[0], p0[1] + r1[1], p0[2] + r1[2]]
      const c = [p1[0] + r1[0], p1[1] + r1[1], p1[2] + r1[2]], d = [p1[0] + r0[0], p1[1] + r0[1], p1[2] + r0[2]]
      this.quad(a, b, c, d, tint, finish, NO_UV, seed)
    }
  }

  /** Sólido de revolução em torno de y. `profile` = [[raio, altura], ...], de baixo para cima. */
  lathe(cx, y, cz, profile, sides, tint, finish = 0, seed = 0) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, h0] = profile[k]
      const [r1, h1] = profile[k + 1]
      for (let i = 0; i < sides; i++) {
        const t0 = (i / sides) * Math.PI * 2, t1 = ((i + 1) / sides) * Math.PI * 2
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1)
        const a = [cx + c0 * r0, y + h0, cz - s0 * r0], b = [cx + c1 * r0, y + h0, cz - s1 * r0]
        const c = [cx + c1 * r1, y + h1, cz - s1 * r1], d = [cx + c0 * r1, y + h1, cz - s0 * r1]
        const uv = [[(i / sides) * r0 * 6.28, h0], [((i + 1) / sides) * r0 * 6.28, h0], [((i + 1) / sides) * r1 * 6.28, h1], [(i / sides) * r1 * 6.28, h1]]
        if (r0 > 0.001) this.tri(a, b, c, tint, finish, uv[0], uv[1], uv[2], seed)
        if (r1 > 0.001) this.tri(a, c, d, tint, finish, uv[0], uv[2], uv[3], seed)
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry()
    const n = this.count
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3))
    g.setAttribute('aKit', new THREE.BufferAttribute(this.kit.slice(0, n * 4), 4))
    this.pos = this.nor = this.col = this.kit = null
    return g
  }
}

const ZERO = [0, 0]
const NO_UV = [ZERO, ZERO, ZERO, ZERO]

// ------------------------------------------------------------------ material

const KIT_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vKit;
uniform sampler2D uBrands;
uniform sampler2D uNoise;
uniform float uBrandRows;
float kitRough;
float kitMetal;
vec3 kitNormal; // desvio da normal em x, z do mundo
vec3 kitGlow;
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// aparece só enquanto a célula tem pixels para isso: evita o chuvisco de longe
float lod(vec2 p, float cells) {
  vec2 w = fwidth(p) * cells;
  return 1.0 - smoothstep(0.28, 0.8, max(w.x, w.y));
}
#ifdef KIT_VENUE
vec3 shirtColor(float h) {
  if (h < 0.26) return vec3(0.66, 0.66, 0.63);
  if (h < 0.46) return vec3(0.045, 0.05, 0.06);
  if (h < 0.58) return vec3(0.42, 0.055, 0.045);
  if (h < 0.68) return vec3(0.09, 0.17, 0.36);
  if (h < 0.78) return vec3(0.68, 0.52, 0.09);
  if (h < 0.87) return vec3(0.08, 0.27, 0.11);
  return vec3(0.34, 0.27, 0.2);
}
#endif
`

const KIT_COLOR = /* glsl */ `
#include <color_fragment>
kitRough = 0.9;
kitMetal = 0.0;
kitNormal = vec3(0.0);
kitGlow = vec3(0.0);
{
  float finish = floor(vKit.z + 0.5);
  vec2 uv = vKit.xy;
  float seed = vKit.w;
  vec3 c = diffuseColor.rgb;
  // sujeira de longe: todo o cenário envelhece um pouco, sem textura própria
  vec4 big = texture2D(uNoise, vWPos.xz / 61.0 + seed);
  vec4 small = texture2D(uNoise, vWPos.xz / 11.0 + seed * 3.0);
  float grime = big.r * 0.6 + small.g * 0.4;

  if (finish < 0.5) {
    c *= 0.9 + 0.2 * grime;
  } else if (finish < 1.5) {
    // parede: andares de 3 m, janelas a cada 3,2 m, com a fileira de cada prédio deslocada
    vec2 q = (uv + seed * 7.0) / vec2(3.2, 3.0);
    vec2 id = floor(q);
    vec2 f = fract(q);
    float aa = fwidth(q.x) + fwidth(q.y);
    float pane = smoothstep(0.22 - aa, 0.22 + aa, f.x) * smoothstep(0.78 + aa, 0.78 - aa, f.x)
      * smoothstep(0.34 - aa, 0.34 + aa, f.y) * smoothstep(0.82 + aa, 0.82 - aa, f.y);
    float open = step(0.32, hash21(id + seed * 91.0));
    c *= 0.84 + 0.2 * grime;
    c = mix(c, vec3(0.035, 0.05, 0.065), pane * open * lod(uv, 1.0 / 3.0));
  } else if (finish < 2.5) {
    // telha cerâmica: fiadas subindo a água do telhado
    float rows = sin(uv.y * 20.0) * 0.5 + 0.5;
    vec2 q = uv * vec2(3.6, 2.9);
    float tile = hash21(floor(q) + seed * 41.0);
    float near = lod(uv, 3.0);
    c *= mix(1.0, (0.72 + 0.34 * rows) * (0.86 + 0.28 * tile), near);
    c *= 0.74 + 0.5 * grime;
    c = mix(c, c * vec3(0.55, 0.6, 0.5), smoothstep(0.62, 0.86, small.r) * 0.7);
    kitRough = 0.82;
  } else if (finish < 3.5) {
    // laje: manchas de água e emendas
    c *= 0.72 + 0.46 * grime;
    float joints = smoothstep(0.03, 0.0, min(abs(fract(uv.x / 6.0) - 0.5), abs(fract(uv.y / 6.0) - 0.5)));
    c *= 1.0 - 0.14 * joints * lod(uv, 1.0 / 6.0);
    kitRough = 0.95;
  } else if (finish < 4.5) {
    // telha metálica ondulada: as ondas correm ao longo de u
    float wave = sin(uv.y * 6.28 / 0.62);
    float near = lod(uv, 1.0 / 0.62);
    c *= 1.0 + 0.1 * wave * near;
    c *= 0.82 + 0.3 * grime;
    c = mix(c, c * vec3(0.72, 0.56, 0.42), smoothstep(0.62, 0.9, big.g) * 0.5);
    kitRough = 0.5;
    kitMetal = 0.35;
  }
#ifdef KIT_VENUE
  else if (finish < 5.5) {
    // membrana tensionada: cada módulo é uma tenda rasa, com o vinco da calha em volta
    float a = seed;
    vec2 cell = vec2(19.0, 17.0);
    vec2 f = fract(uv / cell) * 2.0 - 1.0;
    float edge = max(abs(f.x), abs(f.y));
    float seam = smoothstep(0.955, 0.99, edge);
    vec2 U = vec2(cos(a), sin(a)), V = vec2(-sin(a), cos(a));
    vec2 slope = f * 0.62 * (1.0 - seam);
    vec2 world = U * slope.x + V * slope.y;
    kitNormal = vec3(world.x, 0.0, world.y);
    c *= 0.94 + 0.08 * grime;
    c = mix(c, c * 0.5, seam * lod(uv, 1.0 / 19.0));
    // sujeira escorre para as calhas
    c = mix(c, c * vec3(0.84, 0.81, 0.74), smoothstep(0.45, 1.0, edge) * 0.5);
    kitRough = 0.68;
  } else if (finish < 6.5) {
    // arquibancada: uv = (metros ao longo, número da fileira)
    vec2 q = vec2(uv.x / 0.62, uv.y);
    vec2 id = floor(q);
    vec2 f = fract(q);
    float h = hash21(id + seed * 17.0);
    float h2 = hash21(id.yx + seed * 3.0 + 5.5);
    float aisle = step(0.05, fract(uv.x / 22.0));
    float taken = step(h, 0.82 + 0.16 * big.b) * aisle;
    vec3 shirt = shirtColor(h2);
    float body = smoothstep(0.56, 0.4, length((f - vec2(0.5, 0.4)) * vec2(1.0, 1.1)));
    float head = smoothstep(0.2, 0.13, length(f - vec2(0.5, 0.76)));
    vec3 person = mix(shirt, vec3(0.42 + 0.2 * h, 0.28 + 0.12 * h, 0.2 + 0.08 * h), head);
    float near = lod(uv, 1.0 / 0.62);
    vec3 close = mix(c * 0.8, person, taken * max(body, head)) * (0.76 + 0.24 * f.y);
    // de longe, o público vira um pontilhado de cores
    vec2 far = floor(vec2(uv.x / 1.9, uv.y / 2.0));
    vec3 speck = mix(c * 0.55, shirtColor(hash21(far + seed * 23.0)), 0.8);
    c = mix(speck, close, near);
    kitRough = 0.95;
  } else if (finish < 7.5) {
    // painel de patrocínio: uv = (ao longo, de 0 a 1 na altura), a linha do atlas vem na semente
    vec2 q = vec2(uv.x, (seed + clamp(uv.y, 0.015, 0.985)) / uBrandRows);
    c = texture2D(uBrands, q).rgb * (0.86 + 0.18 * grime);
    kitRough = 0.5;
  } else if (finish < 8.5) {
    c *= 0.86 + 0.2 * grime;
    kitRough = 0.42;
    kitMetal = 0.72;
  } else if (finish < 9.5) {
    // vidro: reflete o céu, com montantes a cada módulo
    vec2 q = uv / vec2(2.4, 3.4);
    vec2 f = abs(fract(q) - 0.5);
    float mull = smoothstep(0.44, 0.48, max(f.x, f.y));
    c = mix(c, vec3(0.5, 0.52, 0.54), mull * lod(uv, 1.0 / 2.4));
    kitRough = mix(0.07, 0.5, mull);
    kitMetal = mix(0.75, 0.2, mull);
  } else if (finish < 10.5) {
    // cobertura em arcos: costelas brancas sobre painéis translúcidos, com uma abóbada de leve
    float rib = abs(fract(uv.x / 7.5) - 0.5);
    float bar = smoothstep(0.1, 0.05, rib);
    float near = lod(uv, 1.0 / 7.5);
    vec3 panel = c * vec3(0.86, 0.9, 0.92);
    c = mix(panel, c, mix(0.5, bar, near));
    c *= 0.92 + 0.12 * grime;
    float a = seed;
    vec2 V = vec2(-sin(a), cos(a));
    float across = clamp(uv.y, -1.0, 1.0);
    kitNormal = vec3(V.x, 0.0, V.y) * across * 0.5;
    kitRough = mix(0.34, 0.6, bar);
    kitMetal = 0.04;
  } else {
    kitGlow = c * 3.0;
    c *= 0.2;
  }
#endif
  diffuseColor.rgb = c;
}
`

const materials = new Map()

/**
 * Duas versões do mesmo material: a da cidade só tem os acabamentos de prédio. O compilador de
 * shader do Windows costuma executar todos os ramos de um `if`, então separar custa uma chamada
 * de desenho a mais e devolve milissegundos na vista geral, onde a cidade cobre muita tela.
 */
export function kitMaterial({ variant, brands, brandRows, envMap, noise }) {
  if (materials.has(variant)) return materials.get(variant)
  const material = atmospheric(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMap, envMapIntensity: 0.75, shadowSide: THREE.DoubleSide }), {
    key: `kit-${variant}`,
    uniforms: { uBrands: { value: brands }, uBrandRows: { value: brandRows }, uNoise: { value: noise } },
    vertexHead: 'attribute vec4 aKit; varying vec4 vKit;',
    vertexBody: 'vKit = aKit;',
    fragmentHead: KIT_FRAGMENT_HEAD,
    fragment: [
      ['#include <color_fragment>', KIT_COLOR],
      ['#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.05, kitRough - 0.4 * uWet);'],
      ['#include <metalnessmap_fragment>', 'float metalnessFactor = kitMetal;'],
      ['#include <normal_fragment_maps>', /* glsl */ `
        if (dot(kitNormal, kitNormal) > 0.0) {
          vec3 tx = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
          vec3 tz = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          normal = normalize(normal + tx * kitNormal.x + tz * kitNormal.z);
        }
      `],
      ['#include <emissivemap_fragment>', 'totalEmissiveRadiance += kitGlow;'],
    ],
  })
  if (variant === 'venue') material.defines = { ...material.defines, KIT_VENUE: 1 }
  materials.set(variant, material)
  return material
}

export function kitMesh(builder, options) {
  const geometry = builder.geometry()
  geometry.computeBoundingSphere() // o desenho precisa dela e não teria mais de onde calcular
  // Depois de enviados à GPU, ninguém mais lê estes dados: mantê-los ocuparia a memória em dobro.
  for (const attribute of Object.values(geometry.attributes)) {
    attribute.onUpload(() => {
      attribute.array = null
    })
  }
  const mesh = new THREE.Mesh(geometry, kitMaterial(options))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}
