// Painéis HTML: torre, direção de prova, bandeira, cartão do carro e simulação. O texto em HTML
// fica nítido em qualquer zoom, e o desenho da pista não precisa saber dele.

import { cornerName, LENGTH } from './circuit.js'
import { averageSpeed, isWarming, lapsOf, MODES, race, setMode, simClear, simCpu, simOffline, simRestart } from './race.js'

const $ = (id) => document.getElementById(id)

const fmtBytes = (b) => (b == null ? '–' : b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GiB` : `${Math.round(b / 2 ** 20)} MiB`)
const fmtRate = (b) => (b == null ? '–' : b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MiB/s` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB/s` : `${Math.round(b)} B/s`)
const fmtLap = (seconds) => (seconds == null ? '–' : seconds >= 60 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}` : `${seconds.toFixed(1)} s`)

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
    'ao-vivo': ['AO VIVO', 'live'],
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
  if (text && flag.textContent !== text) {
    flag.textContent = text
    flag.className = `flag ${cls}`
  }
}

// ------------------------------------------------------------------ torre

const rowsEl = $('rows')
const rowEls = new Map()
// `car`: destacado pelo mouse na torre; `hover`: sob o ponteiro na pista; `selected`: seguido.
export const focus = { car: null, hover: null, selected: null, onSelect: null }

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
  const fastest = document.createElement('i')
  fastest.className = 'fastest'
  fastest.title = 'Volta mais rápida da sessão'
  fastest.hidden = true
  code.append(fastest)
  const mem = document.createElement('span')
  mem.className = 'mem'
  const fill = document.createElement('i')
  mem.append(fill)
  code.append(mem)
  const value = document.createElement('span')
  value.className = 'value'
  const gap = document.createElement('span')
  gap.className = 'gap'
  li.append(pos, strip, code, value, gap)
  li.addEventListener('mouseenter', () => {
    focus.car = car
    li.classList.add('is-focus')
  })
  li.addEventListener('mouseleave', () => {
    focus.car = null
    li.classList.remove('is-focus')
  })
  li.addEventListener('click', () => selectCar(focus.selected === car ? null : car))
  rowsEl.append(li)
  row = { li, pos, value, gap, fill, fastest, rank: null }
  rowEls.set(car.name, row)
  return row
}

/** Intervalo para o líder: vem da corrida na tela, na velocidade média do próprio carro. */
function gapText(car, leader) {
  if (car.state === 'out') return 'OUT'
  if (car.state === 'inPit') return 'PIT'
  if (car.state === 'toBox') return 'BOX'
  if (car === leader) return 'LÍDER'
  const behind = leader.dist - car.dist
  if (behind >= LENGTH) return `+${Math.floor(behind / LENGTH)} V`
  const speed = averageSpeed(car)
  return speed > 0 ? `+${(behind / speed).toFixed(1)}` : '–'
}

function ranking() {
  // OUT vai para o fim, como na classificação de verdade.
  return [...race.cars.values()].sort((a, b) => (a.state === 'out') - (b.state === 'out') || b.dist - a.dist)
}

export function renderTower() {
  const ranked = ranking()
  const leader = ranked[0]
  const height = rowsEl.clientHeight / Math.max(1, ranked.length)
  ranked.forEach((car, i) => {
    const row = rowFor(car)
    const d = car.data
    row.li.style.height = `${height}px`
    row.li.style.transform = `translateY(${Math.round(i * height)}px)`
    row.pos.textContent = String(i + 1)
    // Mudou de posição: a linha pisca verde ou vermelho. Só depois da largada.
    if (row.rank != null && row.rank !== i && race.racing) {
      row.li.classList.remove('gained', 'lost')
      void row.li.offsetWidth
      row.li.classList.add(i < row.rank ? 'gained' : 'lost')
    }
    row.rank = i
    const boxing = car.state === 'toBox' || car.state === 'inPit'
    const noData = d.cpu == null && car.state !== 'out'
    row.li.classList.toggle('is-out', car.state === 'out')
    row.li.classList.toggle('is-box', boxing)
    row.li.classList.toggle('is-nodata', noData && !boxing)
    row.li.classList.toggle('is-leader', car === leader && !boxing && car.state !== 'out')
    row.li.classList.toggle('is-selected', car === focus.selected)
    row.value.textContent = car.state === 'out' ? '–' : noData ? 'SEM DADOS' : `${d.cpu.toFixed(1)}%`
    row.gap.textContent = gapText(car, leader)
    row.fastest.hidden = race.fastest?.car !== car
    const memRatio = d.memBytes != null ? Math.min(1, d.memBytes / (d.memLimitBytes ?? 512 * 2 ** 20)) : 0
    row.fill.style.width = `${memRatio * 100}%`
    row.fill.style.background = memRatio > 0.85 ? '#ff5a52' : memRatio > 0.65 ? '#ffd400' : '#cdd2d8'
  })
  const lap = leader ? lapsOf(leader) + 1 : 0
  const count = race.cars.size
  $('session').textContent = !race.racing
    ? `Grid · ${count} carros`
    : isWarming()
      ? `Volta ${lap} · aprendendo o normal de cada serviço`
      : `Volta ${lap} · ${count} carros`
  refreshCards(ranked, leader)
}

// ------------------------------------------------------------------ modo

function renderMode() {
  const m = MODES[race.mode]
  $('tower-title').textContent = m.title
  $('legend-speed').textContent = m.speed
  $('legend-front').textContent = m.front
  for (const key of Object.keys(MODES)) $(`mode-${key}`).setAttribute('aria-pressed', String(key === race.mode))
}

// ------------------------------------------------------------------ cartão do carro

function createCard(pinned) {
  const el = document.createElement('section')
  el.className = `car-card ${pinned ? 'is-pinned' : 'is-tip'}`
  el.hidden = true
  const head = document.createElement('div')
  head.className = 'card-head'
  const pos = document.createElement('span')
  pos.className = 'card-pos'
  const title = document.createElement('div')
  const code = document.createElement('div')
  code.className = 'card-code'
  const name = document.createElement('span')
  name.className = 'card-name'
  title.append(code, name)
  const state = document.createElement('span')
  state.className = 'card-state'
  head.append(pos, title, state)
  const grid = document.createElement('dl')
  grid.className = 'card-grid'
  const cells = {}
  for (const key of ['CPU', 'MEMÓRIA', 'REDE', 'VOLTAS', 'MELHOR', 'INTERVALO']) {
    const box = document.createElement('div')
    const dt = document.createElement('dt')
    dt.textContent = key
    const dd = document.createElement('dd')
    box.append(dt, dd)
    grid.append(box)
    cells[key] = dd
  }
  const note = document.createElement('p')
  note.className = 'card-note'
  el.append(head, grid, note)
  let release = null
  if (pinned) {
    release = document.createElement('button')
    release.className = 'card-release'
    release.type = 'button'
    release.textContent = 'Soltar a câmera'
    release.addEventListener('click', () => selectCar(null))
    el.append(release)
  }
  $('stage').append(el)
  return { el, pos, code, name, state, cells, note }
}

let tipCard = null
let pinnedCard = null

function fillCard(card, car, ranked, leader) {
  const d = car.data
  card.el.style.borderLeftColor = car.team.color
  card.pos.textContent = `P${ranked.indexOf(car) + 1}`
  card.code.textContent = car.code
  card.name.textContent = `${car.name} · ${car.team.name}`
  const noData = d.cpu == null && car.state !== 'out'
  const [text, kind] = car.state === 'out' ? ['OFFLINE', 'out'] : car.state === 'inPit' ? ['NO BOX', 'box'] : car.state === 'toBox' ? ['AO BOX', 'box'] : noData ? ['SEM DADOS', 'nodata'] : ['NA PISTA', 'ok']
  card.state.textContent = text
  card.state.dataset.state = kind
  card.cells.CPU.textContent = d.cpu != null ? `${d.cpu.toFixed(1)}%` : '–'
  card.cells['MEMÓRIA'].textContent = d.memBytes != null ? fmtBytes(d.memBytes) : '–'
  card.cells.REDE.textContent = d.rxBps != null ? fmtRate((d.rxBps ?? 0) + (d.txBps ?? 0)) : '–'
  card.cells.VOLTAS.textContent = String(lapsOf(car))
  card.cells.MELHOR.textContent = fmtLap(car.bestLap)
  card.cells.INTERVALO.textContent = gapText(car, leader)
  const note = car.state === 'out' ? `Bateu em ${cornerName(car.s)}` : car.state === 'toBox' || car.state === 'inPit' ? `Motivo: ${car.pitReason}` : car.pitCount ? `${car.pitCount} reinício${car.pitCount > 1 ? 's' : ''} na sessão` : ''
  card.note.textContent = note
  card.note.hidden = !note
}

function refreshCards(ranked, leader) {
  if (pinnedCard && focus.selected) fillCard(pinnedCard, focus.selected, ranked, leader)
  if (tipCard && !tipCard.el.hidden && tipCard.car) fillCard(tipCard, tipCard.car, ranked, leader)
}

export function showTip(car, x, y, stageRect) {
  tipCard ??= createCard(false)
  // Quem já está no cartão fixo não precisa de um segundo cartão.
  if (!car || car === focus.selected) {
    tipCard.el.hidden = true
    tipCard.car = null
    return
  }
  const ranked = ranking()
  tipCard.car = car
  fillCard(tipCard, car, ranked, ranked[0])
  tipCard.el.style.left = `${Math.min(x + 14, stageRect.width - 300)}px`
  tipCard.el.style.top = `${Math.min(y + 14, stageRect.height - 170)}px`
  tipCard.el.hidden = false
}

/** Segue um carro com a câmera e deixa o cartão dele fixo. `null` solta. */
export function selectCar(car) {
  focus.selected = car
  pinnedCard ??= createCard(true)
  pinnedCard.el.hidden = !car
  focus.onSelect?.(car)
  renderTower()
  // No celular o mapa fica acima da torre: quem toca numa linha lá de baixo precisa ver o carro.
  if (car && matchMedia('(max-width: 800px)').matches) $('stage').scrollIntoView()
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
