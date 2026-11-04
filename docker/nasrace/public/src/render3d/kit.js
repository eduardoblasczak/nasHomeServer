// Peças de cenário: um construtor de malhas e um único material com vários acabamentos. Prédios,
// arquibancadas, barreiras e estruturas do GP ficam em poucas chamadas de desenho, e o detalhe sai
// do shader, em metros reais. Coordenadas do mundo: x = leste, y = altura, z = -norte.

import { atmospheric, THREE } from './common.js'

/** Acabamentos do material. O valor vai para a malha em `aKit.z`. */
export const FINISH = {
  PLAIN: 0, WALL: 1, TILE: 2, SLAB: 3, METAL: 4, MEMBRANE: 5, SEATS: 6, BOARD: 7, STEEL: 8, GLASS: 9, RIBS: 10, EMISSIVE: 11,
  LIVERY: 12, SCAFFOLD: 13, CONCRETE: 14, CANVAS: 15, EPOXY: 16, ROOFMARK: 17, OFFICE: 18, LIT: 19,
}

const color = new THREE.Color()

/** Cor linear [r, g, b] a partir de '#rrggbb'. */
export const rgb = (hex, k = 1) => {
  color.set(hex)
  return [color.r * k, color.g * k, color.b * k]
}

/** Mesma cor, mais clara ou mais escura. */
export const shade = (tint, k) => [tint[0] * k, tint[1] * k, tint[2] * k]

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

  /** Como `quad`, com uma cor em cada vértice: é o que dá a sombra suave na base das paredes. */
  quadShaded(a, b, c, d, tints, finish = 0, uv = NO_UV, seed = 0) {
    if (this.count + 6 > this.capacity) this.alloc(this.capacity * 2)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    this.vertex(a, nx, ny, nz, tints[0], finish, uv[0], seed)
    this.vertex(b, nx, ny, nz, tints[1], finish, uv[1], seed)
    this.vertex(c, nx, ny, nz, tints[2], finish, uv[2], seed)
    this.vertex(a, nx, ny, nz, tints[0], finish, uv[0], seed)
    this.vertex(c, nx, ny, nz, tints[2], finish, uv[2], seed)
    this.vertex(d, nx, ny, nz, tints[3], finish, uv[3], seed)
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

  /**
   * Sólido de revolução em torno de um eixo qualquer, com normais lisas: rodas, tanques, postes.
   * `profile` = [[raio, distância ao longo do eixo], ...], de `p0` para `p1`.
   */
  revolve(p0, p1, profile, sides, tint, finish = 0, seed = 0) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2]
    const len = Math.hypot(dx, dy, dz) || 1
    const ax = dx / len, ay = dy / len, az = dz / len
    const ref = Math.abs(ay) > 0.9 ? [1, 0, 0] : [0, 1, 0]
    let ux = ay * ref[2] - az * ref[1], uy = az * ref[0] - ax * ref[2], uz = ax * ref[1] - ay * ref[0]
    const ul = Math.hypot(ux, uy, uz) || 1
    ux /= ul; uy /= ul; uz /= ul
    // v = u x a: visto de p1, o anel corre no sentido anti-horário e as faces olham para fora
    const vx = uy * az - uz * ay, vy = uz * ax - ux * az, vz = ux * ay - uy * ax
    const point = (r, d, cs, sn) => [
      p0[0] + ax * d + (ux * cs + vx * sn) * r,
      p0[1] + ay * d + (uy * cs + vy * sn) * r,
      p0[2] + az * d + (uz * cs + vz * sn) * r,
    ]
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, d0] = profile[k]
      const [r1, d1] = profile[k + 1]
      // inclinação do perfil: é ela que decide para onde a normal aponta
      const sr = r1 - r0, sd = d1 - d0
      const sl = Math.hypot(sr, sd) || 1
      const nr = sd / sl, na = -sr / sl
      for (let i = 0; i < sides; i++) {
        const t0 = (i / sides) * Math.PI * 2, t1 = ((i + 1) / sides) * Math.PI * 2
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1)
        const n = (cs, sn) => [ax * na + (ux * cs + vx * sn) * nr, ay * na + (uy * cs + vy * sn) * nr, az * na + (uz * cs + vz * sn) * nr]
        const a = point(r0, d0, c0, s0), b = point(r0, d0, c1, s1), c = point(r1, d1, c1, s1), e = point(r1, d1, c0, s0)
        const na0 = n(c0, s0), nb0 = n(c1, s1)
        if (this.count + 6 > this.capacity) this.alloc(this.capacity * 2)
        const put = (p, q) => this.vertex(p, q[0], q[1], q[2], tint, finish, ZERO, seed)
        if (r0 > 0.001) {
          put(a, na0)
          put(c, nb0)
          put(b, nb0)
        }
        if (r1 > 0.001) {
          put(a, na0)
          put(e, na0)
          put(c, nb0)
        }
      }
    }
  }

  /** Polígono plano ou inclinado, sempre com a face para cima. `height(p)` dá a altura de cada ponto. */
  polygon(ring, height, tint, finish = 0, uvOf = null, seed = 0) {
    const h = (v) => (typeof height === 'function' ? height(v) : height)
    for (const [p, q, r] of triangulate(ring)) {
      this.tri([p[0], h(p), -p[1]], [q[0], h(q), -q[1]], [r[0], h(r), -r[1]], tint, finish, uvOf ? uvOf(p) : ZERO, uvOf ? uvOf(q) : ZERO, uvOf ? uvOf(r) : ZERO, seed)
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

/** Triângulos de um contorno do mapa, sempre com a face para cima. */
export const triangulate = (ring) =>
  THREE.ShapeUtils.triangulateShape(ring.map(([x, y]) => new THREE.Vector2(x, y)), []).map(([i, j, k]) => {
    const p = ring[i], q = ring[j], r = ring[k]
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) < 0 ? [p, r, q] : [p, q, r]
  })

/**
 * Sistema local de uma peça: caminhão, motorhome, garagem. `x` e `y` são do mapa, `angle` é para onde
 * a frente aponta no mapa. Na peça: +x é a frente, +y sobe e +z é a direita de quem olha para a frente.
 */
export class Frame {
  constructor(kit, x, y, height, angle) {
    this.kit = kit
    this.x = x
    this.y = y
    this.h = height
    this.c = Math.cos(angle)
    this.s = Math.sin(angle)
  }

  at(lx, ly, lz) {
    return [this.x + lx * this.c + lz * this.s, this.h + ly, -this.y - lx * this.s + lz * this.c]
  }

  /** Onde um ponto da peça cai no mapa: serve para colocar gente em volta dela. */
  map(lx, lz) {
    return [this.x + lx * this.c + lz * this.s, this.y + lx * this.s - lz * this.c]
  }

  /** Caixa de `x0` a `x1`, e assim por diante. `ao` escurece a base das faces laterais. */
  box(x0, x1, y0, y1, z0, z1, tint, { finish = 0, top = null, topFinish = null, seed = 0, ao = 1, uv = false, skip = '' } = {}) {
    const { kit } = this
    const p = (x, y, z) => this.at(x, y, z)
    const dark = ao === 1 ? tint : shade(tint, ao)
    const tints = [dark, dark, tint, tint]
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0
    const wall = (w) => (uv ? [[0, 0], [w, 0], [w, dy], [0, dy]] : NO_UV)
    if (!skip.includes('+z')) kit.quadShaded(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), tints, finish, wall(dx), seed)
    if (!skip.includes('-z')) kit.quadShaded(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), tints, finish, wall(dx), seed)
    if (!skip.includes('+x')) kit.quadShaded(p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), tints, finish, wall(dz), seed)
    if (!skip.includes('-x')) kit.quadShaded(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), tints, finish, wall(dz), seed)
    if (!skip.includes('top')) kit.quad(p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0), top ?? tint, topFinish ?? finish, uv || topFinish != null ? [[0, dz], [dx, dz], [dx, 0], [0, 0]] : NO_UV, seed)
  }

  /** Face plana em coordenadas da peça: quatro pontos [x, y, z], no sentido anti-horário visto de fora. */
  quad(a, b, c, d, tint, finish = 0, uv = NO_UV, seed = 0) {
    this.kit.quad(this.at(...a), this.at(...b), this.at(...c), this.at(...d), tint, finish, uv, seed)
  }

  tri(a, b, c, tint, finish = 0) {
    this.kit.tri(this.at(...a), this.at(...b), this.at(...c), tint, finish)
  }

  /**
   * Perfil (x, y) estendido de `z0` a `z1`: cabine, carroceria. O perfil corre no sentido anti-horário
   * visto de +z, e todos os pontos precisam enxergar o primeiro. `style(i)` muda a face do lado `i`.
   */
  prism(outline, z0, z1, tint, { finish = 0, style = null, skip = [], seed = 0 } = {}) {
    const [ox, oy] = outline[0]
    for (let i = 1; i < outline.length - 1; i++) {
      const [px, py] = outline[i], [qx, qy] = outline[i + 1]
      this.tri([ox, oy, z1], [px, py, z1], [qx, qy, z1], tint, finish)
      this.tri([ox, oy, z0], [qx, qy, z0], [px, py, z0], tint, finish)
    }
    for (let i = 0; i < outline.length; i++) {
      if (skip.includes(i)) continue
      const [px, py] = outline[i], [qx, qy] = outline[(i + 1) % outline.length]
      const s = style?.(i) ?? {}
      this.quad([px, py, z1], [px, py, z0], [qx, qy, z0], [qx, qy, z1], s.tint ?? tint, s.finish ?? finish, s.uv ?? NO_UV, s.seed ?? seed)
    }
  }

  bar(a, b, radius, tint, options) {
    this.kit.bar(this.at(...a), this.at(...b), radius, tint, options)
  }

  /** Cilindro de pé, de `y0` a `y1`, com topo. */
  column(lx, lz, y0, y1, radius, tint, sides = 8, finish = FINISH.STEEL) {
    this.kit.revolve(this.at(lx, y0, lz), this.at(lx, y1, lz), [[radius, 0], [radius, y1 - y0], [0.0005, y1 - y0]], sides, tint, finish)
  }

  /** Roda de caminhão: eixo em z, com pneu, banda e cubo. */
  wheel(lx, lz, radius, width, tire, hub) {
    const side = Math.sign(lz) || 1
    const a = this.at(lx, radius, lz - (side * width) / 2), b = this.at(lx, radius, lz + (side * width) / 2)
    this.kit.revolve(a, b, [[radius * 0.62, 0], [radius, 0.02], [radius, width - 0.02], [radius * 0.62, width]], 12, tire, FINISH.PLAIN)
    this.kit.revolve(a, b, [[radius * 0.62, width], [radius * 0.24, width - 0.05], [0.0005, width - 0.05]], 10, hub, FINISH.STEEL)
  }
}

// ------------------------------------------------------------------ material

const KIT_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vKit;
uniform sampler2D uBrands;
uniform sampler2D uNoise;
uniform float uBrandRows;
uniform float uCrowd;
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
    // parede: andares de 3 m contados do chão (a parede começa 1 m abaixo dele). Largura e proporção
    // das janelas mudam de prédio para prédio, e cada andar tem a sua linha de laje.
    float bay = 2.7 + fract(seed * 13.0) * 1.3;
    vec2 q = vec2(uv.x / bay + seed * 7.0, (uv.y - 1.0) / 3.0);
    vec2 id = floor(q);
    vec2 f = fract(q);
    float aa = fwidth(q.x) + fwidth(q.y);
    float near = lod(uv, 1.0 / 3.0);
    float wide = mix(0.2, 0.33, fract(seed * 29.0));
    float across = smoothstep(0.5 - wide - aa, 0.5 - wide + aa, f.x) * smoothstep(0.5 + wide + aa, 0.5 + wide - aa, f.x);
    float pane = across * smoothstep(0.34 - aa, 0.34 + aa, f.y) * smoothstep(0.82 + aa, 0.82 - aa, f.y);
    float who = hash21(id + seed * 91.0);
    float shown = pane * step(0.3, who) * near;
    // a base da parede é mais escura; o vidro reflete mais o céu na parte de cima
    c *= (0.84 + 0.2 * grime) * mix(0.7, 1.0, smoothstep(0.6, 3.2, uv.y));
    c *= 1.0 - 0.14 * near * smoothstep(0.03, 0.0, abs(f.y - 0.015)) * step(0.5, id.y);
    c = mix(c, mix(vec3(0.03, 0.045, 0.06), vec3(0.17, 0.22, 0.28), f.y), shown);
    // uma porta aqui e ali no térreo
    float door = near * step(abs(id.y), 0.5) * step(0.8, who) * smoothstep(0.34, 0.36, f.x) * smoothstep(0.66, 0.64, f.x) * smoothstep(0.76, 0.74, f.y);
    c = mix(c, vec3(0.09, 0.065, 0.05), door);
    kitRough = mix(0.92, 0.3, shown);
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
    float seam = smoothstep(0.965, 0.995, edge);
    vec2 U = vec2(cos(a), sin(a)), V = vec2(-sin(a), cos(a));
    vec2 slope = f * 0.42 * (1.0 - seam);
    vec2 world = U * slope.x + V * slope.y;
    kitNormal = vec3(world.x, 0.0, world.y);
    c *= 0.92 + 0.1 * grime;
    c = mix(c, c * 0.62, seam * lod(uv, 1.0 / 19.0));
    // sujeira escorre para as calhas
    c = mix(c, c * vec3(0.8, 0.77, 0.7), smoothstep(0.5, 1.0, edge) * (0.3 + 0.5 * big.g));
    kitRough = 0.68;
  } else if (finish < 6.5) {
    // arquibancada: uv = (metros ao longo, número da fileira). De perto, as pessoas são malha (people.js)
    // e aqui ficam as cadeiras. De longe, um pontilhado de cores faz o papel delas.
    vec2 q = vec2(uv.x / 0.52, uv.y);
    vec2 f = fract(q);
    float near = lod(uv, 1.0 / 0.52);
    float one = smoothstep(0.05, 0.1, f.x) * smoothstep(0.95, 0.9, f.x);
    float pan = one * smoothstep(0.34, 0.4, f.y) * smoothstep(0.86, 0.82, f.y);
    float rest = one * smoothstep(0.86, 0.9, f.y);
    vec3 floorTone = vec3(0.26, 0.255, 0.24) * (0.8 + 0.35 * grime);
    vec3 chairs = mix(floorTone, c * 0.85, pan);
    chairs = mix(chairs, c * 1.15, rest);
    chairs = mix(mix(floorTone, c, 0.55), chairs, near);
    vec2 far = floor(vec2(uv.x / 1.1, uv.y));
    float who = hash21(far + seed * 23.0);
    vec3 speck = shirtColor(who) * (0.7 + 0.3 * hash21(far.yx + seed * 7.0));
    // alguns blocos ainda vazios, com a cor das cadeiras
    speck = mix(speck, c * 0.6, smoothstep(0.62, 0.86, big.b) * 0.7);
    c = mix(speck, chairs, uCrowd);
    kitRough = 0.9;
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
    // vidro: reflete o céu e deixa ver o forro aceso lá dentro, com montantes a cada módulo
    vec2 q = uv / vec2(2.4, 3.4);
    vec2 g = fract(q);
    vec2 f = abs(g - 0.5);
    float near = lod(uv, 1.0 / 2.4);
    float mull = smoothstep(0.455, 0.48, max(f.x, f.y)) * near;
    float lit = hash21(floor(q) + seed * 51.0);
    vec3 sky = mix(vec3(0.34, 0.44, 0.54), vec3(0.1, 0.14, 0.17), g.y);
    // vidro escuro (para-brisa) reflete pouco; o de fachada, bem mais
    float clear = clamp((c.r + c.g + c.b) * 1.2, 0.18, 1.0);
    vec3 inside = vec3(0.55, 0.48, 0.36) * step(0.55, lit) * smoothstep(0.7, 0.95, g.y) * near * clear;
    c = mix(c * 0.35 + sky * 0.8 * clear + inside, vec3(0.52, 0.54, 0.56), mull);
    kitRough = mix(0.12, 0.5, mull);
    kitMetal = mix(0.2, 0.3, mull);
  } else if (finish < 10.5) {
    // cobertura em arcos: costelas brancas sobre painéis translúcidos, com uma abóbada de leve
    float rib = abs(fract(uv.x / 7.5) - 0.5);
    float bar = smoothstep(0.1, 0.05, rib);
    float near = lod(uv, 1.0 / 7.5);
    vec3 panel = c * vec3(0.8, 0.86, 0.9);
    c = mix(panel, c, mix(0.5, bar, near));
    c *= 0.9 + 0.14 * grime;
    float a = seed;
    vec2 V = vec2(-sin(a), cos(a));
    float across = clamp(uv.y, -1.0, 1.0);
    // claraboia ao longo da cumeeira, e a calha mais suja nas bordas
    float ridge = smoothstep(0.17, 0.14, abs(across));
    c = mix(c, mix(vec3(0.14, 0.2, 0.25), vec3(0.72), smoothstep(0.42, 0.47, abs(fract(uv.x / 3.75) - 0.5)) * near), ridge);
    c *= 1.0 - 0.3 * smoothstep(0.82, 1.0, abs(across));
    kitNormal = vec3(V.x, 0.0, V.y) * across * 0.5;
    kitRough = mix(0.34, 0.6, bar);
    kitMetal = 0.04;
  } else if (finish < 11.5) {
    kitGlow = c * 3.0;
    c *= 0.2;
  } else if (finish < 12.5) {
    // pintura de caminhão: verniz que reflete o céu
    c *= 0.95 + 0.08 * grime;
    kitRough = 0.2;
    kitMetal = 0.25;
  } else if (finish < 13.5) {
    // andaime: tubos a cada 2,5 m por 2 m, com uma diagonal a cada dois vãos e o escuro por trás
    vec2 q = uv / vec2(2.5, 2.0);
    vec2 g = fract(q);
    vec2 f = abs(g - 0.5);
    float near = lod(uv, 1.0 / 2.5);
    float tubes = max(smoothstep(0.45, 0.48, f.x), smoothstep(0.45, 0.48, f.y));
    float flipped = step(0.5, fract(floor(q.x) * 0.5 + floor(q.y) * 0.5));
    float diagonal = smoothstep(0.05, 0.02, abs(mix(g.x, 1.0 - g.x, flipped) - g.y));
    float steel = max(tubes, diagonal) * near + (1.0 - near) * 0.34;
    c = mix(vec3(0.018, 0.02, 0.024), c * (0.85 + 0.2 * grime), steel);
    kitRough = 0.5;
    kitMetal = 0.45 * steel;
  } else if (finish < 14.5) {
    // concreto aparente: juntas de fôrma, escorridos de chuva
    vec4 rain = texture2D(uNoise, vec2(uv.x / 11.0 + seed, uv.y / 70.0));
    c *= (0.74 + 0.42 * grime) * (0.86 + 0.26 * rain.r);
    vec2 j = abs(fract(uv / vec2(6.0, 3.0)) - 0.5);
    c *= 1.0 - 0.3 * smoothstep(0.485, 0.5, max(j.x, j.y)) * lod(uv, 1.0 / 3.0);
    kitRough = 0.92;
  } else if (finish < 15.5) {
    // lona de tenda: gomos de 5 m, com o tecido caindo entre as treliças
    float bay = abs(fract(uv.x / 5.0) - 0.5) * 2.0;
    float near = lod(uv, 1.0 / 5.0);
    c *= mix(1.0, 0.84 + 0.18 * (1.0 - bay * bay), near);
    c = mix(c, c * 0.6, smoothstep(0.94, 0.985, bay) * near);
    c *= 0.93 + 0.1 * grime;
    kitRough = 0.72;
  } else if (finish < 16.5) {
    // piso de garagem: epóxi claro, com marcas de pneu e de carrinho, iluminado pelo forro
    c *= 0.9 + 0.14 * grime;
    c = mix(c, c * 0.6, smoothstep(0.6, 0.78, small.r) * 0.32);
    kitGlow = c * 0.3;
    kitRough = 0.42;
  } else if (finish < 17.5) {
    // letreiro pintado no telhado: o atlas só diz onde há tinta
    vec3 ink = texture2D(uBrands, vec2(uv.x, (seed + clamp(uv.y, 0.015, 0.985)) / uBrandRows)).rgb;
    float red = smoothstep(0.1, 0.4, ink.r - ink.g);
    float mark = smoothstep(0.16, 0.5, max(ink.r, max(ink.g, ink.b)));
    c *= 0.84 + 0.22 * grime;
    c = mix(c, mix(vec3(0.028, 0.03, 0.04), vec3(0.6, 0.03, 0.02), red), mark);
    kitRough = 0.58;
  } else if (finish > 18.5) {
    // interior aceso: a luz daqui não depende do sol
    kitGlow = c * 0.42;
    c *= 0.8 + 0.2 * grime;
  } else {
    // fachada de escritório: fitas de janela por andar, com montantes
    vec2 q = uv / vec2(1.8, 3.8);
    vec2 f = fract(q);
    float near = lod(uv, 1.0 / 1.8);
    float band = smoothstep(0.24, 0.26, f.y) * smoothstep(0.86, 0.84, f.y);
    float mull = 1.0 - smoothstep(0.0, 0.06, min(f.x, 1.0 - f.x));
    vec3 sky = mix(vec3(0.2, 0.27, 0.34), vec3(0.05, 0.07, 0.09), f.y);
    c *= 0.84 + 0.22 * grime;
    c = mix(c, mix(sky, c * 0.8, mull * near), band * mix(0.55, 1.0, near));
    kitRough = mix(0.86, 0.22, band);
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
