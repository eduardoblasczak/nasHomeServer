// Agent Arena: servidor local que transforma a atividade dos agentes do Claude
// Code e o estado dos serviços em um feed ao vivo para o jogo em public/.
//
// Fontes, todas só leitura:
//   - ~/.claude/projects/*/<sessao>.jsonl            sessões (personagem "capitão")
//   - ~/.claude/projects/*/<sessao>/subagents/*.jsonl subagentes, com .meta.json
//   - https://ebls.com.br/api/telemetry              containers, CPU, RAM e temperatura
//                                                    do nas-server (o mesmo dado que o
//                                                    Uptime Kuma vigia)
//   - GET nos sites públicos                         só para saber se respondem
//   - http://nas-server (tailnet):9106/api/pulse     CPU, memória, rede e reinícios por
//                                                    container, para o modo Servidor. Só
//                                                    responde dentro da tailnet; fora dela o
//                                                    mapa usa a telemetria pública
//
// Nada é executado em servidor nenhum. O servidor escuta só em 127.0.0.1, porque os
// transcripts são privados: o feed leva só o nome da ferramenta e um rótulo curto.
//
// Uso: node server.mjs   (Node 22+, sem dependências)  ->  http://127.0.0.1:4580

import http from 'node:http'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.ARENA_PORT ?? process.env.PORT ?? 4580)
const PROJECTS = join(homedir(), '.claude', 'projects')
// Só os projetos do NAS por padrão; ARENA_PROJECTS=. mostra todos.
const PROJECT_FILTER = new RegExp(process.env.ARENA_PROJECTS ?? 'Projeto-NAS', 'i')
const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url))

const ACTIVE_WINDOW_MS = 30 * 60_000 // sessão parada há mais que isso sai do mapa
const TOOL_STALE_MS = 10 * 60_000 // ferramenta "rodando" sem novidade há mais que isso = travou
const THINK_STALE_MS = 3 * 60_000 // "pensando" sem escrever nada há mais que isso = ocioso
const TAIL_BYTES = 768 * 1024
const HEAD_BYTES = 96 * 1024
const TICK_MS = 1500
const TELEMETRY_URL = 'https://ebls.com.br/api/telemetry'
const TELEMETRY_EVERY_MS = 20_000
const SITES_EVERY_MS = 60_000
// Pelo nome, e não pelo IP 100.x: o `tailscale serve` escolhe o site pelo cabeçalho
// Host e responde 404 ao IP. Se o MagicDNS falhar, o mapa cai para a telemetria pública.
const PULSE_URL = process.env.ARENA_PULSE_URL ?? 'http://nas-server.tail80d72a.ts.net:9106/api/pulse'
const PULSE_EVERY_MS = 5_000

const SITES = [
  { id: 'demo', name: 'Demo nasFinance', url: 'https://nasfinance.ebls.com.br/', zone: 'cloud' },
  // Atrás do Access: um 302 para o login prova que a borda e o túnel respondem, não o app.
  { id: 'financas', name: 'nasFinance (Access)', url: 'https://financas.ebls.com.br/', zone: 'oracle' },
  { id: 'uptime', name: 'Uptime Kuma (Access)', url: 'https://uptime.ebls.com.br/', zone: 'oracle' },
  { id: 'portfolio', name: 'ebls.com.br', url: 'https://ebls.com.br/', zone: 'cloud' },
  { id: 'draft', name: 'Draft', url: 'https://draft.app.br/', zone: 'cloud' },
  { id: 'voalberto', name: 'Livraria Vô Alberto', url: 'https://voalberto.com.br/', zone: 'cloud' },
  { id: 'github', name: 'GitHub nasfinance', url: 'https://github.com/eduardoblasczak/nasfinance', zone: 'cloud' },
]

// ============================================================ leitura dos transcripts

const cache = new Map() // caminho -> { mtimeMs, size, value }

// Abrir um transcript grande que está sendo escrito leva ~45 s nesta máquina: o
// antivírus varre o arquivo inteiro a cada open. Ler por um handle já aberto é
// instantâneo, então cada arquivo ativo fica aberto e a abertura corre em
// segundo plano, sem travar a varredura.
const handles = new Map() // caminho -> { handle, usedAt }
const HANDLE_IDLE_MS = 10 * 60_000

function handleFor(file) {
  let entry = handles.get(file)
  if (!entry) {
    entry = { handle: null, usedAt: Date.now() }
    handles.set(file, entry)
    open(file, 'r')
      .then((handle) => {
        entry.handle = handle
      })
      .catch(() => handles.delete(file))
  }
  entry.usedAt = Date.now()
  return entry.handle
}

setInterval(() => {
  for (const [file, entry] of handles) {
    if (Date.now() - entry.usedAt > HANDLE_IDLE_MS && entry.handle) {
      void entry.handle.close()
      handles.delete(file)
    }
  }
}, 60_000)

/** Linhas do fim (ou do começo) do arquivo; null enquanto ele ainda está abrindo. */
async function readSlice(file, size, fromEnd) {
  const handle = handleFor(file)
  if (!handle) return null
  const length = Math.min(size, fromEnd ? TAIL_BYTES : HEAD_BYTES)
  const buffer = Buffer.alloc(length)
  await handle.read(buffer, 0, length, fromEnd ? size - length : 0)
  const lines = buffer.toString('utf8').split('\n')
  // A primeira linha do rabo (ou a última da cabeça) pode estar cortada.
  if (fromEnd && size > length) lines.shift()
  if (!fromEnd && size > length) lines.pop()
  return lines
}

async function summaryOf(file, info) {
  return cached(file, info, async () => {
    const lines = await readSlice(file, info.size, true)
    return lines ? summarize(parseLines(lines)) : null
  })
}

function parseLines(lines) {
  const out = []
  for (const line of lines) {
    if (!line) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // linha parcial ou corrompida: ignora
    }
  }
  return out
}

/** Um transcript vira: estado, ferramenta atual, título e o que mudou por último. */
function summarize(records) {
  let title = null
  let last = null
  let lastTool = null
  let lastToolAt = null
  let lastSend = null
  const results = new Set()
  for (const record of records) {
    if (record.type === 'custom-title' && record.customTitle) title = record.customTitle
    else if (record.type === 'ai-title' && record.aiTitle && !title) title = record.aiTitle
    if (record.type !== 'assistant' && record.type !== 'user') continue
    const content = record.message?.content
    if (record.type === 'user' && Array.isArray(content)) {
      for (const block of content) if (block?.type === 'tool_result') results.add(block.tool_use_id)
    }
    if (record.type === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type !== 'tool_use') continue
        lastTool = block
        lastToolAt = record.timestamp
        if (block.name === 'SendMessage') lastSend = { id: block.id, to: String(block.input?.to ?? ''), at: record.timestamp }
      }
    }
    last = record
  }

  let state = 'idle'
  if (last?.type === 'assistant') {
    const blocks = Array.isArray(last.message?.content) ? last.message.content : []
    const pendingTool = blocks.some((block) => block?.type === 'tool_use' && !results.has(block.id))
    const ended = last.message?.stop_reason === 'end_turn' || last.message?.stop_reason === 'stop_sequence'
    if (pendingTool) state = 'tool'
    else if (!ended) state = 'thinking'
  } else if (last?.type === 'user') {
    state = 'thinking' // resultado de ferramenta ou prompt novo: o modelo vai responder
  }
  const lastAt = last?.timestamp ? Date.parse(last.timestamp) : 0
  return { title, state, lastAt, lastTool, lastToolAt, lastSend }
}

function roleOf(meta, firstPrompt) {
  const text = `${meta?.description ?? ''}\n${firstPrompt}`.toLowerCase()
  if (text.includes('security-reviewer') || /revis[aã]o de seguran|security review/.test(text)) return 'guard'
  if (text.includes('ui-designer') || /\bui[:\s-]/.test(text)) return 'painter'
  if (/\bops\b/.test(text) && text.includes('agents/ops')) return 'engineer'
  if (meta?.agentType === 'Explore') return 'scout'
  if (meta?.agentType === 'Plan') return 'architect'
  if (meta?.agentType === 'claude-code-guide') return 'scout'
  return 'robot'
}

function firstPromptOf(records) {
  for (const record of records) {
    if (record.type !== 'user') continue
    const content = record.message?.content
    if (typeof content === 'string') return content.slice(0, 600)
    if (Array.isArray(content)) {
      const text = content.find((block) => block?.type === 'text')?.text
      if (text) return text.slice(0, 600)
    }
  }
  return ''
}

async function cached(file, info, compute) {
  const hit = cache.get(file)
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.value
  const value = await compute()
  // Arquivo ainda abrindo: vale o último valor conhecido, sem gravar no cache.
  if (value === null) return hit?.value ?? null
  cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value })
  return value
}

// ============================================================ ferramenta -> módulo do mapa

const TOOL_VERB = {
  Read: 'lendo', Edit: 'editando', Write: 'escrevendo', NotebookEdit: 'editando', Grep: 'procurando',
  Glob: 'procurando', Bash: 'rodando', PowerShell: 'rodando', Agent: 'chamando um agente',
  SendMessage: 'mandando mensagem', ListAgents: 'olhando a equipe', AskUserQuestion: 'perguntando a você',
  WebSearch: 'pesquisando na web', WebFetch: 'lendo a web', Skill: 'abrindo uma skill',
  ToolSearch: 'pegando ferramentas', Artifact: 'publicando página', SendUserFile: 'mandando arquivo',
  ReportFindings: 'relatando achados', ScheduleWakeup: 'agendando',
}

const SERVICE_DIRS = {
  adguard: 'adguardhome', 'ai-memory': 'ai-memory', cloudflare: 'cloudflared', draft: 'draft-app',
  monitoring: 'prometheus', nextcloud: 'nextcloud-app', 'nginx-proxy-manager': 'cloudflared',
  portainer: 'portainer', portfolio: 'portfolio-web', voalberto: 'voalberto-site',
}

function shortPath(path) {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

function placeOf(name, input) {
  const raw = String(input?.file_path ?? input?.path ?? input?.notebook_path ?? '')
  const path = raw.replace(/\\/g, '/').toLowerCase()
  const cmd = String(input?.command ?? '').toLowerCase()
  const url = String(input?.url ?? '').toLowerCase()

  if (name.startsWith('mcp__Claude_Browser') || name.startsWith('mcp__claude-in-chrome')) {
    if (/localhost|127\.0\.0\.1/.test(url)) return { station: 'browser' }
    return { station: 'browser' }
  }
  if (name.startsWith('mcp__plugin_cloudflare')) return { station: 'cloud' }
  if (name.startsWith('mcp__ai-memory')) return { station: 'nas', target: 'ai-memory' }
  if (name.startsWith('mcp__terminal')) return { station: 'terminal' }
  if (name.startsWith('mcp__ccd') || name.startsWith('mcp__visualize')) return { station: 'hq' }
  if (['Agent', 'SendMessage', 'ListAgents', 'AskUserQuestion', 'SendUserFile', 'ScheduleWakeup'].includes(name)) return { station: 'hq' }
  if (name === 'WebSearch' || name === 'WebFetch') return { station: 'portal' }
  if (name === 'Artifact') return { station: 'portal' }

  if (name === 'Bash' || name === 'PowerShell') {
    if (/\bssh\b|\bscp\b/.test(cmd)) return cmd.includes('nasfinance-oracle') ? { station: 'oracle' } : { station: 'nas' }
    if (/wrangler|npm run deploy/.test(cmd)) return { station: 'cloud' }
    if (/ebls\.com\.br\/api\/telemetry/.test(cmd)) return { station: 'nas' }
    if (/\bgit\b|\bgh\b|github\.com/.test(cmd)) return { station: 'git' }
    if (/curl|wget|invoke-webrequest/.test(cmd)) return /nasfinance\.ebls|draft\.app|voalberto|ebls\.com\.br/.test(cmd) ? { station: 'cloud' } : { station: 'portal' }
    if (/\bwsl\b.*docker|docker (build|save|load)/.test(cmd)) return { station: 'backend' }
    if (/mvnw|maven|\bmvn\b/.test(cmd)) return { station: 'backend' }
    return { station: 'terminal' }
  }

  if (path) {
    if (path.includes('nasfinance/frontend')) return { station: 'frontend' }
    if (path.includes('nasfinance/backend')) return { station: 'backend' }
    if (path.includes('nasfinance/demo')) return { station: 'cloud' }
    if (path.includes('docker/uptime-kuma')) return { station: 'oracle' }
    const service = path.match(/projeto_nas\/docker\/([a-z0-9-]+)\//)?.[1]
    if (service && service !== 'nasfinance') return { station: 'nas', target: SERVICE_DIRS[service] ?? service }
    if (path.includes('.claude/agents')) return { station: 'hq' }
    if (path.includes('/memory/') || path.endsWith('.md')) return { station: 'library' }
    if (path.includes('/scratchpad/') || path.includes('/tools/agent-arena/')) return { station: 'terminal' }
  }
  if (name === 'Read' || name === 'Grep' || name === 'Glob' || name === 'Skill' || name === 'ToolSearch') return { station: 'library' }
  return { station: 'terminal' }
}

function labelOf(name, input) {
  const verb = TOOL_VERB[name]
    ?? (name.startsWith('mcp__Claude_Browser') ? 'no navegador'
      : name.startsWith('mcp__ai-memory') ? 'consultando a memória'
        : name.startsWith('mcp__plugin_cloudflare') ? 'na Cloudflare'
          : name.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' '))
  const raw = String(input?.file_path ?? input?.path ?? input?.notebook_path ?? '').replace(/\\/g, '/')
  if (raw) return `${verb} ${shortPath(raw)}`
  if (name === 'Bash' || name === 'PowerShell') return input?.description ? String(input.description).slice(0, 60) : verb
  if (name === 'Grep' && input?.pattern) return `${verb} "${String(input.pattern).slice(0, 24)}"`
  if (name === 'Agent' && input?.description) return `${verb}: ${String(input.description).slice(0, 40)}`
  if (input?.url) {
    try {
      return `${verb} ${new URL(String(input.url)).host}`
    } catch {
      return verb
    }
  }
  return verb
}

/** Só o "em quê", sem o verbo: o balão do jogo mostra o verbo como ícone. */
function detailOf(name, input) {
  const raw = String(input?.file_path ?? input?.path ?? input?.notebook_path ?? '').replace(/\\/g, '/')
  if (raw) return raw.split('/').filter(Boolean).pop() ?? ''
  if ((name === 'Bash' || name === 'PowerShell') && input?.description) return String(input.description)
  if (name === 'Grep' && input?.pattern) return `"${String(input.pattern).slice(0, 20)}"`
  if (name === 'Glob' && input?.pattern) return String(input.pattern)
  if (name === 'Agent' && input?.description) return String(input.description)
  if (name === 'WebSearch' && input?.query) return String(input.query)
  if (input?.url) {
    try {
      return new URL(String(input.url)).host
    } catch {
      return ''
    }
  }
  if (name.startsWith('mcp__Claude_Browser')) return name.replace('mcp__Claude_Browser__', '').replace(/_/g, ' ')
  return ''
}

// ============================================================ varredura

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function scanAgents(now) {
  const agents = []
  for (const project of await listDir(PROJECTS)) {
    if (!project.isDirectory() || !PROJECT_FILTER.test(project.name)) continue
    const projectDir = join(PROJECTS, project.name)
    for (const entry of await listDir(projectDir)) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const sessionId = entry.name.slice(0, -6)
      const file = join(projectDir, entry.name)
      const info = await stat(file).catch(() => null)
      if (!info) continue
      // Arquivo modificado há pouco não basta: hooks e forks de sessão tocam o
      // transcript sem o agente fazer nada. Quem decide é a hora do último registro.
      if (now - info.mtimeMs <= ACTIVE_WINDOW_MS) {
        const summary = await summaryOf(file, info)
        if (summary && now - summary.lastAt <= ACTIVE_WINDOW_MS) {
          agents.push(toAgent({ id: sessionId, kind: 'session', role: 'captain', name: summary.title ?? `Sessão ${sessionId.slice(0, 6)}`, parent: null, finished: false, summary, now }))
        }
      }
      agents.push(...(await scanSubagents(join(projectDir, sessionId, 'subagents'), sessionId, now)))
    }
  }
  // Um fork de sessão copia os transcripts dos subagentes (sem o .meta.json): o
  // mesmo agente apareceria duas vezes. Fica a cópia que tem descrição.
  const byId = new Map()
  for (const agent of agents) {
    const seen = byId.get(agent.id)
    if (!seen || (!seen.hasMeta && agent.hasMeta)) byId.set(agent.id, agent)
  }
  return [...byId.values()]
}

async function scanSubagents(dir, sessionId, now) {
  const out = []
  for (const entry of await listDir(dir)) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const file = join(dir, entry.name)
    const info = await stat(file).catch(() => null)
    if (!info || now - info.mtimeMs > ACTIVE_WINDOW_MS) continue
    const summary = await summaryOf(file, info)
    if (!summary || now - summary.lastAt > ACTIVE_WINDOW_MS) continue
    const agentId = entry.name.replace(/^agent-/, '').replace(/\.jsonl$/, '')
    const meta = await readFile(join(dir, `agent-${agentId}.meta.json`), 'utf8').then(JSON.parse).catch(() => null)
    const role = await cached(`${file}#role`, { mtimeMs: 0, size: 0 }, async () => {
      const head = await readSlice(file, info.size, false)
      return head ? roleOf(meta, firstPromptOf(parseLines(head))) : null
    })
    if (!role) continue
    const agent = toAgent({ id: agentId, kind: 'subagent', role, name: meta?.description ?? meta?.agentType ?? 'agente', parent: sessionId, finished: meta?.finished === true, summary, now })
    agent.hasMeta = meta !== null
    out.push(agent)
  }
  return out
}

function toAgent({ id, kind, role, name, parent, finished, summary, now }) {
  let state = summary.state
  const quietFor = now - summary.lastAt
  // Subagente que entregou o relatório e parou não volta a trabalhar sozinho.
  if (kind === 'subagent' && state === 'idle' && quietFor > 60_000) finished = true
  if (state === 'tool' && quietFor > TOOL_STALE_MS) state = 'idle'
  if (state === 'thinking' && quietFor > THINK_STALE_MS) state = 'idle'
  // Entregar o relatório (SubagentHandback) é a última coisa que um subagente faz.
  if (kind === 'subagent' && (finished || summary.lastTool?.name === 'SubagentHandback')) state = 'done'

  const tool = summary.lastTool
  const place = tool ? placeOf(tool.name, tool.input) : { station: 'hq' }
  const waitingUser = state === 'tool' && tool?.name === 'AskUserQuestion'
  return {
    id,
    kind,
    role,
    name: String(name).slice(0, 60),
    parent,
    state: waitingUser ? 'waiting' : state,
    station: state === 'idle' || state === 'done' ? 'hq' : place.station,
    target: place.target ?? null,
    tool: tool?.name ?? null,
    toolId: tool?.id ?? null,
    label: tool ? labelOf(tool.name, tool.input) : 'chegando',
    detail: tool ? detailOf(tool.name, tool.input) : '',
    since: summary.lastToolAt ?? null,
    lastAt: summary.lastAt,
    send: summary.lastSend,
  }
}

// ============================================================ serviços

const services = { telemetry: null, telemetryOk: null, telemetryAt: null, telemetryMs: null, sites: {}, pulse: null, pulseOk: null, pulseMs: null }

async function timedFetch(url, init = {}) {
  const started = performance.now()
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'agent-arena/1 (local)' }, ...init })
  return { response, ms: Math.round(performance.now() - started) }
}

async function pollTelemetry() {
  try {
    const { response, ms } = await timedFetch(TELEMETRY_URL)
    if (!response.ok) throw new Error(String(response.status))
    const data = await response.json()
    // O espelho do Cloudflare Pages responderia sem `generatedAt` novo; resposta velha = servidor fora.
    const age = Date.now() - Date.parse(data.generatedAt)
    services.telemetry = {
      host: data.host, os: data.os, uptimeSeconds: data.uptimeSeconds, cpu: data.cpuPercent, ram: data.ramPercent,
      temp: data.cpuTemp, containers: Array.isArray(data.containers) ? data.containers.map((c) => ({ name: String(c.name), up: c.up === true })) : [],
      history: data.history ?? {}, generatedAt: data.generatedAt,
    }
    services.telemetryOk = Number.isFinite(age) && age < 5 * 60_000
    services.telemetryMs = ms
  } catch {
    services.telemetryOk = false
  }
  services.telemetryAt = new Date().toISOString()
}

const num = (v) => (Number.isFinite(v) ? v : null)
let pulseError = null
let pulseBusy = false
let pulseGoodAt = 0
// O servidor está em WiFi: uma leitura perdida é normal e não pode apagar os dados da tela.
// Só depois deste tempo sem resposta é que o mapa assume que o nas-pulse está fora.
const PULSE_TOLERANCE_MS = 30_000

/** Detalhe por container, só pela tailnet. Falhar aqui é normal fora de casa. */
async function pollPulse() {
  if (pulseBusy) return
  pulseBusy = true
  try {
    const started = performance.now()
    const response = await fetch(PULSE_URL, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(String(response.status))
    const data = await response.json()
    const age = Date.now() - Date.parse(data.generatedAt)
    // Só repassa campos conhecidos e tipados: o navegador nunca recebe o JSON cru.
    services.pulse = {
      host: {
        cores: num(data.host?.cores), cpu: num(data.host?.cpuPercent), load1: num(data.host?.load1),
        ram: num(data.host?.ramPercent), swap: num(data.host?.swapPercent), temp: num(data.host?.cpuTemp),
        uptimeSeconds: num(data.host?.uptimeSeconds), rxBps: num(data.host?.rxBps), txBps: num(data.host?.txBps),
        wifiDbm: num(data.host?.wifiDbm),
        disks: Array.isArray(data.host?.disks) ? data.host.disks.map((d) => ({ mount: String(d.mount), usedPercent: num(d.usedPercent), sizeBytes: num(d.sizeBytes) })) : [],
      },
      containers: Array.isArray(data.containers) ? data.containers.map((c) => ({
        name: String(c.name), up: c.up === true, startedAt: num(c.startedAt), cpu: num(c.cpu),
        memBytes: num(c.memBytes), memLimitBytes: num(c.memLimitBytes), rxBps: num(c.rxBps), txBps: num(c.txBps),
      })) : [],
      generatedAt: data.generatedAt,
    }
    services.pulseOk = Number.isFinite(age) && age < 60_000
    services.pulseMs = Math.round(performance.now() - started)
    pulseGoodAt = Date.now()
    pulseError = null
  } catch (error) {
    if (Date.now() - pulseGoodAt > PULSE_TOLERANCE_MS) {
      services.pulseOk = false
      // Fora de casa falhar é normal, mas o motivo tem que aparecer: um 404 aqui ficou
      // invisível e parecia falta de tailnet. Registra só quando o motivo muda.
      const reason = error?.cause?.code ?? error?.message ?? 'erro'
      if (reason !== pulseError) console.warn(`nas-pulse indisponível (${PULSE_URL}): ${reason}`)
      pulseError = reason
    }
  } finally {
    pulseBusy = false
  }
}

async function pollSites() {
  await Promise.all(SITES.map(async (site) => {
    try {
      const { response, ms } = await timedFetch(site.url, { method: 'GET' })
      response.body?.cancel()
      services.sites[site.id] = { ...site, status: response.status, ok: response.status < 500, ms, at: new Date().toISOString() }
    } catch (error) {
      // Sem DNS = ainda não publicado (domínio pendente), não "caiu": fica cinza, não vermelho.
      const code = error?.cause?.code ?? error?.name ?? 'erro'
      const unpublished = code === 'ENOTFOUND'
      services.sites[site.id] = { ...site, status: 0, ok: unpublished ? null : false, ms: null, error: unpublished ? 'sem DNS' : String(code), at: new Date().toISOString() }
    }
  }))
}

// ============================================================ HTTP + SSE

let snapshot = { at: null, agents: [], services }
const clients = new Set()

let scanning = false

async function tick() {
  // Varredura lenta não pode empilhar outra por cima.
  if (scanning) return
  scanning = true
  const now = Date.now()
  try {
    snapshot = { at: new Date(now).toISOString(), agents: await scanAgents(now), services }
  } catch (error) {
    console.error('varredura falhou:', error)
  } finally {
    scanning = false
  }
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`
  for (const response of clients) response.write(payload)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  // Com nosniff, o navegador recusa imagem servida como octet-stream.
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.bin': 'application/octet-stream',
}
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/events') {
    response.writeHead(200, { ...HEADERS, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
    response.write(`retry: 2000\ndata: ${JSON.stringify(snapshot)}\n\n`)
    clients.add(response)
    request.on('close', () => clients.delete(response))
    return
  }
  if (url.pathname === '/favicon.ico') {
    response.writeHead(204, HEADERS).end()
    return
  }
  const relative = url.pathname === '/' ? 'index.html' : normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '')
  if (relative.includes('..')) {
    response.writeHead(400, HEADERS).end()
    return
  }
  try {
    const body = await readFile(join(PUBLIC, relative))
    response.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(relative)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('não encontrado')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Agent Arena em http://127.0.0.1:${PORT}  (projetos: ${PROJECT_FILTER})`)
})

void pollTelemetry()
void pollSites()
void pollPulse()
setInterval(pollTelemetry, TELEMETRY_EVERY_MS)
setInterval(pollPulse, PULSE_EVERY_MS)
setInterval(pollSites, SITES_EVERY_MS)
setInterval(tick, TICK_MS)
void tick()
// Comentário de SSE a cada 20 s mantém proxies e o navegador com a conexão viva.
setInterval(() => {
  for (const response of clients) response.write(': ping\n\n')
}, 20_000)
