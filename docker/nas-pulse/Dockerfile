FROM python:3.12-alpine

# Mesma base da telemetria do portfólio: a imagem já está em cache no
# nas-server, e o build não depende da rede WiFi instável.
RUN adduser -D -H -u 10002 pulse

COPY pulse.py /app/pulse.py

USER pulse
WORKDIR /app

EXPOSE 9106

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:9106/healthz || exit 1

CMD ["python", "-u", "pulse.py"]
