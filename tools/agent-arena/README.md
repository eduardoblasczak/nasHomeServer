# Agent Arena

Um mapa em pixel art que mostra, ao vivo, os agentes do Claude Code trabalhando e os serviços do servidor
respondendo. Cada sessão ou subagente é um personagem. Ele anda até o módulo que está usando de verdade
e trabalha ali.

```bash
node tools/agent-arena/server.mjs
```

Depois abra http://127.0.0.1:4580. Também dá para subir pelo painel do navegador do Claude Code, com a
entrada `agent-arena` do `.claude/launch.json`. Precisa de Node 22 e não tem dependências.

## De onde vem cada coisa

| No mapa | Fonte real |
|---|---|
| Personagens | `~/.claude/projects/*Projeto-NAS*/`: as sessões (`<id>.jsonl`) e os subagentes (`<id>/subagents/agent-*.jsonl` + `.meta.json`) com atividade nos últimos 30 min |
| Onde cada um está | A última ferramenta chamada. Ver a tabela abaixo |
| Racks do nas-server | `https://ebls.com.br/api/telemetry`, lida a cada 20 s: containers, CPU, RAM, temperatura e histórico. O drone que sai do Quartel até o nas-server é essa leitura acontecendo |
| Bandeiras dos sites | Um GET a cada 60 s. Verde responde, vermelho falhou, cinza sem DNS (ainda não publicado) |
| VM Oracle | O `financas.ebls.com.br` respondendo. Está atrás do Access, então o 302 prova a borda e o túnel, não o app |

| Módulo | Quem vai até ele |
|---|---|
| Ateliê Frontend | Ler ou editar `nasFinance/frontend` |
| Forja Backend | `nasFinance/backend`, Maven, build da imagem Docker |
| Biblioteca | Ler, procurar, `.md`, memória, skills |
| Terminal | Comandos locais (npm, node, scripts) |
| Correio Git | `git`, `gh`, GitHub |
| Laboratório | O navegador do Claude (preview, páginas) |
| Portal Web | Pesquisa e leitura na web, Artifacts |
| nas-server | `ssh` no NAS, a telemetria, arquivos de `Projeto_NAS/docker/<serviço>`. O personagem para na frente do container do serviço |
| VM Oracle | `ssh nasfinance-oracle`, `docker/uptime-kuma` |
| Cloudflare | `wrangler`, `npm run deploy`, `nasFinance/demo`, `curl` nos sites |
| Quartel | Chamar agentes, mandar mensagem, perguntar a você |
| Fogueira | Ocioso: sentado; depois de 5 min sem nada, dormindo (`z`) |

| Personagem | Papel |
|---|---|
| Capitão (boné dourado) | Uma sessão do Claude Code |
| Pintora (boina rosa) | `ui-designer` |
| Guardião (elmo azul) | `security-reviewer` |
| Engenheiro (capacete laranja) | `ops` |
| Batedor (capuz verde) | Explore |
| Arquiteto (chapéu roxo) | Plan |
| Robô | general-purpose sem papel definido |

As interações também são reais:
- Quando uma sessão chama um subagente, ele sai do Quartel com um raio ligando os dois.
- Um `SendMessage` vira uma carta voando até o destinatário.
- Um agente esperando a sua resposta mostra "? esperando você".

## Temas

O seletor no topo troca só a aparência. Os personagens continuam seguindo os mesmos agentes e os serviços,
os mesmos dados reais. A escolha fica salva no navegador.

- **Arcade**: o mapa padrão, com prédios, portal, nas-server e Cloudflare.
- **Engenho colonial (histórico)**: material para aula de história (`public/engenho.js`). O mapa vira um
  engenho de açúcar do Brasil colônia. Cada lugar explica a etapa real ao passar o mouse:

  | Módulo | Vira | Etapa |
  |---|---|---|
  | Ateliê Frontend | Canavial | Plantio e corte da cana |
  | Forja Backend | Moenda | Moagem, com bois girando a almanjarra |
  | Terminal | Casa das caldeiras | Cozimento do caldo |
  | Biblioteca | Casa de purgar | Purga do açúcar |
  | Correio Git | Trapiche | Armazenagem das caixas |
  | Laboratório | Olaria | Fôrmas de barro |
  | Portal Web | Roça | Roça de subsistência |
  | Quartel | Senzala | Alojamento |
  | nas-server | Casa-grande | Residência do senhor; cada janela acesa é um container rodando |
  | VM Oracle | Capela | Capela do engenho |
  | Cloudflare | Porto | Embarque; a bandeira do navio mostra se a demo responde |

  A sessão do Claude vira o senhor de engenho, que dá as ordens da varanda da casa-grande. Os subagentes
  viram as pessoas escravizadas que fazem o trabalho.
  - **Sem violência:** não há castigo físico como mecânica, e as pessoas são retratadas com dignidade.
  - **Painel histórico:** traz fatos verificáveis, entre eles o tráfico, a moenda, a resistência e
    Palmares, as leis abolicionistas e a Lei Áurea.
  - **Moenda:** é movida por bois, como na maioria dos engenhos, e não por pessoas puxando a roda.

- **Servidor (nas-server)**: a exceção à regra acima, porque aqui o mapa é outro e o protagonista é o servidor
  (`public/servidor.js`). Os agentes saem do mapa e ficam só no painel.

  | No mapa | Fonte real |
  |---|---|
  | Casa na avenida | Um container. Apagada e com tábuas na porta = parado |
  | Pacotes | Bytes/s de rede de cada container, em escala logarítmica. A cor diz de onde vêm: túnel, rede de casa e tailnet, rede interna, ou resposta saindo |
  | Fumaça e barra na parede | CPU e memória do container |
  | Zelador | Faz a ronda pelas casas do bairro. O passeio é só vida no mapa; o medido é a escolha da parada e o tempo nela, maiores onde há mais movimento. Faíscas = casa com atividade real. Senta se o bairro está quieto; `!` se um container cai ou reinicia |
  | Usina | CPU, carga, RAM (caixa d'água), swap (barril) e temperatura do host |
  | Silos | Disco de `/` e `/data` |
  | Clima | Acima de 60 °C, o mapa esquenta |

  **De onde vêm os números:** do [`nas-pulse`](../../docker/nas-pulse/README.md), lido pela tailnet a cada 5 s.
  Sem ele, o mapa usa a telemetria pública e avisa: as casas acendem e apagam e os zeladores seguem a ronda, mas
  sem tráfego, fumaça nem faíscas, porque esses números não existem nela. O motivo da falha aparece no terminal do Arena. A origem do tráfego é inferida pelo papel do serviço (o
  cAdvisor só mede o volume), e a dica do mouse deixa isso explícito. `ARENA_PULSE_URL` troca o endereço.

## Interlagos (tela de teste)

Em http://127.0.0.1:4580/interlagos.html, com um carro por container e os mesmos dados do modo Servidor.

| Na corrida | Medido |
|---|---|
| Velocidade | Peso do serviço: 70% CPU e 30% memória, em escala logarítmica. O seletor da torre escolhe o efeito. **Mais rápido** (padrão): 110 s por volta sem carga, 30 s no máximo. **Mais lento**: 45 s sem carga, 180 s no máximo. Trocar o modo faz uma nova largada |
| Posição e voltas | Distância percorrida na sessão: na frente fica quem mais consome ou quem menos consome, conforme o modo. Zera ao recarregar a página |
| Rastro | Tráfego de rede |
| Traço na torre | Memória, do limite quando existe (senão, de 512 MiB) |
| Box | Reinício, memória acima de 85% do limite ou CPU acima de 3 vezes o normal dele. A regra de CPU só vale depois dos 5 min da volta de apresentação |
| Muro e bandeira amarela | Serviço offline |
| Bandeira vermelha | `cloudflared` offline |
| Corrida congelada | Mais da metade fora (a medição parou) ou nenhuma fonte respondendo |
| Chuva | Swap crescendo ou RAM acima de 85% |

**Fidelidade:** o traçado vem de `build-interlagos.py` (pista medida do TUMFTM, LGPL-3.0, encaixada nas vias do
OpenStreetMap com erro médio de 3 m). Prédios, lagos e mata são do OpenStreetMap (ODbL). Arquibancadas
temporárias, tendas e patrocinadores são ilustrativos, e os patrocinadores são os seus próprios projetos, sem marcas
de terceiros. Os botões "Simular" só mudam a tela. Ainda não existe detecção de vazamento de memória.

## Privacidade

O servidor escuta só em `127.0.0.1`. Os transcripts nunca saem da máquina: o feed leva só o nome da
ferramenta e um rótulo curto (nome do arquivo ou a descrição do comando). Nada é executado em servidor
nenhum. A telemetria e os sites são lidos por GET, como um navegador faria.

## Armadilha

Abrir um transcript grande que ainda está sendo escrito leva uns 45 s nesta máquina, porque o antivírus
varre o arquivo inteiro a cada abertura. Por isso o servidor mantém os arquivos ativos abertos e lê pelo
mesmo handle. A primeira aparição de uma sessão grande pode demorar esse tempo; depois é instantânea.

Variáveis: `ARENA_PORT` (padrão 4580) e `ARENA_PROJECTS`, uma regex das pastas de projeto (padrão
`Projeto-NAS`; `.` mostra todas).
