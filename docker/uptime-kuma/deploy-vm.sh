#!/bin/bash
# =============================================================
# Sobe o Uptime Kuma na VM da Oracle. Roda NA VM, enviado do Windows:
#
#   cmd /c "ssh nasfinance-oracle bash -s < C:\Users\eduar\Documents\Projeto_NAS\docker\uptime-kuma\deploy-vm.sh"
#
# Pre-requisito: os dois docker-compose.yml ja copiados por scp
# (ver README.md, passo 2).
# =============================================================
set -euo pipefail

echo "==> memoria antes"
free -m

# Sem esta pasta o Docker cria o bind mount como root:root com modo
# padrao, e o diagnostico de permissao fica para depois do primeiro erro.
sudo mkdir -p /opt/uptime-kuma

# O compose do cloudflared ganhou a rede `tunnel`. O `up -d` detecta a
# mudanca e recria o container: o nasFinance fica fora por alguns
# segundos, enquanto o conector reconecta.
echo "==> recriando o cloudflared com a rede tunnel"
cd ~/nasfinance/cloudflared
docker compose --env-file .env up -d
docker network inspect tunnel > /dev/null
echo "    rede tunnel ok"

echo "==> subindo o uptime-kuma"
cd ~/uptime-kuma
docker compose pull
docker compose up -d

# A imagem traz healthcheck proprio. Espera ate 2,5 min: na primeira
# subida o Kuma cria o banco SQLite, e com 1 OCPU isso nao e instantaneo.
estado="starting"
for _ in $(seq 1 30); do
    estado=$(docker inspect -f '{{.State.Health.Status}}' uptime-kuma 2>/dev/null || echo "ausente")
    [ "$estado" = "healthy" ] && break
    sleep 5
done
echo "    uptime-kuma: $estado"

# Prova pelo mesmo caminho que o cloudflared vai usar: de dentro da rede
# `tunnel`, pelo nome do container. Nao ha porta publicada no host.
docker run --rm --network tunnel curlimages/curl -s -o /dev/null \
    -w "    http://uptime-kuma:3001 -> %{http_code}\n" http://uptime-kuma:3001

echo "==> memoria depois"
free -m
docker stats --no-stream uptime-kuma nasfinance-app nasfinance-db cloudflared
