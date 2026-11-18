#!/usr/bin/env python3
"""
Live-server för spårkartan
==========================

* Hämtar SL:s statiska GTFS (GTFS Regional) en gång och cachar den på disk.
* Pollar GTFS-RT VehiclePositions från Trafiklab med ett intervall som ryms i kvoten.
* Placerar varje spårfordon mellan två stationer på kartan (från/till/andel) och
  räknar ut förseningen mot tidtabellen, så att kartan kan låta fordonen rulla
  vidare mjukt mellan uppdateringarna.
* Serverar kartan (index.html) och JSON på /api/vehicles.

Start:  python3 server.py   →   öppna http://localhost:8080
Nycklar läses från .env (TRAFIKLAB_RT_KEY, TRAFIKLAB_STATIC_KEY) eller miljövariabler.
"""
import csv
import datetime as dt
import difflib
import io
import json
import logging
import math
import os
import pickle
import re
import threading
import time
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from google.transit import gtfs_realtime_pb2

HERE = Path(__file__).resolve().parent


def load_env(path):
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"\''))


load_env(HERE / '.env')

RT_KEY = os.environ.get('TRAFIKLAB_RT_KEY', '')
STATIC_KEY = os.environ.get('TRAFIKLAB_STATIC_KEY', '')
BASE_URL = os.environ.get('TRAFIKLAB_BASE_URL', 'https://opendata.samtrafiken.se').rstrip('/')
OPERATOR = os.environ.get('OPERATOR', 'sl')
# Bronze: 30 000 anrop/månad ≈ ett anrop var 87:e sekund dygnet runt. Silver tål 5 s.
POLL_SECONDS = float(os.environ.get('POLL_SECONDS', '90'))
# Polla bara när någon har kartan öppen (sparar kvot)
IDLE_AFTER = float(os.environ.get('IDLE_AFTER_SECONDS', '300'))
# Statisk data: Bronze tillåter 50 hämtningar/månad – hämta högst var 3:e dygn
STATIC_MAX_AGE_H = float(os.environ.get('STATIC_MAX_AGE_HOURS', '72'))
PORT = int(os.environ.get('PORT', '8080'))
MAX_OFF_ROUTE_M = 1500        # längre från spåret än så → ignoreras (depå, felposition)
STALE_AFTER_S = 300           # positioner äldre än så visas inte

TZ = ZoneInfo('Europe/Stockholm')
CACHE = HERE / 'cache'
CACHE.mkdir(exist_ok=True)

log = logging.getLogger('sparkarta')
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', datefmt='%H:%M:%S')

# GTFS-stoppnamn som skiljer sig från kartans namn: (linje eller '*', normaliserat namn) → stations-id
ALIASES = {
    ('7', 'sergels torg'): 'tc',
    ('*', 'arlanda c'): 'arl',
    ('*', 'stockholm c'): 'cty',
    ('*', 'nordiska museetvasa'): 'nmv',
    ('*', 'södertälje c'): 'sjc',
}

# Tillåtna route_type: tåg, tunnelbana, spårvagn (både bas- och utökade typer). Bussar/båtar filtreras bort.
RAIL_TYPES = {0, 1, 2, 5, 7, 12} | set(range(100, 118)) | set(range(400, 406)) | set(range(900, 907))

session = requests.Session()
session.headers['Accept-Encoding'] = 'gzip'


# ---------------------------------------------------------------------------
# Kartans nät
# ---------------------------------------------------------------------------
NETWORK = json.loads((HERE / 'network.json').read_text(encoding='utf-8'))


def norm(name):
    s = name.lower()
    s = re.sub(r'\(.*?\)', '', s)
    s = s.replace('centralstation', 'c').replace('central', 'c')
    s = re.sub(r'\b(station|t-bana|tunnelbana|spårvagn|pendeltåg)\b', '', s)
    s = re.sub(r'[^a-zåäöé0-9 ]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


# Linjer som delar spår. Turer kör ibland över en syskonlinjes stationer
# (t.ex. 13 till Mörby centrum, 18 till Hässelby strand), så matchning sker per familj.
FAMILIES = [['10', '11'], ['13', '14'], ['17', '18', '19'], ['40', '41', '43', '48'], ['7'], ['12'], ['21'],
            ['25', '26'], ['27', '28', '29'], ['30', '31']]
FAMILY = {lid: fam for fam in FAMILIES for lid in fam if lid in NETWORK['lines']}
LINE_CANDIDATES = {}
for lid in NETWORK['lines']:
    cands = {}
    for member in [lid] + [m for m in FAMILY.get(lid, [lid]) if m != lid]:   # egna linjen först
        for sid in NETWORK['lines'][member]['stops']:
            cands.setdefault(norm(NETWORK['stations'][sid]), sid)
    LINE_CANDIDATES[lid] = cands
_match_cache = {}
UNMATCHED = {}
DRAW_SETS = {lid: set(l['stops']) for lid, l in NETWORK['lines'].items()}


def match_station(line_id, gtfs_name):
    """GTFS-stoppnamn → kartans stations-id, begränsat till linjens egna stationer."""
    key = (line_id, gtfs_name)
    if key in _match_cache:
        return _match_cache[key]
    n = norm(gtfs_name)
    cands = LINE_CANDIDATES[line_id]
    sid = ALIASES.get((line_id, n)) or ALIASES.get(('*', n))
    if sid and sid not in cands.values():
        sid = None
    if not sid:
        sid = cands.get(n)
    if not sid:
        for cn, cid in cands.items():
            if n.startswith(cn + ' ') or cn.startswith(n + ' '):
                sid = cid
                break
    if not sid:
        best = difflib.get_close_matches(n, list(cands), n=1, cutoff=0.82)
        sid = cands[best[0]] if best else None
    if not sid:
        UNMATCHED.setdefault(line_id, set()).add(gtfs_name)
    _match_cache[key] = sid
    return sid


def line_of(short_name, route_type):
    if route_type not in RAIL_TYPES:
        return None
    m = re.match(r'\s*(\d+)', short_name or '')
    return m.group(1) if m and m.group(1) in NETWORK['lines'] else None


# ---------------------------------------------------------------------------
# Statisk GTFS
# ---------------------------------------------------------------------------
def static_zip_path():
    path = CACHE / f'{OPERATOR}.zip'
    fresh = path.exists() and (time.time() - path.stat().st_mtime) < STATIC_MAX_AGE_H * 3600
    if fresh:
        return path
    if not STATIC_KEY:
        if path.exists():
            return path
        raise SystemExit('Saknar TRAFIKLAB_STATIC_KEY och ingen cachad GTFS-fil finns.')
    url = f'{BASE_URL}/gtfs/{OPERATOR}/{OPERATOR}.zip?key={STATIC_KEY}'
    log.info('Hämtar statisk GTFS (%s) …', url.split('?')[0])
    try:
        with session.get(url, stream=True, timeout=300) as r:
            r.raise_for_status()
            tmp = path.with_suffix('.part')
            with open(tmp, 'wb') as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
            tmp.replace(path)
        log.info('Statisk GTFS sparad (%.1f MB)', path.stat().st_size / 1e6)
    except Exception as e:
        if path.exists():
            log.warning('Kunde inte uppdatera statisk GTFS (%s) – använder cachad fil', e)
        else:
            raise SystemExit(f'Kunde inte hämta statisk GTFS: {e}')
    return path


def read_csv(zf, name):
    with zf.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig'))


def hms(s):
    h, m, sec = s.split(':')
    return int(h) * 3600 + int(m) * 60 + int(sec)


def build_static():
    zpath = static_zip_path()
    pkl = CACHE / f'{OPERATOR}.parsed.pkl'
    stamp = (zpath.stat().st_mtime, zpath.stat().st_size, (HERE / 'network.json').stat().st_mtime, 5)
    if pkl.exists():
        try:
            data = pickle.loads(pkl.read_bytes())
            if data.get('stamp') == stamp:
                log.info('Läste tolkad GTFS från cache: %d spårturer', len(data['trips']))
                return data
        except Exception:
            pass
    t0 = time.time()
    log.info('Tolkar statisk GTFS …')
    with zipfile.ZipFile(zpath) as zf:
        stops = {}
        for r in read_csv(zf, 'stops.txt'):
            stops[r['stop_id']] = (r['stop_name'], float(r['stop_lat'] or 0), float(r['stop_lon'] or 0), r.get('parent_station') or '',
                                   r.get('platform_code') or '')
        route_line = {}
        for r in read_csv(zf, 'routes.txt'):
            try:
                rt = int(r.get('route_type') or -1)
            except ValueError:
                rt = -1
            lid = line_of(r.get('route_short_name'), rt)
            if lid:
                route_line[r['route_id']] = lid
        trip_line = {}
        for r in read_csv(zf, 'trips.txt'):
            lid = route_line.get(r['route_id'])
            if lid:
                trip_line[r['trip_id']] = lid
        log.info('%d spårlinjer (route_id), %d turer – läser stop_times …', len(route_line), len(trip_line))
        raw = {}
        with zf.open('stop_times.txt') as f:
            rd = csv.reader(io.TextIOWrapper(f, encoding='utf-8-sig'))
            hdr = next(rd)
            ti, ai, di, si, qi = (hdr.index(c) for c in ('trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'))
            for row in rd:
                if row[ti] in trip_line:
                    raw.setdefault(row[ti], []).append((int(row[qi]), row[si], row[ai] or row[di], row[di] or row[ai]))
    trips = {}
    for tid, rows in raw.items():
        lid = trip_line[tid]
        rows.sort()
        out = []
        for seq, stop_id, arr, dep in rows:
            name, lat, lon, parent, plat = stops.get(stop_id, ('', 0, 0, '', ''))
            pname = stops[parent][0] if parent in stops else name
            sid = match_station(lid, pname) or match_station(lid, name)
            if not sid:
                continue
            a, d = hms(arr), hms(dep)
            if out and out[-1]['st'] == sid:          # samma station två gånger i rad
                out[-1]['dep'] = d
                out[-1]['ids'].append(stop_id)
                continue
            out.append({'st': sid, 'lat': lat, 'lon': lon, 'arr': a, 'dep': d, 'seq': seq, 'ids': [stop_id], 'plat': plat})
        if len(out) < 2:
            continue
        # Rita turen på den linje i familjen som innehåller flest av dess stationer
        fam = FAMILY.get(lid, [lid])
        draw = max(fam, key=lambda m: (sum(s['st'] in DRAW_SETS[m] for s in out), m == lid))
        out = [s for s in out if s['st'] in DRAW_SETS[draw]]
        if len(out) >= 2:
            trips[tid] = {'line': lid, 'draw': draw, 'stops': out}
    data = {'stamp': stamp, 'trips': trips}
    pkl.write_bytes(pickle.dumps(data))
    log.info('Klart på %.0f s: %d spårturer', time.time() - t0, len(trips))
    for lid, names in sorted(UNMATCHED.items()):
        log.info('  Omatchade stoppnamn på linje %s: %s', lid, ', '.join(sorted(names)))
    return data


# ---------------------------------------------------------------------------
# Realtid
# ---------------------------------------------------------------------------
def service_day_epoch(start_date):
    """GTFS-tid 00:00:00 för trafikdygnet = kl 12 lokal tid minus 12 h."""
    if start_date and len(start_date) == 8:
        d = dt.date(int(start_date[:4]), int(start_date[4:6]), int(start_date[6:]))
    else:
        now = dt.datetime.now(TZ)
        d = (now - dt.timedelta(hours=4)).date()   # turer efter midnatt hör till gårdagen
    noon = dt.datetime(d.year, d.month, d.day, 12, tzinfo=TZ)
    return noon.timestamp() - 12 * 3600


def project(stops, lat, lon):
    """Närmaste sträcka (k, k+1) och andel f för en GPS-punkt. Returnerar (k, f, avstånd i meter)."""
    c = math.cos(math.radians(lat))
    px, py = 0.0, 0.0
    best = (0, 0.0, float('inf'))
    for k in range(len(stops) - 1):
        a, b = stops[k], stops[k + 1]
        ax, ay = (a['lon'] - lon) * c * 111320, (a['lat'] - lat) * 110540
        bx, by = (b['lon'] - lon) * c * 111320, (b['lat'] - lat) * 110540
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        f = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        d = math.hypot(ax + f * dx - px, ay + f * dy - py)
        if d < best[2] - 1:
            best = (k, f, d)
    return best


STATE = {'vehicles': [], 'updated': 0, 'feed_ts': 0, 'error': None, 'stats': {}, 'last_client': 0.0}
lock = threading.Lock()


def process_feed(feed, static):
    trips = static['trips']
    out, stats = [], {'entities': 0, 'rail': 0, 'unknown_trip': 0, 'off_route': 0, 'stale': 0}
    now = time.time()
    for ent in feed.entity:
        if not ent.HasField('vehicle'):
            continue
        stats['entities'] += 1
        v = ent.vehicle
        tid = v.trip.trip_id
        T = trips.get(tid)
        if not T:
            stats['unknown_trip'] += 1
            continue
        if not v.HasField('position'):
            continue
        ts = v.timestamp or feed.header.timestamp or now
        if now - ts > STALE_AFTER_S:
            stats['stale'] += 1
            continue
        stops = T['stops']
        k, f, dist = project(stops, v.position.latitude, v.position.longitude)
        # Står fordonet vid en station enligt flödet? Lita på det.
        if v.current_status == gtfs_realtime_pb2.VehiclePosition.STOPPED_AT and v.stop_id:
            for i, s in enumerate(stops):
                if v.stop_id in s['ids']:
                    k, f = (i, 0.0) if i < len(stops) - 1 else (i - 1, 1.0)
                    break
        if dist > MAX_OFF_ROUTE_M:
            stats['off_route'] += 1
            continue
        stats['rail'] += 1
        base = service_day_epoch(v.trip.start_date)
        arr = [base + s['arr'] for s in stops]
        dep = [base + s['dep'] for s in stops]
        n = len(stops)
        if k == 0 and f < 0.02:                       # väntar vid startstationen
            delay = max(0.0, ts - dep[0])
        elif k == n - 2 and f > 0.98:                 # framme vid ändstationen
            delay = max(0.0, min(ts, arr[-1] + 60) - arr[-1]) if ts < arr[-1] + 600 else 0.0
        elif f == 0.0:
            delay = ts - (arr[k] + dep[k]) / 2
        else:
            delay = ts - (dep[k] + f * (arr[k + 1] - dep[k]))
        out.append({
            'id': v.vehicle.id or tid,
            'line': T['line'],
            'draw': T['draw'],
            'trip': tid,
            'ts': ts,
            'delay': round(delay),
            'k': k,                                   # index för sträckan fordonet är på
            'f': round(f, 4),
            'stops': [s['st'] for s in stops],
            'arr': [round(t) for t in arr],
            'dep': [round(t) for t in dep],
            'plat': [s.get('plat', '') for s in stops],
            'to': stops[-1]['st'],
            'dist': round(dist),
        })
    return out, stats


def poll_loop(static):
    url = f'{BASE_URL}/gtfs-rt/{OPERATOR}/VehiclePositions.pb?key={RT_KEY}'
    backoff = POLL_SECONDS
    while True:
        if time.time() - STATE['last_client'] > IDLE_AFTER and STATE['updated']:
            time.sleep(2)
            continue
        t0 = time.time()
        try:
            r = session.get(url, timeout=30)
            if r.status_code == 429:
                raise RuntimeError('429 – kvoten är slut eller för tätt anrop')
            r.raise_for_status()
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(r.content)
            vehicles, stats = process_feed(feed, static)
            with lock:
                STATE.update(vehicles=vehicles, updated=time.time(), feed_ts=feed.header.timestamp,
                             error=None, stats=stats)
            log.info('Realtid: %d spårfordon av %d positioner (%s)', len(vehicles), stats['entities'],
                     ', '.join(f'{k}={v}' for k, v in stats.items() if k not in ('entities', 'rail')))
            backoff = POLL_SECONDS
        except Exception as e:
            with lock:
                STATE['error'] = str(e)
            log.warning('Realtid misslyckades: %s', e)
            backoff = min(backoff * 2, 600)
        time.sleep(max(1.0, backoff - (time.time() - t0)))


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE / 'public'), **kw)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith('/api/vehicles'):
            with lock:
                STATE['last_client'] = time.time()
                body = json.dumps({
                    'now': time.time(), 'updated': STATE['updated'], 'feed_ts': STATE['feed_ts'],
                    'poll': POLL_SECONDS, 'error': STATE['error'], 'stats': STATE['stats'],
                    'vehicles': STATE['vehicles'],
                }, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith('/api/debug'):
            body = json.dumps({'unmatched': {k: sorted(v) for k, v in UNMATCHED.items()}, 'stats': STATE['stats'],
                               'error': STATE['error'], 'poll': POLL_SECONDS}, ensure_ascii=False, indent=1).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def snapshot(outfile):
    """Engångskörning för GitHub Actions: hämta realtid en gång och skriv JSON-fil.
    Misslyckas något (t.ex. saknade nycklar) publiceras kartan ändå, utan fordon."""
    out = {'now': time.time(), 'updated': 0, 'static': True, 'poll': 300, 'error': None, 'stats': {}, 'vehicles': []}
    p = Path(outfile)
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        if not RT_KEY:
            raise RuntimeError('TRAFIKLAB_RT_KEY saknas (lägg in den som repo-hemlighet)')
        static = build_static()
    except (Exception, SystemExit) as e:
        out['error'] = str(e)
        log.error('Kan inte hämta data: %s', e)
        p.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
        return
    url = f'{BASE_URL}/gtfs-rt/{OPERATOR}/VehiclePositions.pb?key={RT_KEY}'
    try:
        r = session.get(url, timeout=60)
        r.raise_for_status()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(r.content)
        vehicles, stats = process_feed(feed, static)
        out.update(updated=time.time(), feed_ts=feed.header.timestamp, stats=stats, vehicles=vehicles)
        log.info('Ögonblicksbild: %d spårfordon', len(vehicles))
    except Exception as e:
        out['error'] = str(e)
        log.warning('Realtid misslyckades: %s', e)
    p.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')


def main():
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == '--snapshot':
        return snapshot(sys.argv[2])
    if not RT_KEY:
        raise SystemExit('Saknar TRAFIKLAB_RT_KEY (lägg den i .env)')
    static = build_static()
    STATE['last_client'] = time.time()
    threading.Thread(target=poll_loop, args=(static,), daemon=True).start()
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    log.info('Kartan: http://localhost:%d  (pollar var %.0f s när någon tittar)', PORT, POLL_SECONDS)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
