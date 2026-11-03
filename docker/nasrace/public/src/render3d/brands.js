// Patrocínios: só os projetos do próprio servidor, nada de marca de terceiros. Cada marca é uma
// linha de um atlas (proporção 8:1), que placas, pórticos e telhados leem pelo mesmo material.
// Draft e Vô Alberto usam o logo de verdade; as demais são desenhadas aqui, com a fonte do site.

import { THREE } from './common.js'

export const BRAND_ROWS = 8
export const BRAND = { NASRACE: 0, DRAFT: 1, FINANCE: 2, PORTFOLIO: 3, VOALBERTO: 4, SERVER: 5, PULSE: 6, ARENA: 7 }

const ROW_W = 2048
const ROW_H = 256

export const FONT = '"Barlow Condensed"'

/** `seed` do acabamento BOARD para uma marca: o atlas conta as linhas de baixo para cima. */
export const boardSeed = (brand) => BRAND_ROWS - 1 - brand

const loadImage = (name) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = new URL(`../../brands/${name}`, import.meta.url).href
  })

/** Espera a fonte: canvas não troca de fonte depois de desenhar. */
export async function loadBrandFont() {
  await Promise.all([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`600 64px ${FONT}`)])
}

const slanted = (g, x, y, draw) => {
  g.save()
  g.transform(1, 0, -0.2, 1, x, y)
  draw()
  g.restore()
}

function nasrace(g) {
  g.fillStyle = '#0d0f12'
  g.fillRect(0, 0, ROW_W, ROW_H)
  for (const x of [190, 1210]) {
    slanted(g, x, 0, () => {
      g.fillStyle = '#e10600'
      for (let k = 0; k < 3; k++) g.fillRect(k * 40, 56, 24, 144)
      g.fillStyle = '#ffffff'
      g.font = `700 196px ${FONT}`
      g.textBaseline = 'middle'
      g.fillText('NASRACE', 142, 136)
    })
  }
}

function drawLogoRow(g, image, bg, height) {
  g.fillStyle = bg
  g.fillRect(0, 0, ROW_W, ROW_H)
  const w = (image.width / image.height) * height
  for (const cx of [ROW_W * 0.25, ROW_W * 0.75]) g.drawImage(image, cx - w / 2, (ROW_H - height) / 2, w, height)
}

function nasfinance(g) {
  g.fillStyle = '#0b1f17'
  g.fillRect(0, 0, ROW_W, ROW_H)
  for (const x of [170, 1190]) {
    g.save()
    g.translate(x, 38)
    g.scale(5.6, 5.6)
    for (const [fill, path] of [['#4ee8a4', 'M16 2 29 9.5 16 17 3 9.5Z'], ['#25d98a', 'M3 9.5 16 17V31L3 23.5Z'], ['#169a62', 'M29 9.5 16 17V31L29 23.5Z']]) {
      g.fillStyle = fill
      g.fill(new Path2D(path))
    }
    g.restore()
    g.font = `600 176px ${FONT}`
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.fillText('nas', x + 200, 132)
    const w = g.measureText('nas').width
    g.fillStyle = '#4ee8a4'
    g.fillText('Finance', x + 200 + w, 132)
  }
}

function wordmark(bg, fg, text, draw) {
  return (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, ROW_W, ROW_H)
    g.font = `700 186px ${FONT}`
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    const half = g.measureText(text).width / 2
    for (const cx of [ROW_W * 0.25, ROW_W * 0.75]) {
      // o ícone fica à esquerda da palavra, e o conjunto continua centrado
      const shift = draw ? 60 : 0
      draw?.(g, cx + shift - half - 150)
      g.fillStyle = fg
      g.fillText(text, cx + shift, 134)
    }
    g.textAlign = 'left'
  }
}

function serverIcon(g, cx) {
  const x = cx
  g.fillStyle = '#1a1d21'
  for (let k = 0; k < 3; k++) {
    g.fillRect(x, 56 + k * 52, 96, 40)
    g.fillStyle = '#18c964'
    g.fillRect(x + 72, 70 + k * 52, 12, 12)
    g.fillStyle = '#1a1d21'
  }
}

function pulseIcon(g, cx) {
  g.strokeStyle = '#ffffff'
  g.lineWidth = 12
  g.lineJoin = 'round'
  g.beginPath()
  const x = cx - 20
  g.moveTo(x, 130)
  g.lineTo(x + 34, 130)
  g.lineTo(x + 56, 70)
  g.lineTo(x + 84, 190)
  g.lineTo(x + 106, 130)
  g.lineTo(x + 140, 130)
  g.stroke()
}

export async function createBrandAtlas() {
  const [draft, voalberto] = await Promise.all([loadImage('draft.webp'), loadImage('voalberto.webp')])
  const c = document.createElement('canvas')
  c.width = ROW_W
  c.height = ROW_H * BRAND_ROWS
  const g = c.getContext('2d', { willReadFrequently: true })
  const rows = [
    nasrace,
    (l) => drawLogoRow(l, draft, '#931a36', ROW_H),
    nasfinance,
    wordmark('#f5c518', '#111111', 'ebls.com.br'),
    (l) => drawLogoRow(l, voalberto, '#231f1a', 224),
    wordmark('#e9edf2', '#14171a', 'nas-server', serverIcon),
    wordmark('#ff7a00', '#ffffff', 'nas-pulse', pulseIcon),
    wordmark('#1e63d6', '#ffffff', 'Agent Arena'),
  ]
  rows.forEach((draw, r) => {
    g.save()
    g.translate(0, r * ROW_H)
    g.beginPath()
    g.rect(0, 0, ROW_W, ROW_H)
    g.clip()
    draw(g)
    g.restore()
  })
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.anisotropy = 16
  return texture
}
