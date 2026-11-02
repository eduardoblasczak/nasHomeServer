// Estado da corrida: nenhum desenho aqui. Quem desenha lê `race.cars` e os demais campos.
//   velocidade = peso do serviço (CPU e memória, em escala logarítmica). O seletor da torre
//                define se quem mais consome anda mais rápido (padrão) ou mais lento
//   posição    = distância percorrida na sessão
//   rastro     = rede      box = reinício ou comportamento anormal
//   muro       = offline   equipe = sistema ao qual o container pertence
// Só o que é medido muda o estado dos carros.

import { at, cornerName, GARAGES, LENGTH, mod, N, PACE, pitAt, PIT_IN, PIT_LENGTH, PIT_OUT, racingOffset, STEP } from './circuit.js'

// ============================================================ equipes

export const TEAMS = {
  draft: { name: 'Draft', color: '#e8002d' },
  nextcloud: { name: 'Nextcloud', color: '#1e63d6' },
  finance: { name: 'nasFinance', color: '#16a34a' },
  portfolio: { name: 'Portfólio', color: '#f5c518' },
  voalberto: { name: 'Vô Alberto', color: '#8a3ffc' },
  monitor: { name: 'Monitoramento', color: '#ff7a00' },
  infra: { name: 'Infraestrutura', color: '#e9edf2' },
}

const DRIVERS = {
  'draft-web': ['DFW', 'draft'], 'draft-app': ['DFA', 'draft'], 'draft-mysql': ['DBD', 'draft'],
  'nextcloud-app': ['NXC', 'nextcloud'], 'nextcloud-db': ['NXD', 'nextcloud'], 'nextcloud-redis': ['RDS', 'nextcloud'],
  'nasfinance-app': ['FIN', 'finance'], 'nasfinance-db': ['FDB', 'finance'],
  'portfolio-web': ['POR', 'portfolio'], 'portfolio-telemetry': ['TEL', 'portfolio'],
  'voalberto-site': ['VOA', 'voalberto'],
  prometheus: ['PRM', 'monitor'], grafana: ['GRF', 'monitor'], cadvisor: ['CAD', 'monitor'], 'node-exporter': ['NOD', 'monitor'], 'nas-pulse': ['PLS', 'monitor'],
  cloudflared: ['CFD', 'infra'], adguardhome: ['ADG', 'infra'], 'nginx-proxy-manager': ['NPM', 'infra'], portainer: ['PTN', 'infra'], 'ai-memory': ['MEM', 'infra'],
}

const driver = (name) => DRIVERS[name] ?? [name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase(), 'infra']

// ============================================================ regras

const WARMUP_S = 300 // tempo para aprender o normal de cada serviço
const BOX_MIN_S = 10
const GRID_GAP = 8

/**
 * Peso de 0 a 1: quanto o serviço consome. CPU pesa mais porque muda a cada leitura; memória
 * mexe pouco, mas separa um serviço grande de um pequeno. Log nos dois, senão só o
 * maior consumidor se diferenciaria dos demais.
 */
export function weightOf(d) {
  const cpu = Math.min(1, Math.log10(1 + Math.max(0, d.cpu ?? 0)) / 2)
  const mem = Math.min(1, Math.log2(1 + (d.memBytes ?? 0) / (64 * 2 ** 20)) / 4)
  return 0.7 * cpu + 0.3 * mem
}

// O que o consumo faz com o carro. A escolha fica salva neste navegador.
export const MODES = {
  rapido: {
    title: 'QUEM MAIS CONSOME', speed: 'mais rápido', front: 'quem mais consome',
    lap: (weight) => 110 * (30 / 110) ** weight, // 110 s sem carga, 30 s no peso máximo
    grid: (weight) => -weight,
  },
  lento: {
    title: 'QUEM MENOS CONSOME', speed: 'mais lento', front: 'quem menos consome',
    lap: (weight) => 45 * 4 ** weight, // 45 s sem carga, 180 s no peso máximo
    grid: (weight) => weight,
  },
}

export const packetRate = (bps) => (bps ? Math.min(5, Math.log10(1 + bps / 256)) : 0)

// ============================================================ estado

function loadMode() {
  try {
    const saved = localStorage.getItem('interlagos-modo')
    if (MODES[saved]) return saved
  } catch {
    // armazenamento bloqueado: fica o padrão
  }
  return 'rapido'
}

export const race = {
  cars: new Map(),
  host: null,
  pulseState: 'esperando', // tailnet | publica | sem-sinal | esperando
  telemetryLost: false,
  rain: 0,
  mode: loadMode(),
  firstAt: null,
  overrides: new Map(), // nome -> { up?, cpu? }: só a simulação
  onMessage: () => {},
  onRoster: () => {},
  onUpdate: () => {},
}

let lastPulseAt = null
let lastSwap = null

const lapTime = (weight) => MODES[race.mode].lap(weight)
// Sem métrica não há o que classificar: anda no ritmo mais lento do modo e fica atrás dos medidos.
const slowestLap = () => Math.max(lapTime(0), lapTime(1))
const gridKey = (data) => (data.cpu == null ? Infinity : MODES[race.mode].grid(weightOf(data)))

export const isWarming = () => race.firstAt != null && (performance.now() - race.firstAt) / 1000 < WARMUP_S
const say = (text) => race.onMessage(text)

function gridSlot(car, index) {
  car.dist = -index * GRID_GAP
  car.s = mod(car.dist - 10)
  car.lane = car.laneTarget = index % 2 ? 3.2 : -3.2
  car.gridIndex = index
}

function newCar(name, index) {
  const [code, teamId] = driver(name)
  const car = {
    name, code, team: TEAMS[teamId], index,
    data: { name, up: true },
    dist: 0, s: 0, lane: 0, laneTarget: 0, gridIndex: index,
    state: 'run', // run | toBox | inPit | out
    pitDist: 0,
    boxAt: GARAGES.from + 6 + ((index % 21) + 0.5) * ((GARAGES.to - GARAGES.from - 12) / 21), // diante da garagem
    pitUntil: 0, pitReason: '', pitCount: 0,
    outAt: null, crashT: 0, crashFrom: 0, crashTo: 0,
    crashSide: index % 2 ? 1 : -1, crashSpin: (index % 2 ? 1 : -1) * 0.65,
    speed: 0, weight: null, baseline: null, hot: 0, started: null,
    x: 0, y: 0, z: 0, heading: 0,
  }
  gridSlot(car, index)
  placeOnTrack(car)
  race.cars.set(name, car)
  return car
}

// ============================================================ feed

export function applyData(services) {
  const pulse = services.pulseOk ? services.pulse : null
  const tel = services.telemetryOk ? services.telemetry : null
  if (pulse) {
    race.pulseState = 'tailnet'
    race.host = pulse.host
  } else if (tel) {
    race.pulseState = 'publica'
    race.host = { cpu: tel.cpu, ram: tel.ram, temp: tel.temp, disks: [] }
  } else {
    race.pulseState = services.pulseOk === null && services.telemetryOk === null ? 'esperando' : 'sem-sinal'
  }

  const list = pulse ? pulse.containers : tel ? tel.containers.map((c) => ({ name: c.name, up: c.up, cpu: null })) : null
  if (!list) {
    race.onUpdate()
    return
  }

  // Grid inicial: na ordem do modo escolhido; sem métrica, no fim.
  const cars = race.cars
  if (!cars.size) {
    ;[...list].sort((a, b) => gridKey(a) - gridKey(b)).forEach((c, i) => newCar(c.name, i))
    race.firstAt = performance.now()
    race.onRoster()
  }

  const fresh = pulse && pulse.generatedAt !== lastPulseAt
  if (pulse) lastPulseAt = pulse.generatedAt

  // Nem todos caem juntos: mais da metade fora é a medição que parou (cadvisor ou Prometheus).
  const seen = new Map(list.map((c) => [c.name, c]))
  const upCount = list.filter((c) => c.up).length
  const measuringBroke = Boolean(pulse && upCount < cars.size / 2)
  if (measuringBroke !== race.telemetryLost) {
    race.telemetryLost = measuringBroke
    if (measuringBroke) say('Telemetria perdida: a medição parou, não os serviços')
  }

  let added = false
  for (const c of list) {
    if (!cars.has(c.name)) {
      newCar(c.name, cars.size)
      added = true
    }
  }
  if (added) race.onRoster()

  for (const car of cars.values()) {
    const raw = seen.get(car.name)
    const sim = race.overrides.get(car.name)
    // Um container parado some das métricas depois de alguns minutos: o carro continua no muro.
    const data = { ...(raw ?? { name: car.name, up: pulse ? false : car.data.up }), ...(sim ?? {}) }
    car.data = data
    if (race.telemetryLost) continue

    if (data.up === false && car.state !== 'out') crash(car)
    if (data.up !== false && car.state === 'out') {
      car.state = 'toBox'
      car.pitReason = 'de volta'
      say(`${car.code} voltou ao ar: segue para o box`)
    }

    if (data.startedAt != null) {
      if (car.started != null && data.startedAt > car.started + 1) sendToBox(car, 'reiniciou')
      car.started = data.startedAt
    }

    if ((fresh || sim) && data.cpu != null && data.up !== false) {
      const warm = race.firstAt != null && !isWarming()
      // Normal de cada serviço: média lenta, que ignora o próprio pico enquanto ele dura.
      if (car.baseline == null) car.baseline = data.cpu
      const spiking = data.cpu > Math.max(car.baseline * 3, 5)
      if (!spiking) car.baseline += (data.cpu - car.baseline) * 0.017
      car.hot = spiking && (warm || sim?.cpu != null) ? car.hot + 1 : 0
      if (car.hot >= 2) sendToBox(car, `CPU ${data.cpu.toFixed(0)}%`)
    }
    if (data.memLimitBytes && data.memBytes / data.memLimitBytes > 0.85) sendToBox(car, 'memória no limite')
  }

  // Chuva: o sistema está apelando para o swap, ou a RAM está no limite.
  const host = race.host
  if (host?.swap != null && fresh) {
    const growing = lastSwap != null && host.swap > lastSwap + 0.05
    race.rain = Math.max(0, Math.min(1, race.rain + (growing ? 0.25 : -0.02)))
    lastSwap = host.swap
  }
  if (host?.ram > 85) race.rain = Math.max(race.rain, 0.6)

  race.onUpdate()
}

export function signalLost() {
  race.pulseState = 'sem-sinal'
  race.onUpdate()
}

function needsBox(car) {
  const d = car.data
  if (car.pitReason === 'reiniciou' || car.pitReason === 'de volta') return false
  if (d.memLimitBytes && d.memBytes / d.memLimitBytes > 0.85) return true
  return car.hot >= 2
}

export function sendToBox(car, reason) {
  if (car.state === 'out' || car.state === 'toBox' || car.state === 'inPit') return
  car.state = 'toBox'
  car.pitReason = reason
  car.pitCount += reason === 'reiniciou' ? 1 : 0
  say(`${car.code} chamado ao box: ${reason}`)
}

export function crash(car) {
  car.state = 'out'
  car.outAt = performance.now()
  car.crashT = 0
  const p = at(car.s)
  const width = car.crashSide > 0 ? p.left : p.right
  car.crashFrom = laneOffset(car)
  car.crashTo = car.crashSide * (width + 5)
  say(`${car.code} bateu em ${cornerName(car.s)}: serviço offline`)
}

// ============================================================ quadro a quadro

/** Linha de corrida mais a faixa do carro, sem sair da pista. */
function laneOffset(car) {
  const p = at(car.s)
  const line = racingOffset(car.s) * 0.8 + car.lane * 0.75
  return Math.max(-(p.right - 1.2), Math.min(p.left - 1.2, line))
}

function placeOnTrack(car) {
  const d = car.state === 'out' ? car.crashOffset ?? car.crashFrom : laneOffset(car)
  const p = at(car.s, d)
  const next = car.state === 'out' ? at(car.s + 5, d) : at(car.s + 5, laneOffsetAt(car, car.s + 5))
  car.x = p.x
  car.y = p.y
  car.z = p.z
  car.heading = Math.atan2(next.y - p.y, next.x - p.x)
  car.slope = (next.z - p.z) / 5
}

function laneOffsetAt(car, s) {
  const p = at(s)
  const line = racingOffset(s) * 0.8 + car.lane * 0.75
  return Math.max(-(p.right - 1.2), Math.min(p.left - 1.2, line))
}

export function step(dt) {
  const list = [...race.cars.values()]
  if (race.pulseState === 'sem-sinal' || race.telemetryLost) return // congela: não dá para saber o que está acontecendo

  for (const car of list) {
    const d = car.data
    const noData = d.cpu == null
    const targetWeight = weightOf(d)
    car.weight = car.weight == null ? targetWeight : car.weight + (targetWeight - car.weight) * Math.min(1, dt * 0.6)

    if (car.state === 'out') {
      car.crashT = Math.min(1, car.crashT + dt / 0.7)
      const k = 1 - (1 - car.crashT) ** 3
      car.crashOffset = car.crashFrom + (car.crashTo - car.crashFrom) * k
      placeOnTrack(car)
      car.heading += car.crashSpin * k
      continue
    }

    if (car.state === 'inPit') {
      const now = performance.now()
      const waiting = now < car.pitUntil || needsBox(car) || race.overrides.get(car.name)?.up === false
      if (car.pitDist >= car.boxAt - 0.5 && car.pitDist <= car.boxAt + 0.5 && waiting) {
        car.speed = 0
      } else {
        // Limite de velocidade só diante das garagens; o resto do pit lane é a longa saída.
        car.speed = car.pitDist > GARAGES.to || car.pitDist < GARAGES.from - 40 ? 55 : 22
        if (car.pitDist < car.boxAt && car.pitDist + car.speed * dt >= car.boxAt) {
          car.pitDist = car.boxAt
          car.pitUntil = now + BOX_MIN_S * 1000
        } else {
          car.pitDist += car.speed * dt
        }
        car.dist += car.speed * dt
      }
      if (car.pitDist >= PIT_LENGTH) {
        car.state = 'run'
        car.pitReason = ''
        car.hot = 0
        car.s = PIT_OUT
        say(`${car.code} voltou à pista`)
      } else {
        const p = pitAt(car.pitDist)
        car.x = p.x
        car.y = p.y
        car.z = p.z
        car.heading = Math.atan2(p.ty, p.tx)
        car.slope = 0
        continue
      }
    }

    const i = Math.floor(mod(car.s) / STEP) % N
    let v = (LENGTH / (noData ? slowestLap() : lapTime(car.weight))) * PACE[i]
    if (car.state === 'toBox') v = Math.max(v, 55 * PACE[i])
    const before = mod(car.s)
    car.s = mod(car.s + v * dt)
    car.dist += v * dt
    car.speed = v

    if (car.state === 'toBox') {
      const crossed = before <= PIT_IN ? before + v * dt >= PIT_IN : before + v * dt - LENGTH >= PIT_IN
      if (crossed) {
        car.state = 'inPit'
        car.pitDist = 0
        continue
      }
    }

    // Ultrapassagem: chegou perto de quem vai à frente, muda de lado.
    let ahead = Infinity
    for (const other of list) {
      if (other === car || other.state === 'inPit' || other.state === 'out') continue
      const gap = mod(other.s - car.s)
      if (gap < ahead && gap < 15 && Math.abs(other.lane - car.lane) < 2.4) ahead = gap
    }
    if (ahead < 15) car.laneTarget = car.laneTarget > 0 ? -3.2 : 3.2
    else if (Math.abs(car.laneTarget) > 0 && Math.random() < dt * 0.25) car.laneTarget = 0 // volta para a linha quando há espaço
    car.lane += (car.laneTarget - car.lane) * Math.min(1, dt * 1.2)
    placeOnTrack(car)
  }
}

// ============================================================ comandos

/** Voltas de um modo não comparam com as do outro: troca de modo é nova largada. */
export function setMode(next) {
  if (next === race.mode) return false
  race.mode = next
  try {
    localStorage.setItem('interlagos-modo', next)
  } catch {
    // sem armazenamento: vale só até recarregar a página
  }
  const ready = [...race.cars.values()].filter((car) => car.state === 'run').sort((a, b) => gridKey(a.data) - gridKey(b.data))
  ready.forEach((car, i) => {
    gridSlot(car, i)
    car.weight = null
    placeOnTrack(car)
  })
  // quem está no box ou no muro não volta ao grid, mas também não leva voltas antigas
  for (const car of race.cars.values()) if (car.state !== 'run') car.dist = -ready.length * GRID_GAP
  say(`Nova largada: quem mais consome anda ${MODES[next].speed}`)
  return true
}

export function simRestart(name) {
  const car = race.cars.get(name)
  if (!car) return
  sendToBox(car, 'reiniciou')
  say(`Simulação: ${car.code} reiniciou`)
}

export function simCpu(name) {
  const car = race.cars.get(name)
  if (!car) return
  race.overrides.set(name, { cpu: 95 })
  car.hot = 2
  sendToBox(car, 'CPU 95%')
  car.data = { ...car.data, cpu: 95 }
}

export function simOffline(name) {
  const car = race.cars.get(name)
  if (!car) return
  race.overrides.set(name, { up: false })
  car.data = { ...car.data, up: false }
  if (car.state === 'inPit') car.state = 'run'
  crash(car)
}

export function simClear(name) {
  race.overrides.delete(name)
  const car = race.cars.get(name)
  if (car) car.hot = 0
}

export const lapsOf = (car) => Math.max(0, Math.floor(car.dist / LENGTH))
export { PIT_LENGTH }
