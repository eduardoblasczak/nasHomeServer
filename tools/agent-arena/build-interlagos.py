#!/usr/bin/env python3
"""
Gera public/interlagos-data.js a partir de dados medidos, para que o traçado do modo
Interlagos seja o real, e não um desenho a olho.

Fontes (baixadas à mão, não ficam no repositório):
  SaoPaulo.csv     linha central e largura da pista, de 5 em 5 m
                   TUMFTM/racetrack-database, LGPL-3.0
  interlagos.json  pit lane, nomes das curvas, prédios, água, mata (API Overpass)
                   © colaboradores do OpenStreetMap, ODbL

O CSV vem em metros locais, sem georreferência. Por isso ele é encaixado sobre as vias
"raceway" do OSM com um ICP de corpo rígido: só rotação e translação, sem deformar.

Uso: python -I build-interlagos.py <pasta com os dois arquivos>
"""

import csv
import json
import math
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(__file__).parent / "public" / "interlagos-data.js"
MARGIN = 95  # metros de cenário em volta da pista


def load_center():
    pts = []
    with open(SRC / "SaoPaulo.csv", encoding="utf-8") as f:
        for row in csv.reader(f):
            if row[0].startswith("#"):
                continue
            pts.append(tuple(float(v) for v in row))
    return pts


osm = json.load(open(SRC / "interlagos.json", encoding="utf-8"))["elements"]
lat0, lon0 = -23.7015, -46.6975
kx = 111320 * math.cos(math.radians(lat0))
ky = 110574


def proj(g):
    return [((p["lon"] - lon0) * kx, (p["lat"] - lat0) * ky) for p in g]


def tags(w):
    return w.get("tags", {})


motor = [w for w in osm if tags(w).get("highway") == "raceway" and tags(w).get("sport") == "motor"]
pit_way = next(w for w in motor if tags(w).get("name") == "Pit Lane")
racing = [w for w in motor if w is not pit_way]
targets = [p for w in racing for p in proj(w["geometry"])]

# Densifica os alvos do OSM: as vias têm pontos esparsos nas retas.
dense = []
for w in racing:
    g = proj(w["geometry"])
    for a, b in zip(g, g[1:]):
        n = max(1, int(math.dist(a, b) / 8))
        dense += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
targets = dense

center = load_center()


def transform(p, a, tx, ty):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s + tx, p[0] * s + p[1] * c + ty)


def nearest(p, pool):
    return min(pool, key=lambda q: (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2)


def icp(a, tx, ty, steps=25):
    sample = center[::6]
    for _ in range(steps):
        moved = [transform(p, a, tx, ty) for p in sample]
        pairs = [(p, nearest(m, targets)) for p, m in zip(sample, moved)]
        mx = sum(p[0] for p, _ in pairs) / len(pairs)
        my = sum(p[1] for p, _ in pairs) / len(pairs)
        qx = sum(q[0] for _, q in pairs) / len(pairs)
        qy = sum(q[1] for _, q in pairs) / len(pairs)
        num = sum((p[0] - mx) * (q[1] - qy) - (p[1] - my) * (q[0] - qx) for p, q in pairs)
        den = sum((p[0] - mx) * (q[0] - qx) + (p[1] - my) * (q[1] - qy) for p, q in pairs)
        a = math.atan2(num, den)
        c, s = math.cos(a), math.sin(a)
        tx, ty = qx - (mx * c - my * s), qy - (mx * s + my * c)
    moved = [transform(p, a, tx, ty) for p in center[::3]]
    err = [math.dist(m, nearest(m, targets)) for m in moved]
    return a, tx, ty, sum(err) / len(err), max(err)


tcx = sum(p[0] for p in targets) / len(targets)
tcy = sum(p[1] for p in targets) / len(targets)
ccx = sum(p[0] for p in center) / len(center)
ccy = sum(p[1] for p in center) / len(center)
best = None
for deg in range(0, 360, 30):
    a0 = math.radians(deg)
    c, s = math.cos(a0), math.sin(a0)
    r = icp(a0, tcx - (ccx * c - ccy * s), tcy - (ccx * s + ccy * c), steps=12)
    if best is None or r[3] < best[3]:
        best = r
angle, tx, ty, _, _ = icp(best[0], best[1], best[2], steps=30)
_, _, _, mean_err, max_err = icp(angle, tx, ty, steps=1)
print(f"encaixe: rotação {math.degrees(angle):.2f}°, erro médio {mean_err:.1f} m, máximo {max_err:.1f} m")

track = []
for row in center:
    x, y = transform(row, angle, tx, ty)
    track.append((x, y, row[2], row[3]))

# Sentido de percurso: Interlagos é anti-horário (área positiva em coordenadas com y para o norte).
area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(track, track[1:] + track[:1])) / 2
if area < 0:
    # Inverter a ordem também troca os lados: direita e esquerda da pista.
    track = [(x, y, wl, wr) for x, y, wr, wl in reversed(track)]
print(f"pontos {len(track)}, área {abs(area) / 1e4:.1f} ha, sentido anti-horário garantido")

seg = [math.dist(track[i][:2], track[(i + 1) % len(track)][:2]) for i in range(len(track))]
length = sum(seg)
print(f"comprimento {length:.0f} m (oficial: 4309 m)")
cum = [0.0]
for d in seg[:-1]:
    cum.append(cum[-1] + d)


def station(p):
    i = min(range(len(track)), key=lambda k: (track[k][0] - p[0]) ** 2 + (track[k][1] - p[1]) ** 2)
    return i, math.dist(track[i][:2], p)


# Linha de chegada: sentido e início contados a partir da reta dos boxes. A linha fica
# no ponto da pista mais próximo do meio do prédio dos boxes (estimado pelo pit lane).
pit = proj(pit_way["geometry"])
pit_stations = [station(p) for p in pit]
print("pit lane:", len(pit), "pontos; distância à pista: máx", round(max(d for _, d in pit_stations), 1), "m")

# Nomes das curvas: cada ponto da pista herda o nome da via do OSM mais próxima.
named = []
for w in racing:
    name = tags(w).get("name")
    if not name or name == "Arquibancadas":
        continue
    g = proj(w["geometry"])
    for a, b in zip(g, g[1:]):
        n = max(1, int(math.dist(a, b) / 8))
        named += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, name) for i in range(n + 1)]
labels = []
for x, y, *_ in track:
    q = min(named, key=lambda n: (n[0] - x) ** 2 + (n[1] - y) ** 2)
    labels.append(q[2] if math.hypot(q[0] - x, q[1] - y) < 25 else None)
corners = []
for i, name in enumerate(labels):
    if name and (not corners or corners[-1]["name"] != name):
        corners.append({"name": name, "i": i})
print("trechos:", [c["name"] for c in corners])

xs = [p[0] for p in track] + [p[0] for p in pit]
ys = [p[1] for p in track] + [p[1] for p in pit]
bounds = [min(xs) - MARGIN, min(ys) - MARGIN, max(xs) + MARGIN, max(ys) + MARGIN]
print("área em metros:", round(bounds[2] - bounds[0]), "x", round(bounds[3] - bounds[1]))


def inside(g):
    return any(bounds[0] <= x <= bounds[2] and bounds[1] <= y <= bounds[3] for x, y in g)


def flat(g):
    return [v for p in g for v in (round(p[0], 1), round(p[1], 1))]


def polygon_area(g):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(g, g[1:] + g[:1]))) / 2


kinds = {"buildings": [], "stands": [], "water": [], "forest": [], "grass": [], "kart": []}
for w in osm:
    if "geometry" not in w:
        continue
    t = tags(w)
    g = proj(w["geometry"])
    if not inside(g):
        continue
    if t.get("highway") == "raceway" and t.get("sport") == "karting":
        kinds["kart"].append(flat(g))
    elif t.get("building") == "grandstand" or t.get("man_made") == "grandstand":
        kinds["stands"].append(flat(g))
    elif "building" in t:
        kinds["buildings"].append(flat(g))
    elif t.get("natural") == "water":
        kinds["water"].append(flat(g))
    elif t.get("landuse") == "forest" or t.get("natural") == "wood":
        kinds["forest"].append(flat(g))
    elif t.get("landuse") in ("grass", "village_green") or t.get("leisure") == "park":
        kinds["grass"].append(flat(g))
print({k: len(v) for k, v in kinds.items()})

data = {
    "length": round(length, 1),
    "bounds": [round(v, 1) for v in bounds],
    "track": [[round(x, 2), round(y, 2), round(a, 2), round(b, 2)] for x, y, a, b in track],
    "pit": flat(pit),
    "corners": corners,
    **kinds,
}
text = (
    "// Gerado por build-interlagos.py. Não editar à mão.\n"
    "// Pista: TUMFTM/racetrack-database (LGPL-3.0). Entorno: © colaboradores do OpenStreetMap (ODbL).\n"
    "export const CIRCUIT = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
)
OUT.write_text(text, encoding="utf-8", newline="\n")
print("gravado", OUT.name, round(len(text.encode()) / 1024), "KB")
