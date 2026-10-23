# ai-memory — memória compartilhada dos agentes de código

Servidor [ai-memory](https://github.com/akitaonrails/ai-memory) próprio:
memória de longo prazo compartilhada entre Claude Code, Codex, Cursor e
outros agentes. Os hooks dos agentes mandam observações para cá, o servidor
consolida em páginas de wiki (markdown + git) e devolve contexto na sessão
seguinte, em qualquer agente.

Como o Draft e o Vô Alberto, este serviço **não** tem `docker-compose.yml`
aqui: a stack vive no repositório de infraestrutura dele. Este arquivo
documenta só como ele se encaixa no `nas-server`.

- Repositório: [`eduardoblasczak/AI-memory`](https://github.com/eduardoblasczak/AI-memory)
  (`deploy/compose.yaml`, ADRs e runbook em `docs/`)
- Caminho no servidor: `~/ai-memory-infra` (repositório) e `/data/ai-memory` (dados)
- Modo: zero-LLM — nenhuma chave de API configurada

---

## Integração com a infraestrutura

| Item | Valor |
| :--- | :--- |
| Porta | `49374`, publicada **só** no IP da tailnet `100.97.42.114` |
| Exposição | Tailscale (`nas-server` / `nas-server.tail80d72a.ts.net`). **Sem** Cloudflare Tunnel, sem porta no roteador ou no `ufw` |
| Autenticação | Bearer token em `~/ai-memory-infra/deploy/.env` (`chmod 600`) |
| Imagem | `docker.io/akitaonrails/ai-memory:latest` (3.2.0 no primeiro deploy) |
| Dados | `/data/ai-memory` (SSD `sda6`), dono `eduardo` (1000:1000) |
| Backups | `/data/ai-memory-backups`, cron do `eduardo` às 03:15, 14 snapshots |
| Cópia fora do NAS | branch `wiki` do repo privado `AI-memory`, a cada 10 min, commits como `eduardoblasczak` (deploy key `~/.ssh/ai-memory-wiki-deploy`) |
| Hardening | usuário 1000, `cap_drop: ALL`, `no-new-privileges`, `mem_limit: 512m` |

A exceção ao padrão "tudo via Cloudflare Tunnel" é proposital: o wiki
guarda o histórico de trabalho (caminhos, decisões, erros, trechos de
prompt) e só precisa ser alcançado pelas minhas máquinas. Detalhes no
ADR-002 do repositório.

## Impacto no orçamento de RAM

Cerca de 63 MB logo após subir, com teto de 512 MB. Na primeira execução
o servidor baixa um modelo local de embeddings (~87 MB, em
`/data/ai-memory/models`) e liga a busca híbrida no restart seguinte; vale
olhar `docker stats ai-memory` depois do primeiro restart.

## Operação

No `nas-server`, dentro de `~/ai-memory-infra` (não há `make` instalado;
os scripts são o que o Makefile chama):

| Intenção | Comando |
| :--- | :--- |
| Validar (inclui teste de exposição na LAN) | `scripts/40-healthcheck.sh` |
| Atualizar a imagem | `scripts/50-backup.sh && scripts/30-deploy.sh` |
| Backup agora | `scripts/50-backup.sh` |
| Estado interno | `docker exec ai-memory ai-memory status` |
| Logs | `docker logs -f ai-memory` |
| Parar, preservando dados | `scripts/90-teardown.sh` |

**Regra que não se negocia:** um servidor por diretório de dados, nunca
dois. Não suba outra instância apontando para `/data/ai-memory`.

## Pendências

- **Teste de restauração** dos snapshots (`docs/06-backup-restore.md`).
