# NasRace — os containers do nas-server correndo em Interlagos

Cada container do servidor é um carro de F1 no traçado real de Interlagos, em 3D e ao vivo. A corrida
é movida pelo [`nas-pulse`](../nas-pulse/README.md): nada na tela de corrida é inventado.

```
navegador ── https://ebls.com.br/nasrace/ ──► Cloudflare Tunnel ──► 172.17.0.1:9107 ──► nginx (nasrace) ──► nas-pulse ──► prometheus
```

| Item | Valor |
| :--- | :--- |
| Endereço | https://ebls.com.br/nasrace/ (público) |
| Caminho no servidor | `~/nasrace` (não guarda dados, só o site) |
| Porta | `9107`, presa em `172.17.0.1`, a rede interna do Docker. Só o túnel chega nela |
| Container | `nasrace`: nginx sem privilégios, `read_only`, `cap_drop: ALL`, 48 MiB (usa uns 7 MiB) |
| Dados | `GET /nasrace/api/pulse`, encaminhado ao `/api/race` do `nas-pulse` pela mesma origem |

O container também aparece na corrida, como `NSR`: ele é mais um serviço do servidor.

## Na corrida

| Na tela | De onde vem |
|---|---|
| Velocidade | Peso do serviço: 70% CPU e 30% memória, em escala logarítmica. O seletor da torre escolhe o efeito. **Mais rápido** (padrão): 110 s por volta sem carga, 30 s no máximo. **Mais lento**: 45 s sem carga, 180 s no máximo. Trocar o modo faz uma nova largada |
| Posição, voltas e intervalo | Distância percorrida na sessão. Zera ao recarregar a página |
| Volta mais rápida (ponto roxo) | Medida na própria corrida. Volta com parada no box não conta |
| Rastro | Tráfego de rede |
| Traço na torre | Memória, do limite quando existe (senão, de 512 MiB) |
| Box | Reinício, memória acima de 85% do limite ou CPU acima de 3 vezes o normal dele. A regra de CPU só vale depois dos 5 min da volta de apresentação |
| Muro e bandeira amarela | Serviço offline |
| Bandeira vermelha | `cloudflared` offline |
| Corrida congelada | Mais da metade fora (a medição parou) ou nenhuma leitura há mais de 30 s |
| Chuva e pista molhada | Swap crescendo ou RAM acima de 85% |

Público, patrocínios, tendas e arquibancadas temporárias são ilustrativos. Os patrocinadores são só os
projetos do próprio servidor, sem marcas de terceiros.

**Comandos:** roda do mouse ou dois dedos aproximam, arrastar move, duplo clique volta à vista geral.
Clicar em uma linha da torre segue o carro; se ele parar no box, a câmera dá a volta para mostrar a
garagem. `?fps` mostra quadros por segundo e tempos na tela. `?modo=2d` abre a versão de reserva,
`?qualidade=alta|media|baixa|minima` fixa um nível de qualidade e `?carga=leve|cheia` fixa o que é
montado ao abrir.

## Decisões que não são óbvias

**Público, com o mínimo de dados.** A tela mostra o nome e o consumo de cada serviço, o que desenha o
mapa interno da stack. Abrir foi uma decisão consciente, em 2026-11-03, para poder mostrar o projeto.
Por isso o nginx encaminha só o `/api/race`, com o que a tela mostra: uptime, carga, sinal do WiFi e
rede do host continuam na tailnet.

**Subcaminho em vez de subdomínio.** No túnel, a primeira regra que casa vence, então a do NasRace fica
antes da regra geral do `ebls.com.br`, que é a do portfólio. Os caminhos do site são todos relativos,
e o nginx responde igual em `/nasrace/` e na raiz.

**Uma leitura para todos os visitantes.** O nginx guarda a resposta do `nas-pulse` por 3 s e segura os
pedidos simultâneos, então o número de pessoas olhando não vira carga no Prometheus.

**Dois tipos de cache.** Texturas, Three.js, fontes, logos e `.bin` ficam 1 dia na Cloudflare e no
navegador, o que poupa o upload de casa: ao trocar um deles, limpe o cache da Cloudflare. O resto vai
com `private, no-cache`. Sem o `private`, o Browser Cache TTL da zona (4 h) substituiria o `no-cache`,
e uma correção demoraria horas a chegar a quem já abriu a tela.

**Aparelho fraco abre mais leve.** Chão e sombras são cozidos uma vez, ao abrir, e o ajuste automático
de qualidade não devolve essa memória depois. Toque, placa integrada, até 4 GB de memória ou textura
máxima abaixo de 8192 usam a carga leve: um quarto da memória nessas texturas, e 1,7 milhão de
triângulos em vez de 3 na vista geral. Placa simulada por software ou sem HDR vai direto para o 2D.

**Gente em malha, só de perto.** São cerca de 36 mil pessoas, em grupos por área, para a câmera descartar
o que está fora da tela. Abaixo de 100 m elas têm braços, pernas e cabeça; até 420 m, uma forma mais
simples; acima disso, saem de cena e o acabamento das cadeiras desenha um pontilhado no lugar, o que
mantém a vista geral leve. Quem está no chão tem uma sombra à parte, porque a sombra do sol é cozida
uma vez só e não acompanharia quem anda. Uma grade de 2 m guarda o que ocupa o chão: ninguém nasce nem
anda dentro de prédio, caminhão ou tenda, e o caminho acompanha a inclinação do terreno. Todos os
movimentos vêm do relógio do shader: com as animações do sistema desligadas, todo mundo fica parado.

**Prédios em andares inteiros.** A altura de cada prédio é arredondada para múltiplos de 3 m. Assim o
telhado nunca corta uma fileira de janelas, que são pintadas no shader.

**Volume em vez de imagem própria.** Atualizar o site não gera camadas novas no disco do Docker, que é
o menor deste servidor. O servidor só entrega arquivos: quem desenha é a placa de vídeo do navegador.

**`~/nasrace` em vez de `/data`.** Não há dados para proteger, e `/data` pede `sudo`.

**O relógio do servidor fica fora da conta.** Depois de uma queda de luz ele pode estar errado, então a
leitura só é considerada parada se `generatedAt` não mudar por 60 s no relógio do navegador.

**Duas versões do material de cenário.** O compilador de shader do Windows costuma executar todos os
ramos de um `if`. Separar o material da cidade (`KIT_VENUE` desligado) e desenhar o terreno por último
derrubou o custo de GPU de 7,5 para 3,5 ms na vista geral.

**Nada de trabalho longo de uma vez na GPU.** Um comando que passe de 2 s faz o Windows reiniciar o
driver de vídeo (evento 153 do `nvlddmkm`), e todos os programas que usam a placa sentem. Por isso o chão é
cozido em ladrilhos, esperando a GPU entre um e outro, e as telas de pintura ficam na CPU.

**A parede dos boxes está 6 m recuada em relação à planta.** Vista do alto, a cobertura esconderia as
paradas. É o único desvio proposital do mapa.

## Como está organizado

`public/src/`:

- `circuit.js`: geometria, altitude, linha de corrida e perfil de velocidade.
- `race.js`: as regras, sem nenhum desenho. `feed.js`: leitura do `nas-pulse`.
- `venue.js`: onde ficam arquibancadas, tendas e barreiras. `surfaces.js`: áreas de escape e pátio.
- `ui.js`: torre, cartão do carro e mensagens, em HTML.
- `render3d/`: `terrain`, `track`, `scenery`, `gp`, `brands`, `carmodel`, `cars`, `camera`, `post`, mais as peças
  do autódromo: `stands` (arquibancadas), `pitlane` (boxes e torre de controle), `paddock` (caminhões,
  motorhomes, tendas e carros) e `people`. `kit` é o construtor de malhas e o material delas.
- `render2d.js`: reserva para quem não tem WebGL2 ou depois de falhas repetidas do 3D.

## Fontes e licenças

| O quê | Origem | Licença |
|---|---|---|
| Traçado | TUMFTM racetrack-database | LGPL-3.0 |
| Prédios, ruas, lagos, mata, pit lane | OpenStreetMap | ODbL |
| Relevo | SRTM, via Terrain Tiles (USGS) | domínio público |
| Texturas | Poly Haven | CC0 |
| Three.js | three.js r187, em `public/vendor` | MIT |
| Fonte | Barlow Condensed, em `public/fonts` | OFL 1.1 |
| Logos | Draft e Livraria Vô Alberto: dos próprios projetos | direitos dos donos |

O traçado é encaixado nas vias do OpenStreetMap com erro médio de 3 m, e o desnível dá 40,8 m, contra
cerca de 43 m oficiais. As posições de `surfaces.js` e `venue.js` foram estimadas olhando a vista aérea;
a imagem em si não é usada. `build-circuit.py` regenera os dados: as fontes e o uso estão no início dele.

## Desempenho

A sombra, o chão e o céu são cozidos uma vez ao abrir, então cada quadro só lê texturas. Numa RTX 3050
em 1920x1080, sem limite de quadros: de 245 a mais de 500 quadros por segundo, conforme a vista, com a GPU entre 2 e 4,1 ms por quadro.
O limite para 144 Hz é de 6,9 ms. Para medir, feche as outras abas com a tela aberta: elas disputam a
mesma placa e derrubam o número. A primeira medida logo depois de abrir também sai baixa.

Pelo endereço público, um navegador sem nada guardado abre a tela em cerca de 20 s, e a segunda visita em
11 s. Isso vale com os arquivos no cache da Cloudflare, que dura 1 dia e é separado por região. Fora dele,
os 9 MB vêm pelo WiFi do servidor: medido em 2026-11-03, o upload deu 0,7 MB/s, e uma abertura num
momento ruim da rede passou de 2 minutos.

No celular simulado (toque, tela de 390 px e CPU 4x mais lenta, ainda com a GPU do PC), a tela abre em
27 a 36 s. Isso mede memória, tempo de abertura e lógica. O desempenho em um celular de verdade não foi
medido: `?fps` mostra os números no próprio aparelho.

Abaixo de 55 quadros por segundo, e se o tempo de desenho for o culpado, a tela desce sozinha um dos
quatro níveis de qualidade. Se o navegador perder o contexto do WebGL (driver reiniciado, volta da
suspensão), a página recarrega; depois de três perdas em 2 minutos, fica na versão 2D. Se o 3D falhar ao
abrir, a página abre de novo direto no 2D: o canvas com contexto WebGL não aceita mais o desenho 2D.

## Desenvolver

Sem Docker, faz no PC o papel do nginx e lê o `nas-pulse` pela tailnet:

```powershell
node C:\Users\eduar\Documents\Projeto_NAS\docker\nasrace\dev-server.mjs
```

Abre em http://127.0.0.1:4590/nasrace/, como no domínio, ou na raiz. `NASRACE_PULSE_URL` troca o
endereço do `nas-pulse`.

## Implantação

Só na primeira vez, no servidor:

```bash
mkdir -p ~/nasrace/public
```

E no túnel `nas-server-tunnel` da Cloudflare, uma regra **antes** da regra geral do `ebls.com.br`:
hostname `ebls.com.br`, path `^/nasrace(/.*)?$`, serviço `http://172.17.0.1:9107`.

Para publicar uma versão, no Windows (PowerShell):

```powershell
tar -czf $env:TEMP\nasrace.tar.gz -C C:\Users\eduar\Documents\Projeto_NAS\docker\nasrace docker-compose.yml nginx.conf public
scp $env:TEMP\nasrace.tar.gz eduardo@192.168.15.90:/tmp/nasrace.tar.gz
ssh eduardo@192.168.15.90 'cd ~/nasrace && find public -mindepth 1 -delete && tar -xzf /tmp/nasrace.tar.gz && rm /tmp/nasrace.tar.gz && chmod -R a+rX . && docker compose up -d --force-recreate'
```

O `--force-recreate` importa: arquivos substituídos num volume montado continuam apontando para a
versão antiga até o container ser recriado.

Para conferir:

```powershell
curl.exe -s -m 5 https://ebls.com.br/nasrace/healthz
```

Tem que responder `ok`.

## Operação

| Intenção | Comando |
| :--- | :--- |
| Tirar do ar | Remover a regra `^/nasrace` do túnel na Cloudflare |
| Logs | `docker logs nasrace --tail 30` |
| Reiniciar | `cd ~/nasrace && docker compose restart` |

A Cloudflare tenta incluir o script do Web Analytics na página, e a CSP bloqueia de propósito. O aviso
sobre `cloudflareinsights.com` no console é esperado.
