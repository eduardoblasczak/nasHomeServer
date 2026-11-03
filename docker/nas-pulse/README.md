# nas-pulse — métricas por container para o mapa do servidor

Alimenta o modo **Servidor** do [Agent Arena](../../tools/agent-arena/README.md) e o
[NasRace](../nasrace/README.md): CPU, memória, rede e reinícios de cada container, mais
os números do host.

A telemetria pública do portfólio entrega só "no ar / fora" por container, de
propósito, porque o detalhe desenha o mapa interno da stack. Este serviço
entrega o detalhe, mas só para a tailnet. A exceção é o `/api/race`, que o
NasRace, público, encaminha: tem os containers e os números que aquela tela
mostra, sem o resto do host.

```
Arena (Windows) ── tailnet ──► tailscale serve :9106 ──► 127.0.0.1:9106 ──► nas-pulse ──► prometheus
```

| Item | Valor |
| :--- | :--- |
| Caminho no servidor | `/data/nas-pulse` |
| Porta | `9106`, presa em `127.0.0.1`, publicada na tailnet pelo `tailscale serve` |
| Endpoint | `GET /api/pulse`, `GET /api/race`, `GET /healthz` |
| Dados | Só o Prometheus. **Sem** socket do Docker |
| Hardening | usuário 10002, `read_only`, `cap_drop: ALL`, `no-new-privileges`, 64 MiB |

## Decisões que não são óbvias

**`tailscale serve` em vez de publicar no IP `100.x`, como o ai-memory.** Se o
Docker subir antes de a `tailscale0` existir, o bind no IP falha e o container
fica parado sem tentar de novo. Neste servidor o boot depois de queda de luz é
um caso real. A configuração do `serve` volta sozinha depois de reiniciar.

**Reinícios sem o socket do Docker.** O cAdvisor expõe
`container_start_time_seconds`. Quando o número aumenta, o container reiniciou.

**Sem token.** O conteúdo são métricas de uso, alcançáveis só pelas minhas
máquinas na tailnet. O ai-memory tem token porque guarda histórico de trabalho.

## Implantação

No servidor:

```bash
sudo mkdir -p /data/nas-pulse && sudo chown eduardo:eduardo /data/nas-pulse
```

No Windows (PowerShell):

```powershell
scp C:\Users\eduar\Documents\Projeto_NAS\docker\nas-pulse\pulse.py C:\Users\eduar\Documents\Projeto_NAS\docker\nas-pulse\Dockerfile C:\Users\eduar\Documents\Projeto_NAS\docker\nas-pulse\docker-compose.yml eduardo@192.168.15.90:/data/nas-pulse/
```

No servidor:

```bash
cd /data/nas-pulse && docker compose up -d --build
```

```bash
curl -s http://127.0.0.1:9106/api/pulse | head -c 400
```

```bash
sudo tailscale serve --http=9106 --bg http://127.0.0.1:9106
```

No Windows, pela tailnet:

```powershell
curl.exe -s -m 5 http://nas-server.tail80d72a.ts.net:9106/healthz
```

Tem que responder `ok`. **Use o nome, não o IP:** o `tailscale serve` escolhe o site
pelo cabeçalho Host, e pelo IP `100.x` responde `404 page not found` (texto puro, que
não vem deste serviço). E pela rede local tem que **falhar**:

```powershell
curl.exe -s -m 5 http://192.168.15.90:9106/healthz
```

## Operação

| Intenção | Comando |
| :--- | :--- |
| Ver a publicação | `tailscale serve status` |
| Remover a publicação | `sudo tailscale serve --http=9106 --bg off` |
| Logs | `docker logs nas-pulse --tail 30` |
