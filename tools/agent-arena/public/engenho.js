// Tema histórico "Engenho colonial": o mesmo mapa e os mesmos dados ao vivo,
// redesenhados como um engenho de açúcar do Brasil colônia (séculos XVI a XIX).
// É material de aula: cada lugar explica o processo real ao passar o mouse, e o
// painel lateral traz o contexto histórico. As pessoas escravizadas são
// retratadas com dignidade; não há castigo físico como mecânica de jogo.

export const ENGENHO = {
  id: 'engenho',
  name: 'Engenho colonial (histórico)',
  subtitle: 'modo histórico · um engenho de açúcar do Brasil colônia',
  legend:
    'Modo histórico para aula: cada personagem segue um agente real, mas o cenário mostra um engenho de açúcar colonial. Passe o mouse sobre cada lugar para ler o que acontecia ali.',
  fire: { name: 'Terreiro', about: 'Espaço de convivência. Ali se preservaram cantos, danças, a capoeira e a religiosidade de matriz africana, apesar da repressão.' },
  ground: { grass: ['#5c8a3a', '#608e3c'], grassDots: ['#527d33', '#6c9a45'], path: '#a8834f', pathDots: ['#967244', '#b8915c'], pathEdge: '#7f6038', plaza: ['#8a7a62', '#9c8b70'], flowers: ['#f2d16b', '#ffffff'] },

  stations: {
    frontend: { sign: 'Canavial', task: 'corte da cana', about: 'Plantio e corte da cana-de-açúcar, a pé e com foice, sob sol forte. Na safra, as jornadas avançavam pela noite.' },
    backend: { sign: 'Moenda', task: 'moagem', about: 'A cana era esmagada entre cilindros movidos por bois, cavalos ou roda d’água. Quem colocava a cana entre os cilindros arriscava ter a mão presa.' },
    library: { sign: 'Casa de purgar', task: 'purga do açúcar', about: 'O melado descansava em fôrmas de barro por semanas até virar açúcar branco e mascavo.' },
    terminal: { sign: 'Casa das caldeiras', task: 'cozimento do caldo', about: 'O caldo fervia em tachos de cobre até engrossar. O calor e o fogo constante tornavam este um dos trabalhos mais perigosos.' },
    git: { sign: 'Trapiche', task: 'encaixotando açúcar', about: 'Armazém onde as caixas de açúcar esperavam o embarque para a Europa.' },
    browser: { sign: 'Olaria', task: 'fôrmas de barro', about: 'Produzia as fôrmas de barro, as telhas e os tijolos usados no engenho.' },
    portal: { sign: 'Roça', task: 'roça de mandioca', about: 'Plantação de mandioca, feijão e milho. Muitas vezes os escravizados cultivavam a própria comida nos poucos momentos de folga.' },
    hq: { sign: 'Senzala', task: 'na senzala', about: 'Alojamento das pessoas escravizadas: chão de terra, pouca ventilação, famílias separadas e vigilância constante.' },
    nas: { sign: 'Casa-grande', task: 'serviço na casa-grande', about: 'Residência do senhor de engenho e da família, centro do poder sobre as terras e as pessoas. Cada janela acesa é um container real do servidor.' },
    oracle: { sign: 'Capela', task: 'capela', about: 'A capela do engenho. A Igreja também integrava a ordem colonial.' },
    cloud: { sign: 'Porto', task: 'embarque no porto', about: 'Dali o açúcar seguia para a Europa. Pelos portos também desembarcaram, à força, milhões de africanos.' },
  },

  // A sessão do Claude é o senhor de engenho; os subagentes, as pessoas
  // escravizadas obrigadas a trabalhar para ele. Os papéis só mudam a roupa.
  roles: {
    captain: { label: 'Senhor de engenho (sessão)', pal: { h: '#e8e2d0', s: '#f0c9a0', e: '#1a1a1a', c: '#ece8de', a: '#6b4a2b', p: '#d9d2c3', b: '#3a2a1a' }, head: ['..hhhh..', 'hhhhhhhh'] },
    painter: { label: 'Escravizada (ui-designer)', pal: { h: '#b5452f', s: '#6b4226', e: '#140c08', c: '#e9e1cf', a: '#cfc3a6', p: '#cfc3a6', b: '#6b4226' }, head: ['.hhhh...', 'hhhhhh..'] },
    guard: { label: 'Escravizado (security-reviewer)', pal: { h: '#d9b86a', s: '#5a3620', e: '#140c08', c: '#e2d8c2', a: '#cfc3a6', p: '#b9ab8c', b: '#5a3620' }, head: ['..hhhh..', 'hhhhhhhh'] },
    engineer: { label: 'Escravizado (ops)', pal: { h: '#3d5a80', s: '#7a4b2c', e: '#140c08', c: '#e9e1cf', a: '#cfc3a6', p: '#a99a7a', b: '#7a4b2c' }, head: ['..hhhh..', '.hhhhhh.'] },
    scout: { label: 'Escravizado (Explore)', pal: { h: '#1e1410', s: '#4a2c18', e: '#0c0805', c: '#ddd3bd', a: '#cfc3a6', p: '#b9ab8c', b: '#4a2c18' }, head: ['..hhhh..', '.hhhhhh.'] },
    architect: { label: 'Escravizada (Plan)', pal: { h: '#c98b2b', s: '#835233', e: '#140c08', c: '#e9e1cf', a: '#cfc3a6', p: '#cfc3a6', b: '#835233' }, head: ['.hhhh...', 'hhhhhh..'] },
    robot: { label: 'Escravizado (general-purpose)', pal: { h: '#cdb36a', s: '#5e3a22', e: '#140c08', c: '#e2d8c2', a: '#cfc3a6', p: '#a99a7a', b: '#5e3a22' }, head: ['..hhhh..', 'hhhhhhhh'] },
  },

  captainTask: { spawn: 'dá uma ordem', mail: 'manda um recado', ask: 'chama você', think: 'pensando' },

  facts: [
    'Entre os séculos XVI e XIX, cerca de 4,8 milhões de africanos escravizados desembarcaram no Brasil, o maior destino do tráfico atlântico.',
    'O açúcar foi a base da economia colonial nos séculos XVI e XVII, sobretudo em Pernambuco e na Bahia.',
    'Na moenda, a cana era esmagada por cilindros movidos por bois, cavalos ou roda d’água. Colocar a cana entre os cilindros causava mutilações.',
    'Houve resistência o tempo todo: fugas, sabotagem, quilombos como Palmares e revoltas como a dos Malês, em Salvador, em 1835.',
    'Zumbi dos Palmares foi morto em 20 de novembro de 1695. A data é hoje o Dia da Consciência Negra.',
    '1850: Lei Eusébio de Queirós proíbe o tráfico. 1871: Lei do Ventre Livre. 1885: Lei dos Sexagenários.',
    '13 de maio de 1888: a Lei Áurea abole a escravidão. O Brasil foi o último país das Américas a fazê-lo, e os libertos não receberam terra nem reparação.',
  ],
}

// ============================================================ desenho estático (vai para o fundo)

function shadow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(x + 3, y + 4, w, h)
}

function roofTiles(ctx, x, y, w, h, color, dark) {
  ctx.fillStyle = color
  ctx.fillRect(x - 2, y, w + 4, h)
  ctx.fillStyle = dark
  for (let i = 3; i < h; i += 3) ctx.fillRect(x - 2, y + i, w + 4, 1)
  for (let i = 0; i < w + 4; i += 5) ctx.fillRect(x - 2 + i, y, 1, h)
}

function thatch(ctx, x, y, w, h) {
  ctx.fillStyle = '#b8964f'
  ctx.fillRect(x - 3, y, w + 6, h)
  ctx.fillStyle = '#9c7c3c'
  for (let i = 0; i < w + 6; i += 2) ctx.fillRect(x - 3 + i, y + (i % 4 ? 2 : 0), 1, h - 2)
  ctx.fillStyle = '#d3b46a'
  ctx.fillRect(x - 3, y, w + 6, 1)
}

function wall(ctx, x, y, w, h, color) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  for (let i = 0; i < w; i += 7) ctx.fillRect(x + i, y, 1, h)
}

export function paintStation(ctx, key, rect, TILE) {
  const [tx, ty, tw, th] = rect
  const x = tx * TILE
  const y = ty * TILE
  const w = tw * TILE
  const h = th * TILE
  switch (key) {
    case 'frontend': {
      // canavial: fileiras de cana; o balanço é desenhado por cima, ao vivo
      ctx.fillStyle = '#7a5a34'
      ctx.fillRect(x, y + 12, w, h - 12)
      for (let row = 0; row < 5; row++) {
        ctx.fillStyle = '#6a4c2a'
        ctx.fillRect(x + 2, y + 18 + row * 9, w - 4, 2)
      }
      return true
    }
    case 'backend': {
      // moenda: galpão aberto sobre esteios, com o terreiro circular dos bois
      shadow(ctx, x, y, w, h)
      ctx.fillStyle = '#9b8466'
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2 + 6, w / 2 - 4, h / 2 - 8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#8a745a'
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2 + 6, w / 2 - 14, h / 2 - 16, 0, 0, Math.PI * 2)
      ctx.fill()
      roofTiles(ctx, x + 2, y, w - 4, 11, '#a5482c', '#7e331d')
      ctx.fillStyle = '#5a3d22'
      for (const px of [x + 4, x + w - 7]) ctx.fillRect(px, y + 11, 3, h - 14)
      return true
    }
    case 'library': {
      // casa de purgar: fôrmas cônicas de barro em fileiras
      shadow(ctx, x, y, w, h)
      wall(ctx, x, y + 14, w, h - 14, '#e8dcc2')
      roofTiles(ctx, x, y, w, 15, '#a5482c', '#7e331d')
      for (let i = 0; i < 9; i++) {
        const fx = x + 8 + i * 9
        ctx.fillStyle = '#b5643a'
        ctx.beginPath()
        ctx.moveTo(fx, y + 34)
        ctx.lineTo(fx + 6, y + 34)
        ctx.lineTo(fx + 3, y + 44)
        ctx.fill()
        ctx.fillStyle = '#f4efe2'
        ctx.fillRect(fx + 1, y + 34, 4, 2)
      }
      ctx.fillStyle = '#4a3426'
      ctx.fillRect(x + w / 2 - 4, y + h - 11, 8, 11)
      return true
    }
    case 'terminal': {
      // casa das caldeiras: fornalhas e a chaminé
      shadow(ctx, x, y, w, h)
      wall(ctx, x, y + 14, w, h - 14, '#d8ccb2')
      roofTiles(ctx, x, y, w, 15, '#8e3e26', '#6a2b18')
      ctx.fillStyle = '#7a6a58'
      ctx.fillRect(x + w - 16, y - 12, 8, 26)
      ctx.fillStyle = '#5c4f40'
      ctx.fillRect(x + w - 16, y - 12, 8, 2)
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#3a2a1c'
        ctx.fillRect(x + 10 + i * 24, y + h - 18, 12, 8)
      }
      ctx.fillStyle = '#4a3426'
      ctx.fillRect(x + w / 2 - 4, y + h - 11, 8, 11)
      return true
    }
    case 'git': {
      // trapiche: armazém com caixas de açúcar
      shadow(ctx, x, y, w, h)
      wall(ctx, x, y + 14, w, h - 14, '#dccfb3')
      roofTiles(ctx, x, y, w, 15, '#a5482c', '#7e331d')
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          const bx = x + 6 + i * 11 + (i > 1 ? 30 : 0)
          ctx.fillStyle = '#9c7444'
          ctx.fillRect(bx, y + 30 + j * 9, 9, 8)
          ctx.fillStyle = '#7a5630'
          ctx.fillRect(bx, y + 33 + j * 9, 9, 1)
        }
      }
      ctx.fillStyle = '#4a3426'
      ctx.fillRect(x + w / 2 - 6, y + h - 14, 12, 14)
      return true
    }
    case 'browser': {
      // olaria: forno em cúpula e tijolos secando
      shadow(ctx, x, y, w, h)
      wall(ctx, x, y + 14, w - 30, h - 14, '#d9c9a8')
      thatch(ctx, x, y + 2, w - 30, 13)
      ctx.fillStyle = '#a0522d'
      ctx.beginPath()
      ctx.arc(x + w - 14, y + h - 12, 14, Math.PI, 0)
      ctx.fill()
      ctx.fillRect(x + w - 28, y + h - 12, 28, 12)
      ctx.fillStyle = '#2b1a10'
      ctx.fillRect(x + w - 18, y + h - 10, 8, 10)
      ctx.fillStyle = '#c0703e'
      for (let i = 0; i < 6; i++) ctx.fillRect(x + 6 + i * 7, y + h - 8, 5, 3)
      ctx.fillStyle = '#4a3426'
      ctx.fillRect(x + 20, y + h - 11, 8, 11)
      return true
    }
    case 'portal': {
      // roça: canteiros de mandioca
      ctx.fillStyle = '#6e5232'
      ctx.fillRect(x, y + 8, w, h - 8)
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 11; c++) {
          const px = x + 4 + c * 8.5
          const py = y + 14 + r * 11
          ctx.fillStyle = '#3f7a35'
          ctx.fillRect(px, py, 2, 5)
          ctx.fillStyle = '#5ea24a'
          ctx.fillRect(px - 2, py - 1, 6, 2)
        }
      }
      return true
    }
    case 'hq': {
      // senzala: construção baixa e comprida, sem janelas, portas pequenas
      shadow(ctx, x, y, w, h)
      wall(ctx, x, y + 16, w, h - 16, '#b9a27a')
      thatch(ctx, x, y + 2, w, 15)
      ctx.fillStyle = '#3a2618'
      for (let i = 0; i < 6; i++) ctx.fillRect(x + 8 + i * 20, y + h - 12, 7, 12)
      ctx.fillStyle = '#4a3426'
      ctx.fillRect((tx + Math.floor(tw / 2)) * TILE + 4, y + 16, 8, 6)
      return true
    }
    case 'nas': {
      // casa-grande: sobrado caiado com varanda e colunas
      shadow(ctx, x, y, w, h)
      wall(ctx, x + 4, y + 16, w - 8, h - 16, '#f2ece0')
      roofTiles(ctx, x + 4, y + 2, w - 8, 15, '#b04e30', '#86371f')
      ctx.fillStyle = '#e4dccb'
      ctx.fillRect(x, y + h - 22, w, 4)
      ctx.fillStyle = '#d8cfbd'
      for (let i = 0; i < 9; i++) ctx.fillRect(x + 6 + i * 22, y + h - 18, 3, 18)
      ctx.fillStyle = '#4a3426'
      ctx.fillRect(x + w / 2 - 6, y + h - 14, 12, 14)
      return true
    }
    case 'oracle': {
      // capela: caiada, com torre do sino e cruz
      shadow(ctx, x, y, w, h)
      wall(ctx, x + 10, y + 14, w - 20, h - 14, '#f4efe4')
      roofTiles(ctx, x + 10, y + 6, w - 20, 9, '#b04e30', '#86371f')
      ctx.fillStyle = '#f4efe4'
      ctx.fillRect(x + w / 2 - 6, y - 6, 12, 22)
      ctx.fillStyle = '#5a3d22'
      ctx.fillRect(x + w / 2 - 1, y - 14, 2, 8)
      ctx.fillRect(x + w / 2 - 3, y - 12, 6, 2)
      ctx.fillStyle = '#c9a227'
      ctx.fillRect(x + w / 2 - 2, y + 1, 4, 4)
      ctx.fillStyle = '#4a3426'
      ctx.fillRect(x + w / 2 - 4, y + h - 12, 8, 12)
      return true
    }
    case 'cloud': {
      // porto: água, trapiche de madeira
      ctx.fillStyle = '#2f6d8f'
      ctx.fillRect(x - 4, y, w + 8, h + 6)
      ctx.fillStyle = '#3d82a8'
      for (let i = 0; i < 8; i++) ctx.fillRect(x + (i * 13) % w, y + 6 + ((i * 7) % (h - 6)), 6, 1)
      ctx.fillStyle = '#7a5630'
      ctx.fillRect(x - 4, y + h - 6, w + 8, 6)
      for (let i = 0; i < w + 8; i += 8) ctx.fillRect(x - 4 + i, y + h, 2, 6)
      return true
    }
    default:
      return false
  }
}

export function drawPalm(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(x + 8, y + 15, 6, 2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#7a5a34'
  for (let i = 0; i < 9; i++) ctx.fillRect(x + 7 + (i < 4 ? 0 : 1), y + 6 + i, 2, 1)
  ctx.fillStyle = '#2f6b2a'
  for (const [dx, dy, w] of [[-1, 2, 7], [10, 2, 7], [2, 0, 12], [0, 4, 5], [11, 4, 5]]) ctx.fillRect(x + dx, y + dy + 2, w, 2)
  ctx.fillStyle = '#4a8f3a'
  ctx.fillRect(x + 4, y + 1, 8, 2)
  ctx.fillStyle = '#6b4a2b'
  ctx.fillRect(x + 7, y + 5, 2, 2)
}

// ============================================================ desenho ao vivo

/**
 * O que se mexe no engenho, ligado aos dados reais:
 *   - a cana balança mais quando há alguém no Canavial
 *   - os bois giram a moenda (mais rápido com alguém lá)
 *   - a chaminé das caldeiras solta fumaça
 *   - cada janela da casa-grande é um container: acesa = rodando
 *   - o navio no porto sobe a bandeira verde se a demo responde
 */
export function drawLive(ctx, api) {
  const { TILE, time, REDUCED, busy, containers, siteOk, puff, stations } = api
  const rect = (key) => stations[key].rect.map((v) => v * TILE)

  // canavial
  {
    const [x, y, w] = rect('frontend')
    const strength = busy.has('frontend') ? 2 : 1
    for (let row = 0; row < 5; row++) {
      for (let c = 0; c < 15; c++) {
        const sx = x + 3 + c * 6.2
        const sy = y + 20 + row * 9
        const sway = REDUCED ? 0 : Math.round(Math.sin(time * 1.6 + c * 0.7 + row) * strength)
        ctx.fillStyle = '#5f8f2e'
        ctx.fillRect(sx, sy - 9, 1, 9)
        ctx.fillStyle = '#86b84a'
        ctx.fillRect(sx - 1 + sway, sy - 11, 3, 2)
        ctx.fillRect(sx + 1 + sway, sy - 13, 2, 2)
      }
    }
    void w
  }

  // moenda: os bois andam em círculo puxando a almanjarra
  {
    const [x, y, w, h] = rect('backend')
    const cx = x + w / 2
    const cy = y + h / 2 + 6
    const speed = REDUCED ? 0 : busy.has('backend') ? 1.4 : 0.5
    const a = time * speed
    ctx.fillStyle = '#6b4a2b'
    ctx.fillRect(cx - 3, cy - 10, 6, 12)
    ctx.fillStyle = '#8a6a44'
    ctx.fillRect(cx - 2, cy - 12, 4, 3)
    const rx = w / 2 - 9
    const ry = h / 2 - 12
    ctx.strokeStyle = '#4a3426'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy - 4)
    ctx.lineTo(cx + Math.cos(a) * rx, cy - 4 + Math.sin(a) * ry)
    ctx.stroke()
    for (const offset of [0, 0.32]) {
      const bx = cx + Math.cos(a - offset) * rx
      const by = cy - 4 + Math.sin(a - offset) * ry
      const right = -Math.sin(a) > 0
      ctx.fillStyle = '#7d5a3c'
      ctx.fillRect(Math.round(bx) - 5, Math.round(by) - 3, 10, 5)
      ctx.fillStyle = '#5c402a'
      ctx.fillRect(Math.round(bx) + (right ? 4 : -7), Math.round(by) - 4, 3, 3)
      ctx.fillStyle = '#e8dcc2'
      ctx.fillRect(Math.round(bx) + (right ? 6 : -7), Math.round(by) - 5, 1, 1)
      ctx.fillStyle = '#3a2a1a'
      ctx.fillRect(Math.round(bx) - 4, Math.round(by) + 2, 1, 2)
      ctx.fillRect(Math.round(bx) + 3, Math.round(by) + 2, 1, 2)
    }
  }

  // caldeiras: fumaça na chaminé e brilho das fornalhas
  {
    const [x, y, w, h] = rect('terminal')
    const hot = busy.has('terminal')
    if (!REDUCED && Math.random() < (hot ? 0.35 : 0.12)) puff(x + w - 12, y - 14)
    for (let i = 0; i < 3; i++) {
      const flicker = REDUCED ? 0.7 : 0.55 + Math.sin(time * 9 + i) * 0.25
      ctx.fillStyle = `rgba(255, ${hot ? 120 : 90}, 30, ${flicker})`
      ctx.fillRect(x + 12 + i * 24, y + h - 16, 8, 5)
    }
  }

  // casa-grande: uma janela por container real
  {
    const [x, y, w] = rect('nas')
    const list = containers.slice(0, 16)
    list.forEach((c, i) => {
      const col = i % 8
      const row = Math.floor(i / 8)
      const wx = x + 12 + col * 22
      const wy = y + 26 + row * 20
      ctx.fillStyle = '#5a3d22'
      ctx.fillRect(wx - 1, wy - 1, 12, 14)
      const glow = REDUCED ? 1 : 0.85 + Math.sin(time * 2 + i) * 0.15
      ctx.fillStyle = c.up ? `rgba(255, 210, 110, ${glow})` : '#3b2a22'
      ctx.fillRect(wx, wy, 10, 12)
      ctx.fillStyle = '#5a3d22'
      ctx.fillRect(wx + 4, wy, 1, 12)
      ctx.fillRect(wx, wy + 5, 10, 1)
      if (!c.up) {
        ctx.fillStyle = '#7e331d'
        ctx.fillRect(wx, wy, 4, 12)
        ctx.fillRect(wx + 6, wy, 4, 12)
      }
    })
    void w
  }

  // capela: lamparina na porta acompanha o nasFinance real
  {
    const [x, y, w, h] = rect('oracle')
    const ok = siteOk('financas')
    ctx.fillStyle = ok === false ? '#5c1f27' : `rgba(255, 200, 90, ${REDUCED ? 0.9 : 0.7 + Math.sin(time * 4) * 0.2})`
    ctx.fillRect(x + w / 2 + 5, y + h - 12, 2, 3)
  }

  // porto: navio balançando, bandeira = demo respondendo
  {
    const [x, y, w] = rect('cloud')
    const bob = REDUCED ? 0 : Math.round(Math.sin(time * 1.4) * 1.5)
    const sx = x + w / 2 - 18
    const sy = y + 22 + bob
    ctx.fillStyle = '#5a3d22'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + 36, sy)
    ctx.lineTo(sx + 30, sy + 8)
    ctx.lineTo(sx + 6, sy + 8)
    ctx.fill()
    ctx.fillStyle = '#3a2618'
    ctx.fillRect(sx + 17, sy - 22, 2, 22)
    ctx.fillStyle = '#efe6d2'
    ctx.fillRect(sx + 7, sy - 20, 10, 14)
    ctx.fillRect(sx + 19, sy - 18, 9, 12)
    const ok = siteOk('demo')
    ctx.fillStyle = ok === false ? '#c0392b' : ok === null ? '#8a8a8a' : '#2f8f4a'
    ctx.fillRect(sx + 19, sy - 24, 6, 3)
  }
}
