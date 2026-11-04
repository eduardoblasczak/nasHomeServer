#!/usr/bin/env python3
"""
nas-pulse — métricas por container para o mapa do servidor (Agent Arena).

A telemetria pública do portfólio entrega só "no ar / fora" por container,
de propósito: CPU, memória e rede de cada serviço desenham o mapa interno
da stack, e isso não pertence à internet. Este serviço entrega esse
detalhe, mas é alcançável apenas pela tailnet (via `tailscale serve`,
ver README.md).

Mesmas decisões da telemetria do portfólio:
  - NÃO monta o socket do Docker. Tudo vem do Prometheus, que já coleta
    via cAdvisor e node-exporter, pela rede interna `monitoring_default`.
  - Somente leitura, somente biblioteca padrão.

Reinícios sem socket: o cAdvisor expõe `container_start_time_seconds`.
Quando esse número aumenta, o container reiniciou — o cliente compara
leituras consecutivas.

A exceção à tailnet é o NasRace, publicado por decisão consciente: o nginx
dele encaminha só `/api/race`, que traz os containers e os números que a
tela mostra, sem o resto do host (uptime, carga, sinal do WiFi, rede).
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROMETHEUS = os.environ.get("PROMETHEUS_URL", "http://prometheus:9090")
PORT = int(os.environ.get("PORT", "9106"))
CACHE_TTL = float(os.environ.get("CACHE_TTL", "4"))
QUERY_TIMEOUT = float(os.environ.get("QUERY_TIMEOUT", "3"))
HOST_LABEL = os.environ.get("HOST_LABEL", "nas-server").strip()

_cache = {"at": 0.0, "payload": None}


def promql(expr):
    url = f"{PROMETHEUS}/api/v1/query?" + urllib.parse.urlencode({"query": expr})
    try:
        with urllib.request.urlopen(url, timeout=QUERY_TIMEOUT) as r:
            data = json.load(r)
        if data.get("status") != "success":
            return []
        return data["data"]["result"]
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        return []


def by_label(expr, label):
    """{valor do rótulo: número} para uma query agrupada por esse rótulo."""
    out = {}
    for series in promql(expr):
        key = series.get("metric", {}).get(label, "")
        if not key:
            continue
        try:
            out[key] = float(series["value"][1])
        except (IndexError, KeyError, TypeError, ValueError):
            continue
    return out


def scalar(expr):
    res = promql(expr)
    try:
        return float(res[0]["value"][1])
    except (IndexError, KeyError, TypeError, ValueError):
        return None


def rounded(value, digits=1):
    return round(value, digits) if value is not None else None


def cpu_temperature():
    for expr in (
        "avg(node_hwmon_temp_celsius)",
        "avg(node_thermal_zone_temp)",
        "avg(node_hwmon_temp_input_celsius)",
    ):
        v = scalar(expr)
        if v is not None and 0 < v < 130:
            return round(v, 1)
    return None


def recent_rate(metric, sel):
    """Taxa do último minuto, com 3 minutos de reserva para container ocioso.

    O cAdvisor atualiza menos um container parado: o draft-web teve 8 leituras em 5 min,
    contra 20 de um container ativo. Com menos de duas leituras em 1 min, o rate() não
    devolve nada, e CPU e rede sumiam por cerca de 1 min, depois voltavam. Sem o
    reserva, serviço ocioso parecia "sem dados"; só com 3 min, os picos demorariam a aparecer.
    """
    return f"sum by (name) (rate({metric}{sel}[1m])) or sum by (name) (rate({metric}{sel}[3m]))"


def containers():
    # `max by (name)` deduplica: ao recriar um container, as séries do ID
    # antigo continuam no Prometheus durante a janela de staleness, e o
    # mesmo nome apareceria duas vezes. Vale a leitura mais recente.
    sel = '{name!=""}'
    last_seen = by_label(f"max by (name) (container_last_seen{sel})", "name")
    started = by_label(f"max by (name) (container_start_time_seconds{sel})", "name")
    # Percentual de UM núcleo (pode passar de 100 em multithread). O
    # cliente divide pelo número de núcleos do host para comparar.
    cpu = by_label(f"({recent_rate('container_cpu_usage_seconds_total', sel)}) * 100", "name")
    mem = by_label(f"max by (name) (container_memory_working_set_bytes{sel})", "name")
    limit = by_label(f"max by (name) (container_spec_memory_limit_bytes{sel})", "name")
    rx = by_label(recent_rate("container_network_receive_bytes_total", sel), "name")
    tx = by_label(recent_rate("container_network_transmit_bytes_total", sel), "name")

    now = time.time()
    out = []
    for name in sorted(last_seen):
        lim = limit.get(name)
        out.append({
            "name": name,
            "up": (now - last_seen[name]) < 60,
            "startedAt": int(started[name]) if name in started else None,
            "cpu": rounded(cpu.get(name)),
            "memBytes": int(mem[name]) if name in mem else None,
            # 0 ou valor absurdo = sem limite definido no compose.
            "memLimitBytes": int(lim) if lim and lim < 2 ** 50 else None,
            "rxBps": rounded(rx.get(name), 0),
            "txBps": rounded(tx.get(name), 0),
        })
    return out


def disks():
    # Com --path.rootfs=/rootfs, o node-exporter já reporta os pontos de
    # montagem do HOST ("/" e "/data"), sem o prefixo.
    sel = '{mountpoint=~"/|/data",fstype!~"tmpfs|overlay|squashfs"}'
    size = by_label(f"max by (mountpoint) (node_filesystem_size_bytes{sel})", "mountpoint")
    avail = by_label(f"max by (mountpoint) (node_filesystem_avail_bytes{sel})", "mountpoint")
    out = []
    for mount in sorted(size):
        if size[mount] <= 0 or mount not in avail:
            continue
        out.append({
            "mount": mount,
            "sizeBytes": int(size[mount]),
            "usedPercent": round(100 * (1 - avail[mount] / size[mount]), 1),
        })
    return out


def host():
    # Interfaces físicas apenas: veth, bridges do Docker e a tailscale0
    # contariam o mesmo byte duas ou três vezes.
    phys = '{device!~"lo|veth.*|docker.*|br-.*|tailscale.*"}'
    return {
        "name": HOST_LABEL,
        "cores": int(scalar('count(count by (cpu) (node_cpu_seconds_total))') or 0) or None,
        "cpuPercent": rounded(scalar('100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m])))')),
        "load1": rounded(scalar("node_load1"), 2),
        "ramPercent": rounded(scalar("100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)")),
        "swapPercent": rounded(scalar("100 * (1 - node_memory_SwapFree_bytes / node_memory_SwapTotal_bytes)")),
        "cpuTemp": cpu_temperature(),
        "uptimeSeconds": int(scalar("node_time_seconds - node_boot_time_seconds") or 0) or None,
        "rxBps": rounded(scalar(f"sum(rate(node_network_receive_bytes_total{phys}[1m]))"), 0),
        "txBps": rounded(scalar(f"sum(rate(node_network_transmit_bytes_total{phys}[1m]))"), 0),
        # Só existe se o coletor wifi do node-exporter estiver ligado; sem
        # ele fica ausente, e o mapa não inventa um sinal.
        "wifiDbm": rounded(scalar("max(node_wifi_station_signal_dbm)"), 0),
        "disks": disks(),
    }


def collect():
    items = containers()
    if not items:
        # cAdvisor sem nomes ou Prometheus fora: melhor 503 do que um mapa
        # vazio que parece "todos os containers caíram".
        return None
    payload = {
        "host": {k: v for k, v in host().items() if v is not None},
        "containers": items,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    return payload


def cached():
    now = time.time()
    if _cache["payload"] is not None and (now - _cache["at"]) < CACHE_TTL:
        return _cache["payload"]
    fresh = collect()
    if fresh is not None:
        _cache.update(at=now, payload=fresh)
        return fresh
    return None


def race_view(payload):
    """Só o que a tela pública do NasRace mostra."""
    host_data = payload["host"]
    return {
        "host": {
            **{k: host_data[k] for k in ("cpuPercent", "ramPercent", "swapPercent", "cpuTemp") if k in host_data},
            "disks": [{"mount": d["mount"], "usedPercent": d["usedPercent"]} for d in host_data.get("disks", [])],
        },
        "containers": payload["containers"],
        "generatedAt": payload["generatedAt"],
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "nas-pulse"
    sys_version = ""

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        raw = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/", "/api/pulse", "/api/race"):
            payload = cached()
            if payload is None:
                self._send(503, json.dumps({"error": "prometheus unreachable"}))
                return
            self._send(200, json.dumps(race_view(payload) if path == "/api/race" else payload))
            return
        if path == "/healthz":
            self._send(200, "ok", "text/plain; charset=utf-8")
            return
        self._send(404, json.dumps({"error": "not found"}))

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    print(f"nas-pulse :{PORT} -> {PROMETHEUS}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
