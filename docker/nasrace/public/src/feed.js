// Leitura do nas-pulse. O nginx do site encaminha api/pulse pela mesma origem, então não há chave
// nem CORS; no desenvolvimento, quem faz esse papel é o dev-server.mjs. O caminho é relativo porque o
// site mora em /nasrace/ no domínio público.

const EVERY_MS = 5_000
const TIMEOUT_MS = 8_000
// O servidor está em WiFi: uma leitura perdida é normal e não pode apagar os dados da tela.
const TOLERANCE_MS = 30_000
// Leitura que não muda é medição parada. Compara só com o relógio daqui: depois de uma queda de
// luz, o do servidor pode estar errado.
const STALE_MS = 60_000

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Só campos conhecidos e tipados: a corrida nunca recebe o JSON cru. */
function clean(data) {
  return {
    host: {
      cpu: num(data.host?.cpuPercent), ram: num(data.host?.ramPercent), swap: num(data.host?.swapPercent),
      temp: num(data.host?.cpuTemp),
      disks: Array.isArray(data.host?.disks) ? data.host.disks.map((d) => ({ mount: String(d.mount), usedPercent: num(d.usedPercent) })) : [],
    },
    containers: Array.isArray(data.containers) ? data.containers.map((c) => ({
      name: String(c.name), up: c.up === true, startedAt: num(c.startedAt), cpu: num(c.cpu),
      memBytes: num(c.memBytes), memLimitBytes: num(c.memLimitBytes), rxBps: num(c.rxBps), txBps: num(c.txBps),
    })) : [],
    generatedAt: data.generatedAt,
  }
}

export function startFeed({ onData, onLost }) {
  let busy = false
  let goodAt = performance.now()
  let stamp = null
  let stampAt = performance.now()
  const poll = async () => {
    if (busy) return
    busy = true
    try {
      const response = await fetch('api/pulse', { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      const data = await response.json()
      const now = performance.now()
      if (data.generatedAt !== stamp) {
        stamp = data.generatedAt
        stampAt = now
      }
      if (now - stampAt > STALE_MS) throw new Error('leitura parada')
      goodAt = now
      onData(clean(data))
    } catch {
      if (performance.now() - goodAt > TOLERANCE_MS) onLost()
    } finally {
      busy = false
    }
  }
  void poll()
  setInterval(poll, EVERY_MS)
}
