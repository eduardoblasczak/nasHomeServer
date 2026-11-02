// Interlagos: cada container do nas-server é um carro, numa pista com o traçado medido. Aqui só
// se liga corrida, painéis e desenho. O 3D é o caminho normal; sem WebGL2, entra a versão 2D.

import { loadGeo } from './circuit.js'
import { applyData, race, signalLost, step } from './race.js'
import { addMessage, focus, setupUi, showTip } from './ui.js'

const params = new URLSearchParams(location.search)
const stage = document.getElementById('stage')
const loader = document.getElementById('loader')
const loaderText = document.getElementById('loader-text')

function supportsWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}

function connect() {
  const source = new EventSource('/events')
  source.onmessage = (message) => {
    try {
      applyData(JSON.parse(message.data).services)
    } catch (error) {
      console.error(error)
    }
  }
  source.onerror = () => signalLost()
}

// Medidor: ?fps mostra quadros por segundo, tempo de CPU e de GPU na tela.
function createMeter(gl) {
  const stats = { fps: 0, cpuMs: 0, gpuMs: null, frames: 0, worst: 0, samples: [] }
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
        if (el) {
          el.textContent = `${stats.fps.toFixed(0)} fps · CPU ${stats.cpuMs.toFixed(1)} ms${stats.gpuMs != null ? ` · GPU ${stats.gpuMs.toFixed(1)} ms` : ''} · pior ${stats.worst.toFixed(0)} ms`
        }
      }
    },
  }
}

// Perder o contexto do WebGL apaga o que foi cozido ao abrir (chão, céu, sombras). Acontece quando o
// driver reinicia ou o PC volta da suspensão: recarregar refaz tudo. Se repetir logo, fica no 2D.
function recoverFromContextLoss(canvas) {
  const KEY = 'interlagos-reinicios'
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

async function start3D() {
  const canvas = document.getElementById('track')
  document.getElementById('race').hidden = true
  recoverFromContextLoss(canvas)
  const { createRenderer3D } = await import('./render3d/index.js')
  loaderText.textContent = 'Carregando o circuito…'
  const geo = await loadGeo()
  const view = await createRenderer3D({
    canvas,
    stage,
    geo,
    onProgress: (text) => (loaderText.textContent = text),
    onHover: (car, x, y, rect) => {
      focus.hover = car
      showTip(car, x, y, rect)
    },
  })
  focus.onSelect = (car) => view.follow(car)

  const meter = createMeter(view.renderer.getContext())
  window.__interlagos = { view, race, meter }
  let last = performance.now()
  function loop(now) {
    const dt = Math.min(0.08, (now - last) / 1000)
    last = now
    const t0 = performance.now()
    step(dt)
    meter.begin()
    view.frame(dt, focus.car ?? focus.hover ?? null)
    meter.end(performance.now() - t0, dt)
    requestAnimationFrame(loop)
  }
  // Duas voltas de quadro antes de tirar o aviso: a primeira cozinha as sombras.
  view.frame(0.016, null)
  requestAnimationFrame(loop)
  await new Promise((resolve) => setTimeout(resolve, 60))
  loader.hidden = true
}

async function start2D() {
  const { startRenderer2D } = await import('./render2d.js')
  const geo = await loadGeo()
  loader.hidden = true
  startRenderer2D({ stage, geo })
  if (params.has('falha')) addMessage('O 3D reiniciou várias vezes: usando a versão 2D')
}

setupUi()
connect()

const want2D = params.get('modo') === '2d' || !supportsWebGL2()
try {
  if (want2D) await start2D()
  else await start3D()
} catch (error) {
  // Falha do 3D não pode deixar a tela vazia: cai para o 2D e avisa.
  console.error(error)
  addMessage('Falha no 3D: usando a versão 2D')
  try {
    await start2D()
  } catch (fallback) {
    console.error(fallback)
    loaderText.textContent = 'Não foi possível desenhar o circuito.'
  }
}
