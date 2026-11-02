// Painéis HTML: torre, direção de prova, bandeira, dica do mouse e simulação. O texto em HTML
// fica nítido em qualquer zoom, e o desenho da pista não precisa saber dele.

import { cornerName } from './circuit.js'
import { isWarming, lapsOf, MODES, race, setMode, simClear, simCpu, simOffline, simRestart } from './race.js'

const $ = (id) => document.getElementById(id)

const fmtBytes = (b) => (b == null ? '–' : b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GiB` : `${Math.round(b / 2 ** 20)} MiB`)
const fmtRate = (b) => (b == null ? '–' : b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MiB/s` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB/s` : `${Math.round(b)} B/s`)

// ------------------------------------------------------------------ direção de prova

const messages = []

export function addMessage(text) {
  messages.unshift({ at: new Date(), text })
  messages.length = Math.min(messages.length, 3)
  $('messages').replaceChildren(...messages.map((m) => {
    const li = document.createElement('li')
    const time = document.createElement('time')
    time.textContent = m.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const span = document.createElement('span')
    span.textContent = m.text
    li.append(time, span)
    return li
  }))
}

function setControl(id, value, unit, warn, bad) {
  const el = $(id)
  el.textContent = value == null ? '–' : `${Math.round(value)}${unit}`
  el.className = value == null ? '' : value >= bad ? 'bad' : value >= warn ? 'warn' : ''
}

function renderControl() {
  const host = race.host
  const live = $('live')
  const labels = {
    tailnet: ['AO VIVO', 'live'],
    publica: ['SEM NAS-PULSE', 'live is-off'],
    'sem-sinal': ['SINAL PERDIDO', 'live is-bad'],
    esperando: ['CONECTANDO', 'live is-off'],
  }
  const [text, cls] = labels[race.pulseState]
  live.textContent = text
  live.className = cls
  setControl('c-temp', host?.temp, '°C', 70, 80)
  setControl('c-cpu', host?.cpu, '%', 70, 90)
  setControl('c-ram', host?.ram, '%', 75, 85)
  setControl('c-swap', host?.swap, '%', 50, 80)
  const disk = (m) => host?.disks?.find((d) => d.mount === m)?.usedPercent
  setControl('c-root', disk('/'), '%', 80, 90)
  setControl('c-data', disk('/data'), '%', 80, 90)
  $('session').textContent =
    race.pulseState === 'publica'
      ? 'Só telemetria pública: sem CPU por serviço'
      : isWarming()
        ? 'Volta de apresentação: aprendendo o normal'
        : `Corrida · ${race.cars.size} carros`
}

function renderFlag() {
  const flag = $('flag')
  const tunnel = race.cars.get('cloudflared')
  const outs = [...race.cars.values()].filter((c) => c.state === 'out')
  let text = null
  let cls = ''
  if (race.pulseState === 'sem-sinal') {
    text = 'SINAL PERDIDO · SERVIDOR SEM RESPOSTA'
    cls = 'gray'
  } else if (race.telemetryLost) {
    text = 'TELEMETRIA PERDIDA · CORRIDA CONGELADA'
    cls = 'gray'
  } else if (tunnel?.state === 'out') {
    text = 'BANDEIRA VERMELHA · TÚNEL FORA DO AR'
    cls = 'red'
  } else if (outs.length) {
    text = `BANDEIRA AMARELA · ${outs.map((c) => cornerName(c.s).toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}`
    cls = 'yellow'
  }
  flag.hidden = !text
  if (text) {
    flag.textContent = text
    flag.className = `flag ${cls}`
  }
}

// ------------------------------------------------------------------ torre

const rowsEl = $('rows')
const rowEls = new Map()
export const focus = { car: null } // carro destacado pela torre ou pelo mouse

function rowFor(car) {
  let row = rowEls.get(car.name)
  if (row) return row
  const li = document.createElement('li')
  li.className = 'row'
  const pos = document.createElement('span')
  pos.className = 'pos'
  const strip = document.createElement('span')
  strip.className = 'strip'
  strip.style.background = car.team.color
  const code = document.createElement('span')
  code.className = 'code'
  code.textContent = car.code
  const mem = document.createElement('span')
  mem.className = 'mem'
  const fill = document.createElement('i')
  mem.append(fill)
  code.append(mem)
  const value = document.createElement('span')
  value.className = 'value'
  const laps = document.createElement('span')
  laps.className = 'laps'
  li.append(pos, strip, code, value, laps)
  li.addEventListener('mouseenter', () => {
    focus.car = car
    li.classList.add('is-focus')
  })
  li.addEventListener('mouseleave', () => {
    focus.car = null
    li.classList.remove('is-focus')
  })
  li.addEventListener('click', () => focus.onSelect?.(car))
  rowsEl.append(li)
  row = { li, pos, value, laps, fill }
  rowEls.set(car.name, row)
  return row
}

export function renderTower() {
  // OUT vai para o fim, como na classificação de verdade.
  const ranked = [...race.cars.values()].sort((a, b) => (a.state === 'out') - (b.state === 'out') || b.dist - a.dist)
  const height = rowsEl.clientHeight / Math.max(1, ranked.length)
  ranked.forEach((car, i) => {
    const row = rowFor(car)
    const d = car.data
    row.li.style.height = `${height}px`
    row.li.style.transform = `translateY(${Math.round(i * height)}px)`
    row.pos.textContent = String(i + 1)
    const boxing = car.state === 'toBox' || car.state === 'inPit'
    const noData = d.cpu == null && car.state !== 'out'
    row.li.classList.toggle('is-out', car.state === 'out')
    row.li.classList.toggle('is-box', boxing)
    row.li.classList.toggle('is-nodata', noData && !boxing)
    row.value.textContent = car.state === 'out' ? 'OUT' : car.state === 'inPit' ? 'PIT' : car.state === 'toBox' ? 'BOX' : noData ? 'SEM DADOS' : `${d.cpu.toFixed(1)}%`
    row.laps.textContent = String(lapsOf(car))
    const memRatio = d.memBytes != null ? Math.min(1, d.memBytes / (d.memLimitBytes ?? 512 * 2 ** 20)) : 0
    row.fill.style.width = `${memRatio * 100}%`
    row.fill.style.background = memRatio > 0.85 ? '#ff5a52' : memRatio > 0.65 ? '#ffd400' : '#cdd2d8'
  })
}

// ------------------------------------------------------------------ modo

function renderMode() {
  const m = MODES[race.mode]
  $('tower-title').textContent = m.title
  $('legend-speed').textContent = m.speed
  $('legend-front').textContent = m.front
  for (const key of Object.keys(MODES)) $(`mode-${key}`).setAttribute('aria-pressed', String(key === race.mode))
}

// ------------------------------------------------------------------ dica do mouse

const tip = $('tip')

export function showTip(car, x, y, stageRect) {
  if (!car) {
    tip.hidden = true
    return
  }
  const d = car.data
  const lines = [car.team.name]
  if (car.state === 'out') lines.push(`Offline · bateu em ${cornerName(car.s)}`)
  else if (car.state === 'toBox' || car.state === 'inPit') lines.push(`No box: ${car.pitReason}`)
  if (d.cpu != null) {
    lines.push(`CPU ${d.cpu.toFixed(1)}% de um núcleo`)
    lines.push(`Memória ${fmtBytes(d.memBytes)}${d.memLimitBytes ? ` de ${fmtBytes(d.memLimitBytes)}` : ''}`)
    lines.push(`Rede ↓ ${fmtRate(d.rxBps)} · ↑ ${fmtRate(d.txBps)}`)
  } else if (car.state !== 'out') lines.push('Sem métricas neste container')
  lines.push(`${lapsOf(car)} voltas · ${car.pitCount} reinícios na sessão`)
  const title = document.createElement('b')
  title.textContent = car.name
  tip.replaceChildren(title, ...lines.map((text) => {
    const span = document.createElement('span')
    span.textContent = text
    return span
  }))
  tip.style.borderLeftColor = car.team.color
  tip.style.left = `${Math.min(x + 14, stageRect.width - 290)}px`
  tip.style.top = `${Math.min(y + 14, stageRect.height - 130)}px`
  tip.hidden = false
}

// ------------------------------------------------------------------ simulação

function fillSimTargets() {
  $('sim-target').replaceChildren(...[...race.cars.values()].sort((a, b) => a.name.localeCompare(b.name)).map((car) => {
    const option = document.createElement('option')
    option.value = car.name
    option.textContent = car.name
    return option
  }))
}

// ------------------------------------------------------------------ início

export function setupUi() {
  race.onMessage = addMessage
  race.onRoster = fillSimTargets
  race.onUpdate = () => {
    renderControl()
    renderFlag()
    renderTower()
  }
  const target = () => $('sim-target').value
  $('sim-restart').addEventListener('click', () => simRestart(target()))
  $('sim-cpu').addEventListener('click', () => simCpu(target()))
  $('sim-off').addEventListener('click', () => {
    simOffline(target())
    renderFlag()
  })
  $('sim-clear').addEventListener('click', () => simClear(target()))
  for (const key of Object.keys(MODES)) {
    $(`mode-${key}`).addEventListener('click', () => {
      if (setMode(key)) {
        renderMode()
        renderTower()
      }
    })
  }
  renderMode()
  renderControl()
  addMessage('Sessão iniciada: carros no grid')
  new ResizeObserver(renderTower).observe(rowsEl)
  // Voltas e posições andam entre as leituras do feed.
  setInterval(renderTower, 500)
}
