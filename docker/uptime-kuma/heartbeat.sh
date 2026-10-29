#!/bin/bash
# =============================================================
# Dead man's switch: avisa se o PROPRIO monitor parar.
#
# O Uptime Kuma vigia o nas-server, mas ninguem vigia o Kuma. Se a VM
# da Oracle cair, o container travar ou o Telegram parar de receber,
# o silencio parece "esta tudo bem" — o pior tipo de falha.
#
# Este script roda por cron na VM a cada 5 min e pinga o healthchecks.io.
# Se o ping parar de chegar, e o healthchecks.io que avisa no Telegram.
# Cobre de uma vez: VM fora do ar, Docker parado e Kuma doente.
#
# A URL de ping fica em ~/uptime-kuma/.hc-url (chmod 600), fora do repo:
# quem tem a URL consegue silenciar o alerta.
# =============================================================
set -u

URL_FILE="$HOME/uptime-kuma/.hc-url"
[ -r "$URL_FILE" ] || exit 1
URL=$(tr -d '[:space:]' < "$URL_FILE")

estado=$(docker inspect -f '{{.State.Health.Status}}' uptime-kuma 2>/dev/null || echo "ausente")

if [ "$estado" = "healthy" ]; then
    curl -fsS -m 10 --retry 3 -o /dev/null "$URL"
else
    # /fail avisa na hora, sem esperar o periodo de tolerancia acabar.
    curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "uptime-kuma: $estado" "$URL/fail"
fi
