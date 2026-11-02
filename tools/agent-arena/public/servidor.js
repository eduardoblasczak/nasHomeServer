// Modo "Servidor": o protagonista é o nas-server. Cada container vira uma casa na
// avenida, cada grupo de serviços tem um zelador, e o que se mexe é medido:
//   - pacotes na avenida  = bytes/s de rede de cada container (cAdvisor)
//   - fumaça na chaminé   = CPU do container
//   - barra na parede     = memória (do limite, quando existe)
//   - usina, caixa d'água = CPU, RAM, swap e temperatura do host
//   - silos               = disco de / e /data
//   - puff + aviso no log = container reiniciou (start_time aumentou)
// Fonte: /api/pulse pela tailnet. Fora dela, só a telemetria pública: as casas
// acendem e apagam, mas sem pacotes nem fumaça — o mapa não inventa movimento.

export const SERVIDOR = {
  id: 'servidor',
  name: 'Servidor (nas-server)',
  subtitle: 'o nas-server por dentro, ao vivo',
  legend:
    'Cada casa é um container do nas-server. Pacotes na avenida são o tráfego de rede real de cada um; fumaça é CPU; a barra na parede é memória. Passe o mouse para ver os números.',
  roles: {
    gatekeeper: { label: 'Porteiro (cloudflared)', pal: { h: '#f48120', s: '#f1c9a5', e: '#1a1a1a', c: '#f48120', a: '#ffffff', p: '#2c3e66', b: '#3a2a1a' }, head: ['..hhhh..', 'hhhhhhhh'] },
    sentinel: { label: 'Sentinela (AdGuard)', pal: { h: '#68bc71', s: '#e9b48c', e: '#1a1a1a', c: '#2f7a45', a: '#c9e36b', p: '#26324a', b: '#2a2a2a' }, head: ['..hhhh..', '.hhhhhh.', '.hsssshh', '.hessesh'] },
    clerk: { label: 'Lojista (sites)', pal: { h: '#c0392b', s: '#f1c9a5', e: '#1a1a1a', c: '#f4f1ea', a: '#c0392b', p: '#3b4a6b', b: '#4a3426' }, head: ['..hhhh..', 'hhhhhhhh'], coat: ['.cccccc.', 'scacaccs', 'sccacacs', '.cccccc.'] },
    porter: { label: 'Estoquista (Nextcloud)', pal: { h: '#8a6a44', s: '#e9b48c', e: '#1a1a1a', c: '#2f6fb3', a: '#ffe14d', p: '#4a3a2a', b: '#3a2a1a' }, head: ['..hhhh..', '.hhhhhh.'] },
    scientist: { label: 'Cientista (observabilidade)', pal: { h: '#e8eef7', s: '#f1c9a5', e: '#1a1a1a', c: '#f4f4f4', a: '#e6522c', p: '#3b4a6b', b: '#2a2a2a' }, head: ['.hhhhh..', 'hhhhhhh.'], coat: ['.cccccc.', 'scccaccs', 'scccaccs', '.cccccc.'] },
    toll: { label: 'Cobrador (proxy)', pal: { h: '#ffb02e', s: '#e9b48c', e: '#1a1a1a', c: '#f07c1a', a: '#ffe14d', p: '#2c3e66', b: '#3a2a1a' }, head: ['..hhhh..', 'hhhhhhhh'] },
    foreman: { label: 'Capataz (administração)', pal: { h: '#3d5a80', s: '#f1c9a5', e: '#1a1a1a', c: '#7b52c9', a: '#f2d16b', p: '#2a2240', b: '#2a2a2a' }, head: ['...hh...', '.hhhhhh.'] },
  },
}

// ============================================================ mapa (em casas de 16 px)

const T = 16
const AVE_Y = 12 * T // linha central da avenida
const NORTH_ROW = 8 // casas do norte ocupam as linhas 8-9, porta para a calçada (10)
const SOUTH_ROW = 15 // casas do sul ocupam 15-16, porta para a rua do sul (17)
const NORTH_WALK = 10 * T + 13 // onde os zeladores do norte pisam
const SOUTH_WALK = 17 * T + 13
const SOUTH_STREET = 17 * T + 8

// Distritos: x inicial e quantas casas cabem. Uma casa = 2 casas de largura + 1 de vão.
const DISTRICTS = {
  dns: { name: 'Torre DNS', row: 'north', x: 5, slots: 1, roof: '#2f7a45', keeper: 'sentinel', about: 'Resolve os nomes da rede de casa e bloqueia anúncios e rastreadores.' },
  shops: { name: 'Comércio', row: 'north', x: 8, slots: 5, roof: '#c0392b', keeper: 'clerk', about: 'Os sites publicados: portfólio, Draft, Vô Alberto, nasFinance.' },
  storage: { name: 'Armazém', row: 'north', x: 23, slots: 3, roof: '#2f6fb3', keeper: 'porter', about: 'Nextcloud: arquivos, banco e cache.' },
  observ: { name: 'Observatório', row: 'north', x: 32, slots: 3, roof: '#e6522c', keeper: 'scientist', about: 'Prometheus, Grafana e os coletores que medem tudo isto.' },
  proxy: { name: 'Pedágio', row: 'south', x: 5, slots: 1, roof: '#f07c1a', keeper: 'toll', about: 'Nginx Proxy Manager. Desde 01/11 só responde pelo túnel.' },
  shops2: { name: 'Comércio', row: 'south', x: 8, slots: 3, roof: '#c0392b', keeper: 'clerk', about: 'Continuação do comércio: back-ends e bancos dos sites.' },
  admin: { name: 'Administração', row: 'south', x: 17, slots: 5, roof: '#5b3aa0', keeper: 'foreman', about: 'Portainer, ai-memory e o que não tem bairro próprio.' },
  observ2: { name: 'Observatório', row: 'south', x: 32, slots: 3, roof: '#e6522c', keeper: 'scientist', about: 'Mais coletores do observatório.' },
}

// Ordem de preferência: o primeiro distrito com vaga recebe o container.
const PLACEMENT = [
  [/^cloudflared$/, ['gate']],
  [/^adguard/, ['dns', 'admin']],
  [/^nginx-proxy-manager/, ['proxy', 'admin']],
  [/^nextcloud/, ['storage', 'admin']],
  [/^(prometheus|grafana|cadvisor|node-exporter|nas-pulse)/, ['observ', 'observ2', 'admin']],
  [/^(portfolio|draft|voalberto|nasfinance)/, ['shops', 'shops2', 'admin']],
  [/./, ['admin']],
]

// De onde vem o tráfego de cada um. Honesto quanto dá: o que é publicado no túnel
// recebe pelo portão; DNS e ai-memory, pela antena (rede de casa e tailnet);
// bancos, caches e coletores conversam só por dentro (o "hub" da avenida).
function sourceOf(name) {
  if (/^cloudflared$/.test(name)) return 'internet'
  if (/^(adguard|ai-memory)/.test(name)) return 'antenna'
  if (/(-db|mysql|redis|telemetry|node-exporter|cadvisor|prometheus|nas-pulse|draft-app)$/.test(name)) return 'hub'
  return 'gate'
}

const POINTS = {
  internet: { x: 8, y: AVE_Y },
  gate: { x: 4 * T + 8, y: AVE_Y },
  antenna: { x: 2 * T + 8, y: 18 * T },
  hub: { x: 21 * T, y: AVE_Y },
}

const LANDMARKS = {
  gate: { rect: [1, 9, 4, 7], name: 'Portão do túnel', about: 'cloudflared: a única entrada vinda da internet. Nenhuma porta aberta no roteador.' },
  tower: { rect: [5, 1, 3, 7], name: 'Torre DNS', about: 'AdGuard Home. A luz pisca com as consultas de DNS.' },
  warehouse: { rect: [23, 2, 9, 6], name: 'Armazém', about: 'Nextcloud. A porta acende quando há tráfego.' },
  observatory: { rect: [32, 1, 8, 7], name: 'Observatório', about: 'Prometheus. O telescópio gira com a CPU dele.' },
  antenna: { rect: [1, 17, 3, 6], name: 'Antena WiFi', about: 'Rede de casa e tailnet. O servidor está em WiFi: as barras seguem o tráfego.' },
  plant: { rect: [5, 18, 10, 6], name: 'Usina (host)', about: 'O nas-server em si: chaminé = CPU, caixa d’água = RAM, barril = swap, termômetro = temperatura.' },
  silos: { rect: [16, 18, 6, 6], name: 'Silos', about: 'Disco: / (sistema e imagens Docker) e /data (dados).' },
}

function slotRect(district, index) {
  const d = DISTRICTS[district]
  const x = (d.x + index * 3) * T
  const y = (d.row === 'north' ? NORTH_ROW : SOUTH_ROW) * T
  return { x, y, w: 2 * T, h: 2 * T, door: { x: x + T, y: y + 2 * T }, gapX: x + 2 * T + 8 }
}

function routeTo(house, from) {
  const start = POINTS[from]
  const { door, gapX } = house
  if (from === 'internet') return [start, POINTS.gate]
  if (house.row === 'north') {
    // da avenida sobe direto até a porta
    return [start, { x: start.x, y: AVE_Y }, { x: door.x, y: AVE_Y }, { x: door.x, y: door.y + 2 }]
  }
  // para o sul: desce pelo vão ao lado da casa até a rua, e volta até a porta
  return [start, { x: start.x, y: AVE_Y }, { x: gapX, y: AVE_Y }, { x: gapX, y: SOUTH_STREET }, { x: door.x, y: SOUTH_STREET }, { x: door.x, y: door.y + 2 }]
}

// A casa tem 48 px contando o vão: nome inteiro encavala no vizinho. O nome completo fica na dica do mouse.
const SHORT_NAMES = {
  adguardhome: 'adguard', 'nginx-proxy-manager': 'npm', 'draft-app': 'draft api', 'draft-web': 'draft', 'draft-mysql': 'draft db',
  'nasfinance-app': 'finance', 'nasfinance-db': 'finance db', 'nextcloud-app': 'nextcloud', 'nextcloud-db': 'cloud db', 'nextcloud-redis': 'redis',
  'node-exporter': 'node exp', 'portfolio-web': 'portfolio', 'portfolio-telemetry': 'telemetria', 'voalberto-site': 'voalberto',
}

// ============================================================ números

const fmtBytes = (b) => (b == null ? '–' : b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GiB` : b >= 2 ** 20 ? `${Math.round(b / 2 ** 20)} MiB` : `${Math.round(b / 1024)} KiB`)
const fmtRate = (b) => (b == null ? '–' : b >= 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MiB/s` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB/s` : `${Math.round(b)} B/s`)
const fmtAgo = (s) => (s == null ? '–' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`)

// pacotes por segundo a partir de bytes/s: logarítmico, porque 100 B/s e 1 MiB/s
// precisam ser distinguíveis sem que o segundo vire uma nuvem de pixels
const packetRate = (bps) => (bps ? Math.min(5, Math.log10(1 + bps / 256)) : 0)

// ============================================================ o mundo

export function createServerWorld(api) {
  const { REDUCED, label, sprite, burst, puff, addLog, pixelText } = api

  let houses = new Map() // nome -> { name, district, row, x, y, w, h, door, gapX, data }
  let host = null
  let source = 'nenhuma'
  let disks = []
  const started = new Map()
  const lastUp = new Map()
  const packets = []
  const keepers = new Map() // distrito -> zelador
  let telescope = 0
  let beacon = 0

  // ---------------------------------------------------------- dados

  function setServices(services) {
    const pulse = services.pulseOk ? services.pulse : null
    const tel = services.telemetryOk ? services.telemetry : null
    let list
    if (pulse) {
      source = 'tailnet'
      list = pulse.containers
      host = pulse.host
      disks = pulse.host.disks ?? []
    } else if (tel) {
      source = 'pública'
      list = tel.containers.map((c) => ({ name: c.name, up: c.up }))
      host = { cpu: tel.cpu, ram: tel.ram, temp: tel.temp, uptimeSeconds: tel.uptimeSeconds }
      disks = []
    } else {
      source = 'nenhuma'
      return
    }
    layout(list)
    watch(list)
  }

  function layout(list) {
    const next = new Map()
    const used = Object.fromEntries(Object.keys(DISTRICTS).map((k) => [k, 0]))
    for (const c of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      const prefs = PLACEMENT.find(([re]) => re.test(c.name))[1]
      if (prefs[0] === 'gate') {
        next.set(c.name, { name: c.name, district: 'gate', data: c })
        continue
      }
      const district = prefs.find((d) => used[d] < DISTRICTS[d].slots)
      if (!district) continue // sem vaga: continua listado no painel lateral
      const rect = slotRect(district, used[district]++)
      next.set(c.name, { name: c.name, district, row: DISTRICTS[district].row, ...rect, data: c })
    }
    houses = next
  }

  function watch(list) {
    for (const c of list) {
      const house = houses.get(c.name)
      const center = house?.door ? { x: house.door.x, y: house.y + 8 } : POINTS.gate
      // Reinício sem socket do Docker: o start_time do cAdvisor andou para a frente.
      if (c.startedAt != null) {
        const before = started.get(c.name)
        if (before != null && c.startedAt > before + 1) {
          addLog(`${c.name} reiniciou`, 'bad')
          for (let i = 0; i < 8; i++) puff(center.x + (Math.random() - 0.5) * 20, center.y, '#cfd6df', 5)
          const k = house && keepers.get(house.district)
          if (k) k.emote = { text: '!', until: 3 }
        }
        started.set(c.name, c.startedAt)
      }
      const was = lastUp.get(c.name)
      if (was !== undefined && was !== c.up) burst(center.x, center.y, c.up ? ['#3ddc84', '#ffffff'] : ['#ff5c6c', '#ffb02e'], 20)
      lastUp.set(c.name, c.up)
    }
  }

  // ---------------------------------------------------------- zeladores

  function membersOf(district) {
    return [...houses.values()].filter((h) => h.district === district)
  }

  function activity(h) {
    const d = h.data
    if (!d.up) return 100 // container fora chama o zelador antes de tudo
    const cores = host?.cores || 1
    return (d.cpu ?? 0) / cores + packetRate((d.rxBps ?? 0) + (d.txBps ?? 0)) * 4
  }

  function keeperFor(district) {
    let k = keepers.get(district)
    if (!k) {
      const d = DISTRICTS[district]
      const homeX = (d.x + d.slots * 1.5) * T
      k = { district, role: d.keeper, x: homeX, y: d.row === 'north' ? NORTH_WALK : SOUTH_WALK, tx: homeX, t: Math.random() * 10, flip: false, mode: 'idle', emote: null, nextFx: 0 }
      keepers.set(district, k)
    }
    return k
  }

  function updateKeepers(dt, time) {
    for (const district of Object.keys(DISTRICTS)) {
      const members = membersOf(district)
      if (!members.length) {
        keepers.delete(district)
        continue
      }
      const k = keeperFor(district)
      k.t += dt
      const busiest = members.reduce((a, b) => (activity(b) > activity(a) ? b : a))
      const score = activity(busiest)
      // Pouco movimento, ou nenhuma métrica (fora da tailnet): o zelador fica sentado
      // no meio do distrito. Sem dado não há trabalho para mostrar; só um container
      // fora do ar (score 100) o tira de lá.
      if (score < 1.2) {
        const d = DISTRICTS[district]
        k.tx = (d.x + d.slots * 1.5) * T - 4
        k.mode = 'idle'
      } else {
        k.tx = busiest.door.x
        k.mode = busiest.data.up ? 'work' : 'alarm'
        k.target = busiest
      }
      const dx = k.tx - k.x
      const speed = 26 + Math.min(40, score * 4)
      if (Math.abs(dx) > 1) {
        k.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt)
        k.flip = dx < 0
        k.walking = true
      } else {
        k.walking = false
        if (k.mode === 'work' && time > k.nextFx && !REDUCED) {
          burst(k.x + (k.flip ? -8 : 8), k.y - 16, ['#ffe14d', '#ffffff'], 2)
          k.nextFx = time + Math.max(0.25, 1.4 - score / 8)
        }
        if (k.mode === 'alarm' && (!k.emote || k.emote.until < 0.2)) k.emote = { text: '!', until: 1.5 }
      }
      if (k.emote && (k.emote.until -= dt) <= 0) k.emote = null
    }
  }

  // ---------------------------------------------------------- pacotes

  function spawnPackets(dt) {
    if (source !== 'tailnet' || packets.length > 320) return
    const scale = REDUCED ? 0.15 : 1
    for (const h of houses.values()) {
      const d = h.data
      if (!d.up) continue
      const from = sourceOf(h.name)
      const route = h.district === 'gate' ? routeTo(h, 'internet') : routeTo(h, from)
      const color = { internet: '#ffd08a', gate: '#6cf0ff', antenna: '#8dff9a', hub: '#c6b5ff' }[from]
      if (Math.random() < packetRate(d.rxBps) * dt * scale) packets.push({ route, t: 0, color, back: false })
      if (Math.random() < packetRate(d.txBps) * dt * scale) packets.push({ route: [...route].reverse(), t: 0, color: '#ffb02e', back: true })
    }
  }

  function routeLength(route) {
    let len = 0
    for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
    return len
  }

  function pointOn(route, dist) {
    for (let i = 1; i < route.length; i++) {
      const seg = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
      if (dist <= seg) {
        const k = seg ? dist / seg : 0
        return { x: route[i - 1].x + (route[i].x - route[i - 1].x) * k, y: route[i - 1].y + (route[i].y - route[i - 1].y) * k }
      }
      dist -= seg
    }
    return route[route.length - 1]
  }

  function updatePackets(dt) {
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i]
      p.len ??= routeLength(p.route)
      p.t += dt * 140
      if (p.t >= p.len) packets.splice(i, 1)
    }
  }

  // ---------------------------------------------------------- quadro a quadro

  function update(dt, time) {
    spawnPackets(dt)
    updatePackets(dt)
    updateKeepers(dt, time)
    const prom = houses.get('prometheus')?.data
    telescope += dt * (REDUCED ? 0 : 0.3 + (prom?.cpu ?? 0) / 25)
    const adg = houses.get('adguardhome')?.data
    beacon += dt * (REDUCED ? 0 : 1 + packetRate(adg?.rxBps) * 3)
    // usina: fumaça proporcional à CPU do host
    if (!REDUCED && host?.cpu != null && Math.random() < 0.08 + host.cpu / 160) {
      puff(LANDMARKS.plant.rect[0] * T + 22, LANDMARKS.plant.rect[1] * T - 2, host.cpu > 70 ? '#8d8d8d' : '#cfd6df', 3)
    }
    for (const h of houses.values()) {
      if (!h.door || !h.data.up || REDUCED) continue
      const cpu = (h.data.cpu ?? 0) / (host?.cores || 1)
      if (cpu > 1 && Math.random() < Math.min(0.5, cpu / 60)) puff(h.x + 26, h.y - 2, '#d8dde4', 2)
    }
  }

  function draw(ctx, time) {
    drawLandmarks(ctx, time)
    for (const h of houses.values()) if (h.door) drawHouse(ctx, h, time)
    drawPackets(ctx)
    drawKeepers(ctx, time)
    drawWeather(ctx, time)
    drawSigns()
  }

  // ---------------------------------------------------------- casas

  function drawHouse(ctx, h, time) {
    const { x, y, w, data } = h
    const roof = DISTRICTS[h.district].roof
    const up = data.up
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(x + 3, y + 4, w, 32)
    // parede
    ctx.fillStyle = up ? '#e9e1d2' : '#7d7466'
    ctx.fillRect(x, y + 12, w, 20)
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (let i = 0; i < w; i += 6) ctx.fillRect(x + i, y + 12, 1, 20)
    // telhado
    ctx.fillStyle = up ? roof : '#4a4440'
    ctx.fillRect(x - 2, y, w + 4, 13)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x - 2, y, w + 4, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    for (let i = 4; i < 13; i += 4) ctx.fillRect(x - 2, y + i, w + 4, 1)
    // chaminé
    ctx.fillStyle = '#6b6058'
    ctx.fillRect(x + 23, y - 4, 5, 7)
    // janela
    ctx.fillStyle = up ? '#ffd26e' : '#2b2622'
    ctx.fillRect(x + 4, y + 16, 7, 6)
    ctx.fillStyle = '#5a4a3a'
    ctx.fillRect(x + 7, y + 16, 1, 6)
    // porta: pisca com tráfego chegando
    const traffic = packetRate(data.rxBps)
    const doorLit = up && traffic > 0.3 && !REDUCED && Math.sin(time * (4 + traffic * 3) + x) > 0.4
    ctx.fillStyle = up ? (doorLit ? '#7ce3ff' : '#4a3426') : '#3a2a22'
    ctx.fillRect(x + 13, y + 22, 8, 10)
    // memória: barra vertical na parede, verde -> vermelho
    const memRatio = data.memBytes != null ? Math.min(1, data.memBytes / (data.memLimitBytes ?? 512 * 2 ** 20)) : null
    ctx.fillStyle = '#2b2b2b'
    ctx.fillRect(x + 25, y + 15, 4, 14)
    if (memRatio != null) {
      const hFill = Math.max(1, Math.round(12 * memRatio))
      ctx.fillStyle = memRatio > 0.85 ? '#ff5c6c' : memRatio > 0.6 ? '#ffb02e' : '#3ddc84'
      ctx.fillRect(x + 26, y + 28 - hFill, 2, hFill)
    }
    // fora do ar: tábuas cruzadas na porta
    if (!up) {
      ctx.fillStyle = '#a83a49'
      ctx.fillRect(x + 12, y + 24, 10, 2)
      ctx.fillRect(x + 12, y + 28, 10, 2)
    }
    label(short(h.name), x + w / 2, y + 6, up ? 'tiny' : 'tinyBad')
  }

  function short(name) {
    return SHORT_NAMES[name] ?? name.replace(/-(app|site|web)$/, '').slice(0, 10)
  }

  // ---------------------------------------------------------- marcos

  function drawLandmarks(ctx, time) {
    drawGate(ctx, time)
    drawTower(ctx)
    drawObservatory(ctx)
    drawPlant(ctx, time)
    drawSilos(ctx)
    drawAntenna(ctx, time)
    drawHub(ctx, time)
  }

  function drawGate(ctx, time) {
    const g = houses.get('cloudflared')?.data
    const up = g?.up ?? false
    const [gx, gy] = LANDMARKS.gate.rect.map((v) => v * T)
    // tochas dos dois lados do arco
    for (const tx of [gx + 6, gx + 52]) {
      const flick = REDUCED ? 0.9 : 0.6 + Math.sin(time * 9 + tx) * 0.3
      ctx.fillStyle = up ? `rgba(255,160,40,${flick})` : '#3a2a22'
      ctx.fillRect(tx, gy + 40, 4, 4)
    }
    // bandeira laranja: o túnel está de pé
    ctx.fillStyle = '#5a4a3a'
    ctx.fillRect(gx + 30, gy + 2, 2, 22)
    ctx.fillStyle = up ? '#f48120' : '#6b6058'
    const wave = REDUCED ? 0 : Math.round(Math.sin(time * 5))
    ctx.fillRect(gx + 32, gy + 3 + wave, 10, 6)
  }

  function drawTower(ctx) {
    const [tx, ty] = LANDMARKS.tower.rect.map((v) => v * T)
    const adg = houses.get('adguardhome')?.data
    const on = adg?.up ?? false
    // farol: gira com as consultas
    const a = beacon
    ctx.fillStyle = on ? 'rgba(141,255,154,0.25)' : 'rgba(0,0,0,0)'
    ctx.beginPath()
    ctx.moveTo(tx + 24, ty + 10)
    ctx.lineTo(tx + 24 + Math.cos(a) * 34, ty + 10 + Math.sin(a) * 12 - 6)
    ctx.lineTo(tx + 24 + Math.cos(a + 0.4) * 34, ty + 10 + Math.sin(a + 0.4) * 12 + 6)
    ctx.fill()
    ctx.fillStyle = on ? '#8dff9a' : '#3a4a3a'
    ctx.fillRect(tx + 21, ty + 6, 6, 6)
  }

  function drawObservatory(ctx) {
    const [ox, oy] = LANDMARKS.observatory.rect.map((v) => v * T)
    const cx = ox + 64
    const cy = oy + 40
    ctx.strokeStyle = '#2b3644'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(-Math.PI / 2 + Math.sin(telescope) * 0.9) * 24, cy + Math.sin(-Math.PI / 2 + Math.sin(telescope) * 0.9) * 24)
    ctx.stroke()
    ctx.lineWidth = 1
  }

  function drawPlant(ctx, time) {
    const [px, py] = LANDMARKS.plant.rect.map((v) => v * T)
    // caixa d'água = RAM do host
    const ram = host?.ram
    ctx.fillStyle = '#26323f'
    ctx.fillRect(px + 104, py + 10, 30, 34)
    if (ram != null) {
      const h = Math.round(32 * ram / 100)
      ctx.fillStyle = ram > 85 ? '#ff5c6c' : ram > 65 ? '#ffb02e' : '#4aa3ff'
      ctx.fillRect(px + 105, py + 43 - h, 28, h)
      if (!REDUCED) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(px + 105 + ((time * 12) % 24), py + 43 - h, 4, 1)
      }
    }
    // barril = swap
    const swap = host?.swap
    ctx.fillStyle = '#4a3a2a'
    ctx.fillRect(px + 140, py + 24, 14, 20)
    if (swap != null) {
      const h = Math.round(18 * swap / 100)
      ctx.fillStyle = swap > 50 ? '#ff5c6c' : '#c69a63'
      ctx.fillRect(px + 141, py + 43 - h, 12, h)
    }
    // termômetro
    const temp = host?.temp
    ctx.fillStyle = '#e8eef7'
    ctx.fillRect(px + 60, py + 8, 6, 32)
    if (temp != null) {
      const h = Math.round(30 * Math.min(1, temp / 90))
      ctx.fillStyle = temp > 75 ? '#ff5c6c' : temp > 60 ? '#ffb02e' : '#3ddc84'
      ctx.fillRect(px + 61, py + 39 - h, 4, h)
    }
    ctx.fillStyle = temp > 75 ? '#ff5c6c' : '#e8eef7'
    ctx.beginPath()
    ctx.arc(px + 63, py + 42, 4, 0, Math.PI * 2)
    ctx.fill()
    // lâmpadas de carga: uma acesa por núcleo ocupado (load1)
    const cores = host?.cores ?? 4
    for (let i = 0; i < cores; i++) {
      const lit = host?.load1 != null && host.load1 > i
      ctx.fillStyle = lit ? '#ffe14d' : '#3a3a3a'
      ctx.fillRect(px + 74 + i * 6, py + 12, 4, 4)
    }
  }

  function drawSilos(ctx) {
    const [sx, sy] = LANDMARKS.silos.rect.map((v) => v * T)
    const order = ['/', '/data']
    order.forEach((mount, i) => {
      const d = disks.find((x) => x.mount === mount)
      const x = sx + 8 + i * 44
      const y = sy + 6
      ctx.fillStyle = '#26323f'
      ctx.fillRect(x + 2, y + 6, 26, 72)
      if (d?.usedPercent != null) {
        const h = Math.round(70 * d.usedPercent / 100)
        ctx.fillStyle = d.usedPercent > 85 ? '#ff5c6c' : d.usedPercent > 70 ? '#ffb02e' : '#e2b23a'
        ctx.fillRect(x + 3, y + 77 - h, 24, h)
      }
      label(d?.usedPercent != null ? `${mount} ${Math.round(d.usedPercent)}%` : `${mount} ?`, x + 15, y + 70, d?.usedPercent > 85 ? 'tinyBad' : 'tiny')
    })
  }

  function drawAntenna(ctx, time) {
    const [ax, ay] = LANDMARKS.antenna.rect.map((v) => v * T)
    // barras: dBm real quando o coletor wifi existe; senão, só o tráfego
    const dbm = host?.wifiDbm
    const level = dbm != null ? Math.max(0, Math.min(4, Math.round((dbm + 90) / 10))) : Math.min(4, Math.ceil(packetRate((host?.rxBps ?? 0) + (host?.txBps ?? 0))))
    for (let i = 0; i < 4; i++) {
      const on = i < level && (REDUCED || dbm != null || Math.sin(time * 6 + i) > -0.6)
      ctx.fillStyle = on ? '#8dff9a' : '#2b3a2e'
      ctx.fillRect(ax + 30 + i * 4, ay + 30 - i * 5, 3, 6 + i * 5)
    }
  }

  function drawHub(ctx, time) {
    const { x, y } = POINTS.hub
    ctx.fillStyle = '#1b222c'
    ctx.fillRect(x - 9, y - 5, 18, 10)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = !REDUCED && Math.sin(time * 11 + i * 1.7) > 0.3 ? '#3ddc84' : '#24572f'
      ctx.fillRect(x - 7 + i * 4, y - 2, 2, 2)
    }
  }

  // ---------------------------------------------------------- pacotes e gente

  function drawPackets(ctx) {
    for (const p of packets) {
      const at = pointOn(p.route, p.t)
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1 + (p.back ? 2 : -2), 3, 3)
    }
  }

  function drawKeepers(ctx, time) {
    const all = [...keepers.values()]
    const gate = houses.get('cloudflared')
    if (gate) all.push({ role: 'gatekeeper', x: POINTS.gate.x - 2, y: AVE_Y + 26, walking: false, t: time, flip: false, mode: gate.data.up ? 'work' : 'alarm', emote: gate.data.up ? null : { text: '!' } })
    for (const k of all.sort((a, b) => a.y - b.y)) {
      const sitting = k.mode === 'idle' && !k.walking
      const legs = k.walking ? (Math.floor(k.t * 8) % 2 ? 'walkA' : 'walkB') : sitting ? 'sit' : 'stand'
      const img = sprite(k.role, legs, k.flip)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.beginPath()
      ctx.ellipse(k.x, k.y, 9, 3, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.translate(Math.round(k.x), Math.round(k.y))
      ctx.scale(2, 2)
      const bob = k.walking ? Math.abs(Math.sin(k.t * 16)) : k.mode === 'work' && !REDUCED ? Math.round(Math.sin(k.t * 10)) * 0.5 : 0
      const yy = Math.round(-14 - bob + (sitting ? 2 : 0))
      ctx.drawImage(img, -5, yy)
      if (k.emote) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(-3, yy - 10, 7, 8)
        pixelText(ctx, k.emote.text, -1, yy - 8, '#e0457b')
      }
      ctx.restore()
      if (sitting && !REDUCED && Math.floor(time * 0.6 + k.x) % 4 === 0 && Math.random() < 0.01) api.glyph(k.x + 4, k.y - 30, 'z', '#cfe3ff')
    }
  }

  // ---------------------------------------------------------- clima e placas

  function drawWeather(ctx, time) {
    // temperatura do host muda o clima: calor tinge o mapa e faz o ar tremer
    const temp = host?.temp
    if (temp == null || temp < 60) return
    const heat = Math.min(1, (temp - 60) / 25)
    ctx.fillStyle = `rgba(255, ${Math.round(140 - heat * 80)}, 40, ${0.05 + heat * 0.12})`
    ctx.fillRect(0, 0, 40 * T, 24 * T)
    if (REDUCED) return
    ctx.fillStyle = `rgba(255,255,255,${0.05 + heat * 0.08})`
    const [px, py] = LANDMARKS.plant.rect.map((v) => v * T)
    for (let i = 0; i < 6; i++) ctx.fillRect(px + 10 + i * 24 + Math.sin(time * 3 + i) * 3, py - 6 - ((time * 10 + i * 7) % 18), 6, 1)
  }

  function drawSigns() {
    const seen = new Set()
    for (const [key, d] of Object.entries(DISTRICTS)) {
      if (!membersOf(key).length || seen.has(d.name + d.row)) continue
      seen.add(d.name + d.row)
      const x = (d.x + d.slots * 1.5) * T - 8
      if (d.row === 'north' && key !== 'dns' && key !== 'storage' && key !== 'observ') label(d.name, x, 7 * T, 'signSmall')
      if (d.row === 'south' && key !== 'proxy') label(d.name, x, 14 * T + 4, 'signSmall')
    }
    for (const [key, lm] of Object.entries(LANDMARKS)) {
      const [x, y, w] = lm.rect
      const yOff = key === 'gate' ? 1 : key === 'plant' || key === 'silos' || key === 'antenna' ? -6 : 2
      label(lm.name, (x + w / 2) * T, y * T + yOff, 'sign')
    }
    if (source !== 'tailnet') {
      label(source === 'pública' ? 'sem a tailnet: só a telemetria pública (casas acendem e apagam, sem tráfego)' : 'sem dados do servidor', 20 * T, 23 * T + 6, 'signBad')
    }
  }

  // ---------------------------------------------------------- noite

  function drawLights(ctx, dark) {
    if (dark <= 0) return
    for (const h of houses.values()) {
      if (!h.door || !h.data.up) continue
      const g = ctx.createRadialGradient(h.x + 8, h.y + 19, 1, h.x + 8, h.y + 19, 16)
      g.addColorStop(0, `rgba(255,210,110,${dark})`)
      g.addColorStop(1, 'rgba(255,210,110,0)')
      ctx.fillStyle = g
      ctx.fillRect(h.x - 8, h.y + 3, 32, 32)
    }
  }

  // ---------------------------------------------------------- fundo estático

  function paintBackground(ctx, rand) {
    // grama
    for (let j = 0; j < 24; j++) {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = (i + j) % 2 ? '#3f7a45' : '#428048'
        ctx.fillRect(i * T, j * T, T, T)
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = rand() < 0.5 ? '#37703d' : '#4c8f52'
          ctx.fillRect(i * T + Math.floor(rand() * 15), j * T + Math.floor(rand() * 15), 1, 2)
        }
      }
    }
    // internet: faixa escura à esquerda, de onde chegam os visitantes
    ctx.fillStyle = '#1b222c'
    ctx.fillRect(0, 0, T, 24 * T)
    ctx.fillStyle = '#2b3644'
    for (let j = 0; j < 24 * T; j += 6) ctx.fillRect(2 + ((j / 6) % 3) * 4, j, 2, 2)
    // muro com o portão no meio
    ctx.fillStyle = '#8a8070'
    ctx.fillRect(T, 0, 6, 9 * T)
    ctx.fillRect(T, 16 * T, 6, 8 * T)
    ctx.fillStyle = '#6b6358'
    for (let j = 0; j < 24 * T; j += 8) if (j < 9 * T || j > 16 * T) ctx.fillRect(T, j, 6, 1)
    // avenida
    ctx.fillStyle = '#3a3d44'
    ctx.fillRect(T, 11 * T, 39 * T, 2 * T)
    ctx.fillStyle = '#e8d27a'
    for (let i = 2 * T; i < 40 * T; i += 14) ctx.fillRect(i, AVE_Y - 1, 7, 2)
    // calçada norte e rua sul
    ctx.fillStyle = '#9a917f'
    ctx.fillRect(5 * T, 10 * T, 35 * T, T)
    ctx.fillStyle = '#5a5d64'
    ctx.fillRect(5 * T, 17 * T, 35 * T, T)
    ctx.fillStyle = '#9a917f'
    ctx.fillRect(5 * T, 13 * T, 35 * T, 6)
    // vãos que ligam a avenida à rua do sul
    for (const d of Object.values(DISTRICTS).filter((x) => x.row === 'south')) {
      for (let s = 0; s < d.slots; s++) {
        const gx = (d.x + s * 3 + 2) * T
        ctx.fillStyle = '#7d7466'
        ctx.fillRect(gx + 4, 13 * T, 8, 4 * T)
      }
    }
    paintGate(ctx)
    paintTower(ctx)
    paintWarehouse(ctx)
    paintObservatory(ctx)
    paintPlant(ctx)
    paintSilos(ctx)
    paintAntenna(ctx)
    // árvores na borda de baixo e entre os marcos
    for (const [x, y] of [[23, 19], [26, 21], [29, 19], [32, 21], [35, 19], [38, 21], [24, 22], [30, 22], [36, 22], [9, 2], [12, 4], [16, 2], [19, 5], [21, 2]]) tree(ctx, x * T, y * T)
  }

  function shadow(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fillRect(x + 3, y + 4, w, h)
  }

  function tree(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(x + 8, y + 14, 7, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6b4a2b'
    ctx.fillRect(x + 7, y + 9, 3, 6)
    ctx.fillStyle = '#1f5a2a'
    ctx.beginPath()
    ctx.arc(x + 8, y + 7, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2d7a37'
    ctx.beginPath()
    ctx.arc(x + 7, y + 6, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  function paintGate(ctx) {
    const [x, y, w, h] = LANDMARKS.gate.rect.map((v) => v * T)
    shadow(ctx, x, y + 20, w, h - 20)
    ctx.fillStyle = '#b5ab98'
    ctx.fillRect(x, y + 20, 14, h - 20)
    ctx.fillRect(x + w - 14, y + 20, 14, h - 20)
    ctx.fillStyle = '#a0957f'
    ctx.fillRect(x - 2, y + 20, w + 4, 12)
    ctx.fillStyle = '#f48120'
    ctx.fillRect(x - 2, y + 30, w + 4, 2)
    ctx.fillStyle = '#8a8070'
    for (let i = 0; i < h - 32; i += 6) {
      ctx.fillRect(x, y + 32 + i, 14, 1)
      ctx.fillRect(x + w - 14, y + 32 + i, 14, 1)
    }
  }

  function paintTower(ctx) {
    const [x, y, w, h] = LANDMARKS.tower.rect.map((v) => v * T)
    shadow(ctx, x + 12, y + 10, 24, h - 10)
    ctx.fillStyle = '#d9d2c3'
    ctx.fillRect(x + 14, y + 12, 20, h - 12)
    ctx.fillStyle = '#2f7a45'
    for (let i = 20; i < h; i += 16) ctx.fillRect(x + 14, y + i, 20, 4)
    ctx.fillStyle = '#2f7a45'
    ctx.fillRect(x + 12, y + 2, 24, 10)
    ctx.fillStyle = '#26323f'
    ctx.fillRect(x + 18, y + 4, 12, 6)
    void w
  }

  function paintWarehouse(ctx) {
    const [x, y, w, h] = LANDMARKS.warehouse.rect.map((v) => v * T)
    shadow(ctx, x, y, w, h - 8)
    ctx.fillStyle = '#c9c1b0'
    ctx.fillRect(x, y + 18, w, h - 26)
    ctx.fillStyle = '#2f6fb3'
    ctx.fillRect(x - 3, y + 2, w + 6, 18)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(x - 3, y + 2, w + 6, 2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    for (let i = 6; i < 18; i += 4) ctx.fillRect(x - 3, y + 2 + i, w + 6, 1)
    // caixotes
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = '#9c7444'
      ctx.fillRect(x + 8 + i * 18, y + 30, 12, 10)
      ctx.fillStyle = '#7a5630'
      ctx.fillRect(x + 8 + i * 18, y + 34, 12, 1)
    }
  }

  function paintObservatory(ctx) {
    const [x, y, w, h] = LANDMARKS.observatory.rect.map((v) => v * T)
    shadow(ctx, x + 24, y + 28, 80, h - 36)
    ctx.fillStyle = '#d9d2c3'
    ctx.fillRect(x + 24, y + 40, 80, h - 48)
    ctx.fillStyle = '#e8eef7'
    ctx.beginPath()
    ctx.arc(x + 64, y + 42, 32, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = '#c7cfd9'
    ctx.fillRect(x + 32, y + 40, 64, 3)
    ctx.fillStyle = '#26323f'
    ctx.fillRect(x + 60, y + 14, 8, 26)
    void w
  }

  function paintPlant(ctx) {
    const [x, y, w, h] = LANDMARKS.plant.rect.map((v) => v * T)
    shadow(ctx, x, y + 4, 56, h - 10)
    ctx.fillStyle = '#9aa7b5'
    ctx.fillRect(x, y + 4, 56, h - 10)
    ctx.fillStyle = '#2b3644'
    ctx.fillRect(x - 2, y, 60, 6)
    // chaminé
    ctx.fillStyle = '#7a6a58'
    ctx.fillRect(x + 18, y - 8, 9, 14)
    // base da caixa d'água
    ctx.fillStyle = '#5b6470'
    ctx.fillRect(x + 108, y + 44, 3, 40)
    ctx.fillRect(x + 128, y + 44, 3, 40)
    // painel das lâmpadas
    ctx.fillStyle = '#1b222c'
    ctx.fillRect(x + 72, y + 10, 4 + 6 * 4, 8)
    void w
  }

  function paintSilos(ctx) {
    const [x, y] = LANDMARKS.silos.rect.map((v) => v * T)
    for (let i = 0; i < 2; i++) {
      const sx = x + 8 + i * 44
      shadow(ctx, sx, y + 6, 30, 76)
      ctx.fillStyle = '#c7cfd9'
      ctx.fillRect(sx, y + 6, 30, 76)
      ctx.fillStyle = '#9aa4b1'
      ctx.beginPath()
      ctx.arc(sx + 15, y + 6, 15, Math.PI, 0)
      ctx.fill()
    }
  }

  function paintAntenna(ctx) {
    const [x, y] = LANDMARKS.antenna.rect.map((v) => v * T)
    ctx.fillStyle = '#5b6470'
    ctx.fillRect(x + 22, y + 8, 3, 80)
    ctx.fillRect(x + 14, y + 86, 20, 4)
    ctx.fillStyle = '#c7cfd9'
    ctx.fillRect(x + 16, y + 8, 15, 3)
  }

  // ---------------------------------------------------------- dica do mouse

  function hover(wx, wy) {
    for (const h of houses.values()) {
      if (!h.door) continue
      if (wx >= h.x - 2 && wx < h.x + h.w + 2 && wy >= h.y - 4 && wy < h.y + h.h) {
        const d = h.data
        const lines = [h.name, `${d.up ? 'rodando' : 'PARADO'} · ${DISTRICTS[h.district].name}`]
        if (source === 'tailnet') {
          const cores = host?.cores || 1
          lines.push(`CPU ${d.cpu != null ? (d.cpu / cores).toFixed(1) : '–'}% do host (${d.cpu ?? '–'}% de um núcleo)`)
          lines.push(`memória ${fmtBytes(d.memBytes)}${d.memLimitBytes ? ` de ${fmtBytes(d.memLimitBytes)}` : ' (sem limite)'}`)
          lines.push(`rede ↓ ${fmtRate(d.rxBps)} · ↑ ${fmtRate(d.txBps)}`)
          if (d.startedAt) lines.push(`no ar há ${fmtAgo(Date.now() / 1000 - d.startedAt)}`)
          lines.push(`tráfego vem: ${{ gate: 'pelo túnel', antenna: 'pela rede de casa / tailnet', hub: 'só da rede interna', internet: 'da internet' }[sourceOf(h.name)]}`)
        }
        return lines
      }
    }
    for (const [key, lm] of Object.entries(LANDMARKS)) {
      const [x, y, w, hh] = lm.rect.map((v) => v * T)
      if (wx >= x && wx < x + w && wy >= y && wy < y + hh) {
        const lines = [lm.name, lm.about]
        if (key === 'plant' && host) {
          lines.push(`CPU ${host.cpu ?? '–'}% · carga ${host.load1 ?? '–'} · ${host.cores ?? '?'} núcleos`)
          lines.push(`RAM ${host.ram ?? '–'}% · swap ${host.swap ?? '–'}% · ${host.temp ?? '–'} °C`)
          if (host.uptimeSeconds) lines.push(`ligado há ${fmtAgo(host.uptimeSeconds)}`)
        }
        if (key === 'silos') for (const d of disks) lines.push(`${d.mount}: ${d.usedPercent}% de ${fmtBytes(d.sizeBytes)}`)
        if (key === 'antenna' && host) lines.push(`↓ ${fmtRate(host.rxBps)} · ↑ ${fmtRate(host.txBps)}${host.wifiDbm != null ? ` · sinal ${host.wifiDbm} dBm` : ' · sinal: coletor wifi desligado'}`)
        if (key === 'gate') {
          const g = houses.get('cloudflared')?.data
          if (g) lines.push(`${g.up ? 'túnel de pé' : 'TÚNEL FORA'}${g.rxBps != null ? ` · ↓ ${fmtRate(g.rxBps)} · ↑ ${fmtRate(g.txBps)}` : ''}`)
        }
        return lines
      }
    }
    if (Math.abs(wx - POINTS.hub.x) < 12 && Math.abs(wy - POINTS.hub.y) < 8) return ['Rede interna', 'Bancos, caches e coletores conversam só por aqui, sem sair da máquina.']
    return null
  }

  return { setServices, update, draw, drawLights, paintBackground, hover, source: () => source }
}
