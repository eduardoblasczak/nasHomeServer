// NasRace: cada container do nas-server é um carro em Interlagos, numa pista com o traçado medido.
// Aqui só se liga corrida, painéis e desenho. O 3D é o caminho normal; sem WebGL2, entra a versão 2D.

import { loadGeo } from './circuit.js'
import { startFeed } from './feed.js'
import { applyPulse, race, signalLost, step } from './race.js'
import { addMessage, focus, selectCar, setupUi, showTip } from './ui.js'

const params = new URLSearchParams(location.search)
const stage = document.getElementById('stage')
// ?qualidade=baixa fixa um nível e desliga o ajuste automático
const FIXED_QUALITY = ['alta', 'media', 'baixa', 'minima'].indexOf(params.get('qualidade'))
const AUTO_QUALITY = FIXED_QUALITY < 0
const SLOW_FRAME_MS = 11
const loader = document.getElementById('loader')
const loaderText = document.getElementById('loader-text')

// Placa simulada por software não dá conta do 3D. Integrada ou de celular dá, com menos memória.
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|basic render/i
const WEAK_GPU = /intel|uhd|iris|radeon\(tm\) graphics|vega \d/i

function probeGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const probe = {
      name: String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      // a cena é desenhada em HDR: sem isto, a tela sairia preta
      hdr: Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')),
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return probe
  } catch {
    return null
  }
}

// Chão e sombras são cozidos uma vez, ao abrir, então o tamanho deles precisa ser decidido antes:
// o ajuste automático de qualidade não devolve essa memória depois. ?carga=leve|cheia fixa a escolha.
function isWeak(gpu) {
  if (params.has('carga')) return params.get('carga') === 'leve'
  return matchMedia('(pointer: coarse)').matches || WEAK_GPU.test(gpu.name) || navigator.deviceMemory <= 4 || gpu.maxTexture < 8192
}

// Medidor: ?fps mostra quadros por segundo, tempo de CPU e de GPU na tela.
function createMeter(gl, view, load) {
  const stats = { fps: 0, cpuMs: 0, gpuMs: null, frames: 0, worst: 0, samples: [], slow: 0, quality: view.quality(), load }
  const ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2')
  const queries = []
  let active = null
  let el = null
  if (params.has('fps')) {
    el = document.createElement('div')
    el.className = 'fps-meter'
    stage.append(el)
  }
  let windowStart = performance.now()
  let windowFrames = 0
  let cpuSum = 0
  let worst = 0
  return {
    stats,
    begin() {
      if (ext && !active && queries.length < 4) {
        active = gl.createQuery()
        gl.beginQuery(ext.TIME_ELAPSED_EXT, active)
      }
    },
    end(cpu, dt) {
      if (active) {
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        queries.push(active)
        active = null
      }
      while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = queries.shift()
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) stats.gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6
        gl.deleteQuery(q)
      }
      windowFrames++
      cpuSum += cpu
      worst = Math.max(worst, dt)
      const now = performance.now()
      if (now - windowStart >= 1000) {
        stats.fps = (windowFrames * 1000) / (now - windowStart)
        stats.cpuMs = cpuSum / windowFrames
        stats.worst = worst * 1000
        stats.samples.push(Math.round(stats.fps))
        if (stats.samples.length > 120) stats.samples.shift()
        windowStart = now
        windowFrames = 0
        cpuSum = 0
        worst = 0
        // Abaixo de 55 quadros, e por culpa do desenho, desce um nível de qualidade. O tempo de GPU e
        // de CPU separa isso de outros motivos, como a aba em segundo plano ou uma tela de 30 Hz.
        const heavy = stats.cpuMs > SLOW_FRAME_MS || stats.gpuMs == null || stats.gpuMs > SLOW_FRAME_MS
        stats.slow = !document.hidden && stats.fps < 55 && heavy ? stats.slow + 1 : 0
        if (stats.slow >= 3 && AUTO_QUALITY) {
          stats.slow = 0
          if (view.lowerQuality()) stats.quality = view.quality()
        }
        if (el) {
          el.textContent = `${stats.fps.toFixed(0)} fps · CPU ${stats.cpuMs.toFixed(1)} ms${stats.gpuMs != null ? ` · GPU ${stats.gpuMs.toFixed(1)} ms` : ''} · pior ${stats.worst.toFixed(0)} ms · qualidade ${stats.quality} · carga ${stats.load}`
        }
      }
    },
  }
}

// Perder o contexto do WebGL apaga o que foi cozido ao abrir (chão, céu, sombras). Acontece quando o
// driver reinicia ou o PC volta da suspensão: recarregar refaz tudo. Se repetir logo, fica no 2D.
function recoverFromContextLoss(canvas) {
  const KEY = 'nasrace-reinicios'
  let timer = 0
  const restart = () => {
    let recent = []
    try {
      recent = JSON.parse(sessionStorage.getItem(KEY) ?? '[]').filter((t) => Date.now() - t < 120_000)
      recent.push(Date.now())
      sessionStorage.setItem(KEY, JSON.stringify(recent))
    } catch {
      // sem armazenamento, só não há como contar as repetições
    }
    if (recent.length > 2) location.replace(`${location.pathname}?modo=2d&falha=1`)
    else location.reload()
  }
  canvas.addEventListener('webglcontextlost', () => {
    loader.hidden = false
    loaderText.textContent = 'O navegador reiniciou o 3D. Recarregando…'
    // nem sempre o contexto volta sozinho
    timer = setTimeout(restart, 5000)
  })
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(timer)
    restart()
  })
}

async function start3D(gpu) {
  const canvas = document.getElementById('track')
  document.getElementById('race').hidden = true
  recoverFromContextLoss(canvas)
  const { createRenderer3D, LOADS } = await import('./render3d/index.js')
  const weak = isWeak(gpu)
  loaderText.textContent = 'Carregando o circuito…'
  const geo = await loadGeo()
  const view = await createRenderer3D({
    canvas,
    stage,
    geo,
    quality: AUTO_QUALITY ? (weak ? 1 : 0) : FIXED_QUALITY,
    load: weak ? LOADS.leve : LOADS.cheia,
    onProgress: (text) => (loaderText.textContent = text),
    onHover: (car, x, y, rect) => {
      focus.hover = car
      showTip(car, x, y, rect)
    },
  })
  focus.onSelect = (car) => view.follow(car)

  const meter = createMeter(view.renderer.getContext(), view, weak ? 'leve' : 'cheia')
  window.__nasrace = { view, race, meter }
  let last = performance.now()
  function loop(now) {
    const dt = Math.min(0.08, (now - last) / 1000)
    last = now
    const t0 = performance.now()
    step(dt)
    meter.begin()
    view.frame(dt, focus.car ?? focus.hover ?? focus.selected)
    meter.end(performance.now() - t0, dt)
    // A roda do mouse ou um arraste largam o carro seguido: o cartão fixo acompanha.
    if (focus.selected && !view.rig.state.follow) selectCar(null)
    requestAnimationFrame(loop)
  }
  // Duas voltas de quadro antes de tirar o aviso: a primeira cozinha as sombras.
  view.frame(0.016, null)
  requestAnimationFrame(loop)
  await new Promise((resolve) => setTimeout(resolve, 60))
  loader.hidden = true
}

async function start2D() {
  // a versão 2D não tem o pórtico: larga sem a sequência de luzes
  race.racing = true
  const { startRenderer2D } = await import('./render2d.js')
  const geo = await loadGeo()
  loader.hidden = true
  startRenderer2D({ stage, geo })
  if (params.has('falha')) addMessage('O 3D não funcionou neste aparelho: usando a versão 2D')
}

setupUi()
startFeed({ onData: applyPulse, onLost: signalLost })

const gpu = probeGpu()
const want2D = params.get('modo') === '2d' || !gpu?.hdr || (SOFTWARE_GPU.test(gpu.name) && params.get('modo') !== '3d')
try {
  if (want2D) await start2D()
  else await start3D(gpu)
} catch (error) {
  console.error(error)
  // Falha do 3D não pode deixar a tela vazia. O canvas dele já tem contexto WebGL e não aceita mais o
  // desenho 2D, então a página abre de novo direto na versão de reserva.
  if (want2D) loaderText.textContent = 'Não foi possível desenhar o circuito.'
  else location.replace(`${location.pathname}?modo=2d&falha=1`)
}
