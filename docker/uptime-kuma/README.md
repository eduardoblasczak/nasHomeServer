# Uptime Kuma — alerta no Telegram quando o nas-server cai

Roda na **VM da Oracle** (`nasfinance-oracle`), não no nas-server. Um
monitor que mora no servidor que vigia morre junto com ele e nunca avisa.

```
VM Oracle ── uptime-kuma ──► https://ebls.com.br/api/telemetry ──► nas-server
     │            │
     │            └──► Telegram (quando 3 checagens seguidas falham)
     │
     └── cron 5 min ──► healthchecks.io ──► Telegram (quando o Kuma some)
```

Interface em `uptime.ebls.com.br`, pelo túnel da VM e atrás do Cloudflare
Access. Nenhuma porta é publicada.

---

## Decisões que não são óbvias

**Por que monitorar `/api/telemetry` e não a home.** O `ebls.com.br` tem
espelho no Cloudflare Pages justamente para responder quando o servidor
cai. Um monitor na home veria `200` servido pelo espelho e nunca avisaria
— cego exatamente no caso que importa. A telemetria só o servidor real
produz, e o `generatedAt` dela prova que a resposta é de agora.

**Por que 3 falhas seguidas.** O nas-server está em WiFi, que derruba a
conexão sozinho por segundos. Avisar na primeira falha é receber alarme
falso de madrugada até passar a ignorar todos — inclusive o verdadeiro.

**Por que a rede `tunnel` separada.** O Kuma precisa falar com o
`cloudflared` para ser publicado, mas não tem motivo para alcançar o
Postgres do nasFinance. A rede é criada pelo compose do `cloudflared`,
então o túnel nunca depende do Kuma para subir.

**Por que SQLite.** A VM tem 954 MiB. O assistente da primeira execução
oferece MariaDB embutido, que custaria memória que o nasFinance precisa.

---

## Implantação

### 1. Aplicação no Access ANTES da rota

Zero Trust → Access → Applications → Add → Self-hosted:

| Campo | Valor |
|---|---|
| Nome | `uptime` |
| Domínio | `uptime.ebls.com.br` |
| Política | Allow — seu e-mail |

A ordem importa pelo mesmo motivo do nasFinance: se a rota existir antes
da aplicação, a interface fica aberta pelo tempo entre uma coisa e outra.

### 2. Enviar os arquivos (Windows)

```powershell
ssh nasfinance-oracle "mkdir -p ~/uptime-kuma"
```

```powershell
scp C:\Users\eduar\Documents\Projeto_NAS\docker\uptime-kuma\docker-compose.yml C:\Users\eduar\Documents\Projeto_NAS\docker\uptime-kuma\heartbeat.sh nasfinance-oracle:uptime-kuma/
```

```powershell
scp C:\Users\eduar\Documents\Projeto_NAS\docker\nasFinance\cloudflared\docker-compose.yml nasfinance-oracle:nasfinance/cloudflared/
```

### 3. Subir

```powershell
cmd /c "ssh nasfinance-oracle bash -s < C:\Users\eduar\Documents\Projeto_NAS\docker\uptime-kuma\deploy-vm.sh"
```

Espere `uptime-kuma: healthy` e `http://uptime-kuma:3001 -> 302` (o
redirecionamento para a tela de configuração inicial). O nasFinance fica
fora por alguns segundos enquanto o `cloudflared` é recriado.

### 4. Publicar

No túnel `nasfinance-oracle` → Published application routes → Add:

| Campo | Valor |
|---|---|
| Subdomínio | `uptime` |
| Domínio | `ebls.com.br` |
| Serviço | `HTTP` → `uptime-kuma:3001` |

Abra `https://uptime.ebls.com.br`, passe pelo Access, escolha **SQLite**
e crie o usuário administrador.

---

## Telegram

1. No Telegram, fale com o **@BotFather** → `/newbot` → guarde o token.
2. Mande qualquer mensagem para o bot criado (sem isso ele não pode te
   escrever).
3. No Kuma: Configurações → Notificações → Configurar notificação →
   **Telegram**. Cole o token, clique em **Auto Get** no Chat ID, marque
   **Ativado por padrão** e **Aplicar em todos os monitores existentes**.
4. **Testar** — a mensagem tem que chegar antes de continuar.

---

## Monitores

Para todos: intervalo **60 s**, **2 tentativas** (= 3 falhas seguidas,
alerta em ~3 min), intervalo entre tentativas 60 s.

| Nome | Tipo | Alvo | Verificação |
|---|---|---|---|
| nas-server | HTTP(s) - Json Query | `https://ebls.com.br/api/telemetry` | expressão `$toMillis(generatedAt) > $millis() - 120000`, esperado `true` |
| Draft | HTTP(s) | URL pública do Draft | status 200 |
| Vô Alberto | HTTP(s) | `https://voalberto.com.br` | status 200 |

O primeiro é o que importa: ele falha se o servidor cair, se o túnel cair
e até se a telemetria travar devolvendo leitura velha. Os outros dizem
*qual* serviço está fora quando o servidor está de pé.

**O que este monitor não cobre: a própria VM.** Se ela cair, o Kuma cai
junto. É para isso que serve o passo seguinte.

---

## Monitorar o monitor (healthchecks.io)

1. Crie conta gratuita em healthchecks.io → **Add Check**: período
   **5 min**, tolerância **10 min**.
2. Integrations → **Telegram** → siga o fluxo do bot deles.
3. Copie a URL de ping e grave na VM, sem passar pelo chat:

```bash
nano ~/uptime-kuma/.hc-url && chmod 600 ~/uptime-kuma/.hc-url && chmod +x ~/uptime-kuma/heartbeat.sh
```

4. Teste e instale o cron:

```bash
~/uptime-kuma/heartbeat.sh && echo "ping ok"
```

```bash
(crontab -l 2>/dev/null | grep -vF "heartbeat.sh"; echo "*/5 * * * * $HOME/uptime-kuma/heartbeat.sh") | crontab -
```

No painel do healthchecks.io o check deve ficar verde em poucos segundos.

---

## Manutenção

```bash
cd ~/uptime-kuma && docker compose pull && docker compose up -d
```

Os dados ficam em `/opt/uptime-kuma` (SQLite). Perdê-los custa só
reconfigurar uns poucos monitores, por isso não entram no backup do
nasFinance.
