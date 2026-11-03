// Só para desenvolvimento, sem Docker: faz no PC o que o nginx faz no servidor.
// Serve public/, na raiz e em /nasrace/, e encaminha api/pulse para o nas-pulse, que só responde dentro
// da tailnet.
//
// Uso: node dev-server.mjs   (Node 22+, sem dependências)  ->  http://127.0.0.1:4590

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 4590)
const PULSE_URL = process.env.NASRACE_PULSE_URL ?? 'http://nas-server.tail80d72a.ts.net:9106/api/race'
const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url))

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.bin': 'application/octet-stream', '.json': 'application/json',
}
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/nasrace') {
    response.writeHead(301, { Location: `/nasrace/${url.search}` }).end()
    return
  }
  const pathname = url.pathname.replace(/^\/nasrace(?=\/)/, '')
  if (pathname === '/api/pulse') {
    try {
      const upstream = await fetch(PULSE_URL, { signal: AbortSignal.timeout(7000) })
      response.writeHead(upstream.status, { ...HEADERS, 'Content-Type': 'application/json' })
      response.end(await upstream.text())
    } catch {
      response.writeHead(502, HEADERS).end()
    }
    return
  }
  const relative = pathname === '/' ? 'index.html' : normalize(decodeURIComponent(pathname)).replace(/^[\\/]+/, '')
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

server.listen(PORT, '127.0.0.1', () => console.log(`NasRace em http://127.0.0.1:${PORT}`))
