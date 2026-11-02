#!/usr/bin/env python3
"""
Gera os dados do circuito em public/interlagos/, para que o traçado, o relevo e o entorno
da tela de Interlagos sejam os reais, e não um desenho a olho.

Fontes (baixadas à mão, não ficam no repositório):
  SaoPaulo.csv        linha central e largura da pista, de 5 em 5 m
                      github.com/TUMFTM/racetrack-database, tracks/SaoPaulo.csv, LGPL-3.0
  osm/*.json          pit lane, nomes das curvas, prédios, ruas, água, mata
                      API Overpass, vias com highway, building, natural, landuse, leisure,
                      man_made, waterway e amenity=parking na caixa -23.7185,-46.7150,-23.6850,-46.6800
                      (`out geom tags`). Pode vir em vários arquivos: as vias repetidas são ignoradas.
                      © colaboradores do OpenStreetMap, ODbL
  dem/t_X_Y.png       relevo em tiles "terrarium", zoom 14, x de 6065 a 6067 e y de 9302 a 9303:
                      s3.amazonaws.com/elevation-tiles-prod/terrarium/14/X/Y.png
                      dados SRTM cortesia do U.S. Geological Survey

O CSV vem em metros locais, sem georreferência. Por isso ele é encaixado sobre as vias
"raceway" do OSM com um ICP de corpo rígido: só rotação e translação, sem deformar.

Saída:
  circuit-data.js     pista, pit lane, curvas e o índice das camadas
  surroundings.bin    camadas do entorno em Int16 (decímetros)
  terrain.bin         grade de altitudes em Int16 (decímetros acima de `base`)

Uso: python -I build-interlagos.py <pasta com SaoPaulo.csv, osm/ e dem/>
"""

import array
import csv
import json
import math
import re
import struct
import sys
import zlib
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(__file__).parent / "public" / "interlagos"
OUT.mkdir(parents=True, exist_ok=True)

LAT0, LON0 = -23.7015, -46.6975
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110574

# Área coberta pelo terreno, em metros locais.
AREA = (-1700.0, -1800.0, 1700.0, 1750.0)
GRID_STEP = 16.0


def to_local(lat, lon):
    return (lon - LON0) * KX, (lat - LAT0) * KY


def to_lonlat(x, y):
    return LON0 + x / KX, LAT0 + y / KY


# ------------------------------------------------------------------ OSM


def load_osm():
    seen = {}
    files = sorted((SRC / "osm").glob("*.json"))
    for path in files:
        for way in json.load(open(path, encoding="utf-8"))["elements"]:
            if way.get("type") == "way" and "geometry" in way:
                seen[way["id"]] = way
    print(f"osm: {len(files)} arquivos, {len(seen)} vias")
    return list(seen.values())


osm = load_osm()


def tags(w):
    return w.get("tags", {})


def proj(g):
    return [to_local(p["lat"], p["lon"]) for p in g]


motor = [w for w in osm if tags(w).get("highway") == "raceway" and tags(w).get("sport") == "motor"]
pit_way = next(w for w in motor if tags(w).get("name") == "Pit Lane")
racing = [w for w in motor if w is not pit_way]

targets = []
for w in racing:
    g = proj(w["geometry"])
    for a, b in zip(g, g[1:]):
        n = max(1, int(math.dist(a, b) / 8))
        targets += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]

# ------------------------------------------------------------------ pista: encaixe


def load_center():
    pts = []
    with open(SRC / "SaoPaulo.csv", encoding="utf-8") as f:
        for row in csv.reader(f):
            if not row[0].startswith("#"):
                pts.append(tuple(float(v) for v in row))
    return pts


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
for deg in range(0, 360, 45):
    a0 = math.radians(deg)
    c, s = math.cos(a0), math.sin(a0)
    r = icp(a0, tcx - (ccx * c - ccy * s), tcy - (ccx * s + ccy * c), steps=8)
    if best is None or r[3] < best[3]:
        best = r
angle, tx, ty, mean_err, max_err = icp(best[0], best[1], best[2], steps=25)
print(f"encaixe: rotação {math.degrees(angle):.2f}°, erro médio {mean_err:.1f} m, máximo {max_err:.1f} m")

track = []
for row in center:
    x, y = transform(row, angle, tx, ty)
    track.append((x, y, row[2], row[3]))

# Sentido: Interlagos é anti-horário (área positiva com y para o norte). Inverter a ordem
# também troca os lados: a coluna de largura direita vira a esquerda.
area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(track, track[1:] + track[:1])) / 2
if area < 0:
    track = [(x, y, wl, wr) for x, y, wr, wl in reversed(track)]

seg = [math.dist(track[i][:2], track[(i + 1) % len(track)][:2]) for i in range(len(track))]
length = sum(seg)
print(f"pista: {len(track)} pontos, {length:.0f} m (oficial: 4309 m)")

pit = proj(pit_way["geometry"])


def station(p):
    return min(range(len(track)), key=lambda k: (track[k][0] - p[0]) ** 2 + (track[k][1] - p[1]) ** 2)


# ------------------------------------------------------------------ relevo


def read_png_rgb(path):
    """Decodifica PNG de 8 bits RGB ou RGBA, sem dependências."""
    data = path.read_bytes()
    pos = 8
    idat = b""
    w = h = channels = 0
    while pos < len(data):
        size, kind = struct.unpack(">I4s", data[pos : pos + 8])
        chunk = data[pos + 8 : pos + 8 + size]
        if kind == b"IHDR":
            w, h, depth, color = struct.unpack(">IIBB", chunk[:10])
            if depth != 8 or color not in (2, 6):
                raise ValueError(f"{path.name}: formato PNG inesperado ({depth} bits, tipo {color})")
            channels = 3 if color == 2 else 4
        elif kind == b"IDAT":
            idat += chunk
        pos += 12 + size
    raw = zlib.decompress(idat)
    stride = w * channels
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for row in range(h):
        kind = raw[p]
        line = bytearray(raw[p + 1 : p + 1 + stride])
        p += 1 + stride
        if kind == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 255
        elif kind == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif kind == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + (left + prev[i]) // 2) & 255
        elif kind == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        out[row * stride : (row + 1) * stride] = line
        prev = line
    return w, h, channels, out


class Dem:
    Z = 14

    def __init__(self, folder):
        self.tiles = {}
        for path in folder.glob("t_*.png"):
            m = re.match(r"t_(\d+)_(\d+)\.png", path.name)
            w, h, ch, px = read_png_rgb(path)
            heights = array.array("f", [0.0]) * (w * h)
            for i in range(w * h):
                r, g, b = px[i * ch], px[i * ch + 1], px[i * ch + 2]
                heights[i] = r * 256 + g + b / 256 - 32768
            self.tiles[(int(m[1]), int(m[2]))] = heights
        print(f"relevo: {len(self.tiles)} tiles")

    def pixel(self, px, py):
        tx, ty = px // 256, py // 256
        tile = self.tiles.get((tx, ty))
        if tile is None:
            raise KeyError(f"tile {tx},{ty} ausente")
        return tile[(py % 256) * 256 + (px % 256)]

    def at(self, lat, lon):
        n = 2**self.Z * 256
        fx = (lon + 180) / 360 * n
        fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        fx -= 0.5
        fy -= 0.5
        x, y = int(math.floor(fx)), int(math.floor(fy))
        u, v = fx - x, fy - y
        a = self.pixel(x, y) * (1 - u) + self.pixel(x + 1, y) * u
        b = self.pixel(x, y + 1) * (1 - u) + self.pixel(x + 1, y + 1) * u
        return a * (1 - v) + b * v


dem = Dem(SRC / "dem")


def elevation(x, y):
    lon, lat = to_lonlat(x, y)
    return dem.at(lat, lon)


nx = int((AREA[2] - AREA[0]) / GRID_STEP) + 1
ny = int((AREA[3] - AREA[1]) / GRID_STEP) + 1
grid = [[elevation(AREA[0] + i * GRID_STEP, AREA[1] + j * GRID_STEP) for i in range(nx)] for j in range(ny)]


def box_blur(rows, radius):
    h, w = len(rows), len(rows[0])
    out = [row[:] for row in rows]
    for j in range(h):
        row = rows[j]
        total = sum(row[max(0, k)] for k in range(-radius, radius + 1))
        for i in range(w):
            out[j][i] = total / (2 * radius + 1)
            total += row[min(w - 1, i + radius + 1)] - row[max(0, i - radius)]
    final = [row[:] for row in out]
    for i in range(w):
        total = sum(out[max(0, k)][i] for k in range(-radius, radius + 1))
        for j in range(h):
            final[j][i] = total / (2 * radius + 1)
            total += out[min(h - 1, j + radius + 1)][i] - out[max(0, j - radius)][i]
    return final


# O SRTM é um modelo de superfície: copas e telhados viram calombos. Três passadas de
# média aproximam uma gaussiana larga e deixam só a forma do terreno.
for _ in range(3):
    grid = box_blur(grid, 2)

flat = [v for row in grid for v in row]
base = math.floor(min(flat))
print(f"terreno: {nx}x{ny}, altitude {min(flat):.1f} a {max(flat):.1f} m")


def grid_height(x, y):
    fx = (x - AREA[0]) / GRID_STEP
    fy = (y - AREA[1]) / GRID_STEP
    i = min(nx - 2, max(0, int(fx)))
    j = min(ny - 2, max(0, int(fy)))
    u, v = fx - i, fy - j
    a = grid[j][i] * (1 - u) + grid[j][i + 1] * u
    b = grid[j + 1][i] * (1 - u) + grid[j + 1][i + 1] * u
    return a * (1 - v) + b * v


def smooth_loop(values, sigma_pts):
    """Gaussiana periódica ao longo da pista."""
    radius = int(sigma_pts * 3)
    kernel = [math.exp(-0.5 * (k / sigma_pts) ** 2) for k in range(-radius, radius + 1)]
    total = sum(kernel)
    n = len(values)
    return [sum(kernel[k + radius] * values[(i + k) % n] for k in range(-radius, radius + 1)) / total for i in range(n)]


raw_z = [grid_height(x, y) for x, y, *_ in track]
track_z = smooth_loop(raw_z, 8)  # sigma de 40 m: pista não tem degraus
print(f"pista: altitude {min(track_z):.1f} a {max(track_z):.1f} m, desnível {max(track_z) - min(track_z):.1f} m (oficial: cerca de 43 m)")
for s in range(0, int(length), 500):
    print(f"   s={s:5d} z={track_z[min(len(track) - 1, int(s / length * len(track)))]:.1f}")

# As larguras medidas têm ruído de ponto a ponto, que apareceria como serrilhado na borda.
widths_r = smooth_loop([p[2] for p in track], 3)
widths_l = smooth_loop([p[3] for p in track], 3)

# Pit lane: acompanha a altitude do trecho de pista ao lado.
pit_st = [station(p) for p in pit]
pit_z_raw = [track_z[k] for k in pit_st]
pit_z = pit_z_raw[:]
for _ in range(8):
    pit_z = [pit_z[0]] + [(pit_z[i - 1] + 2 * pit_z[i] + pit_z[i + 1]) / 4 for i in range(1, len(pit) - 1)] + [pit_z[-1]]

# ------------------------------------------------------------------ curvas

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

# ------------------------------------------------------------------ entorno

ROAD_WIDTH = {
    "motorway": 16, "trunk": 16, "primary": 14, "secondary": 12, "tertiary": 10, "unclassified": 8,
    "residential": 7.5, "living_street": 6, "service": 5, "track": 4, "pedestrian": 4, "cycleway": 2.5,
    "footway": 1.5, "path": 1.5, "steps": 1.5,
}
LAYER_NAMES = ["buildings", "stands", "roads", "kart", "water", "forest", "scrub", "grass", "parking", "tanks", "treerows"]
layers = {name: [] for name in LAYER_NAMES}


def inside_area(g):
    return any(AREA[0] <= x <= AREA[2] and AREA[1] <= y <= AREA[3] for x, y in g)


def building_height(t):
    for key in ("height", "building:height"):
        m = re.match(r"\s*([\d.]+)", t.get(key, ""))
        if m:
            return float(m[1])
    m = re.match(r"\s*([\d.]+)", t.get("building:levels", ""))
    return float(m[1]) * 3.0 if m else 0.0


for w in osm:
    t = tags(w)
    g = proj(w["geometry"])
    if not inside_area(g):
        continue
    highway = t.get("highway")
    natural = t.get("natural")
    landuse = t.get("landuse")
    leisure = t.get("leisure")
    if highway == "raceway":
        if t.get("sport") == "karting":
            layers["kart"].append((7.0, g))
    elif highway in ROAD_WIDTH:
        layers["roads"].append((ROAD_WIDTH[highway], g))
    elif t.get("building") == "grandstand" or t.get("man_made") == "grandstand":
        layers["stands"].append((building_height(t), g))
    elif t.get("man_made") == "storage_tank":
        layers["tanks"].append((building_height(t), g))
    elif "building" in t:
        layers["buildings"].append((building_height(t), g))
    elif natural == "water" or landuse in ("reservoir", "basin"):
        layers["water"].append((0, g))
    elif natural == "wood" or landuse == "forest":
        layers["forest"].append((0, g))
    elif natural == "tree_row":
        layers["treerows"].append((0, g))
    elif natural in ("scrub", "wetland", "grassland", "heath") or landuse in ("meadow", "farmland", "orchard"):
        layers["scrub"].append((0, g))
    elif landuse in ("grass", "village_green") or leisure in ("park", "garden", "pitch", "golf_course"):
        layers["grass"].append((0, g))
    elif t.get("amenity") == "parking":
        layers["parking"].append((0, g))

ints = array.array("h")
index = {}


def clamp16(v):
    return max(-32768, min(32767, int(round(v))))


for name in LAYER_NAMES:
    start = len(ints)
    count = 0
    for prop, g in layers[name]:
        # Um vértice a menos quando o polígono fecha nele mesmo.
        pts = g[:-1] if len(g) > 2 and g[0] == g[-1] else g
        if len(pts) > 2000:
            pts = pts[:: max(1, len(pts) // 2000)]
        ints.append(len(pts))
        ints.append(clamp16(prop * 10))
        for x, y in pts:
            ints.append(clamp16(x * 10))
            ints.append(clamp16(y * 10))
        count += 1
    index[name] = {"offset": start, "count": count}
print("camadas:", {k: v["count"] for k, v in index.items()})

xs = [p[0] for p in track] + [p[0] for p in pit]
ys = [p[1] for p in track] + [p[1] for p in pit]

data = {
    "length": round(length, 1),
    "bounds": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
    "area": list(AREA),
    # x, y, largura à direita, largura à esquerda, altitude acima de `base`
    "track": [
        [round(x, 2), round(y, 2), round(widths_r[i], 2), round(widths_l[i], 2), round(track_z[i] - base, 2)]
        for i, (x, y, _a, _b) in enumerate(track)
    ],
    "pit": [[round(x, 2), round(y, 2), round(z - base, 2)] for (x, y), z in zip(pit, pit_z)],
    "corners": corners,
    "terrain": {"nx": nx, "ny": ny, "step": GRID_STEP, "x0": AREA[0], "y0": AREA[1], "base": base},
    "layers": index,
}
header = (
    "// Gerado por build-interlagos.py. Não editar à mão.\n"
    "// Pista: TUMFTM/racetrack-database (LGPL-3.0). Entorno: © colaboradores do OpenStreetMap (ODbL).\n"
    "// Relevo: dados SRTM, cortesia do U.S. Geological Survey, via Terrain Tiles.\n"
)
text = header + "export const CIRCUIT = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
(OUT / "circuit-data.js").write_text(text, encoding="utf-8", newline="\n")

heights = array.array("h", (clamp16((v - base) * 10) for v in flat))
if sys.byteorder != "little":
    heights.byteswap()
    ints.byteswap()
(OUT / "terrain.bin").write_bytes(heights.tobytes())
(OUT / "surroundings.bin").write_bytes(ints.tobytes())
print(
    f"gravado: circuit-data.js {len(text.encode()) // 1024} KB, terrain.bin {len(heights) * 2 // 1024} KB, "
    f"surroundings.bin {len(ints) * 2 // 1024} KB"
)
