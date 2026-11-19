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
    stamp = (zpath.stat().st_mtime, zpath.stat().st_size, (HERE / 'network.json').stat().st_mtime, 7)
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
        trip_line, trip_service = {}, {}
        for r in read_csv(zf, 'trips.txt'):
            lid = route_line.get(r['route_id'])
            if lid:
                trip_line[r['trip_id']] = lid
                trip_service[r['trip_id']] = r['service_id']
        # Trafikkalender: vilka dagar varje service_id gäller
        calendar = {}
        if 'calendar.txt' in zf.namelist():
            for r in read_csv(zf, 'calendar.txt'):
                calendar[r['service_id']] = {'days': [r[d] == '1' for d in ('monday', 'tuesday', 'wednesday', 'thursday',
                                                                            'friday', 'saturday', 'sunday')],
                                             'start': r['start_date'], 'end': r['end_date'], 'add': set(), 'remove': set()}
        if 'calendar_dates.txt' in zf.namelist():
            for r in read_csv(zf, 'calendar_dates.txt'):
                c = calendar.setdefault(r['service_id'], {'days': [False] * 7, 'start': '0', 'end': '0', 'add': set(), 'remove': set()})
                (c['add'] if r['exception_type'] == '1' else c['remove']).add(r['date'])
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
            trips[tid] = {'line': lid, 'draw': draw, 'stops': out, 'service': trip_service.get(tid)}
    # Stopp-id (plattform och förälder) → kartans stationer, för störningsmeddelanden
    stopmap = {}
    for T in trips.values():
        for s in T['stops']:
            for sid in s['ids']:
                stopmap.setdefault(sid, set()).add(s['st'])
                parent = stops.get(sid, ('', 0, 0, '', ''))[3]
                if parent:
                    stopmap.setdefault(parent, set()).add(s['st'])
    data = {'stamp': stamp, 'trips': trips, 'route_line': route_line, 'calendar': calendar, 'stopmap': {k: sorted(v) for k, v in stopmap.items()}}
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


STATE = {'vehicles': [], 'updated': 0, 'feed_ts': 0, 'error': None, 'stats': {}, 'last_client': 0.0,
         'alerts': [], 'alerts_updated': 0}
ALERT_SECONDS = float(os.environ.get('ALERT_SECONDS', '300'))
SCHED_CACHE = {'t': 0, 'body': b''}
STATIC_REF = {}


def tr(ts):
    """Svensk text ur en TranslatedString (annars första)."""
    for t in ts.translation:
        if t.language in ('sv', 'se', ''):
            return t.text.strip()
    return ts.translation[0].text.strip() if ts.translation else ''


def categorize(alert, text):
    t = text.lower()
    if re.search(r'\bhiss|rulltrapp|\bramp|entr[eé]|uppgång|utgång|trappa', t):
        return 'access'
    if alert.effect in (1, 2, 3, 4, 6) or re.search(
            r'ersätt|inställ|stopp i trafiken|ingen trafik|förseni|försen|enkelspår|signalfel|växelfel|'
            r'glesare|kortare tåg|vänd|olycka|obehöriga|reducerad|begränsad trafik|trafikstörning|avstängd sträcka', t):
        return 'traffic'
    return 'info'


def process_alerts(feed, static):
    rl, sm = static['route_line'], static['stopmap']
    now = time.time()
    out = []
    for ent in feed.entity:
        if not ent.HasField('alert'):
            continue
        a = ent.alert
        if a.active_period and not any((p.start or 0) <= now <= (p.end or 9e12) for p in a.active_period):
            continue
        lines = sorted({rl[i.route_id] for i in a.informed_entity if i.route_id in rl}, key=int)
        stations = sorted({st for i in a.informed_entity if i.stop_id in sm for st in sm[i.stop_id]})
        if not lines and not stations:
            continue
        title, text = tr(a.header_text), tr(a.description_text)
        per = [p for p in a.active_period if (p.start or 0) <= now <= (p.end or 9e12)]
        out.append({
            'id': ent.id, 'cat': categorize(a, title + ' ' + text), 'title': title, 'text': text,
            'lines': lines, 'stations': stations, 'routed': bool(lines),
            'start': per[0].start if per and per[0].start else None, 'end': per[0].end if per and per[0].end else None,
        })
    return merge_alerts(out)


CODE_TITLE = re.compile(r'^(stn\.?\s*medd|[A-ZÅÄÖ]{2,4}(\s|$|\s*[-–])|.*\bkris\b|.*\bmedd\.?$|alla\b|övriga\b)', re.I)


def nice_title(t, text):
    """SL:s skyltmeddelanden har interna rubriker (\"BFP Kris\", \"Stn.medd. ALV-SEP\") – använd då textens första mening."""
    if t and len(t) >= 12 and not CODE_TITLE.match(t):
        return t
    first = re.split(r'(?<=[.!?])\s|\n', text.strip(), maxsplit=1)[0] if text else t
    return (first[:110] + '…') if len(first) > 110 else first or t


MONTHS = {m: i + 1 for i, m in enumerate(['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti',
                                            'september', 'oktober', 'november', 'december'])}


def mentioned_dates(text, today):
    """Datum som nämns i texten (\"21 november\", \"21/11\", \"fr.o.m. 3 dec\")."""
    out = []
    t = text.lower()
    # Slutdatum (\"t.o.m. 1/12\", \"åter i drift den 31 december\") säger inget om när störningen börjar
    END = re.compile(r'(t\.?\s?o\.?\s?m\.?|till och med|fram till|till|tom|senast|åter|i drift|beräknas|upphör)\s*(den\s*)?$')
    is_end = lambda m: bool(END.search(t[max(0, m.start() - 40):m.start()].strip()))
    for m in re.finditer(r'\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s+(' + '|'.join(MONTHS) + r'|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\.?(?:\s+(\d{4}))?', t):
        if is_end(m):
            continue
        mon = MONTHS.get(m.group(2)) or next(v for k, v in MONTHS.items() if k.startswith(m.group(2)))
        out.append((int(m.group(1)), mon, int(m.group(3)) if m.group(3) else None))
    for m in re.finditer(r'(?<![\d/:.])(\d{1,2})/(\d{1,2})(?![\d/])', t):
        d, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12 and not is_end(m):
            out.append((d, mo, None))
    dates = []
    for d, mo, y in out:
        try:
            x = dt.date(y or today.year, mo, d)
        except ValueError:
            continue
        if y is None and (x - today).days < -180:      # \"5 januari\" i december → nästa år
            x = x.replace(year=today.year + 1)
        dates.append(x)
    return dates


def is_upcoming(x, today):
    """Planerad störning som publicerats i förväg: alla nämnda datum ligger efter i dag."""
    t = (x['title'] + ' ' + x['text']).lower()
    if re.search(r'\b(just nu|sedan kl|idag|i dag|pågår|tills vidare|tillsvidare|är (avstängd|stängd|inställd|ur funktion|flyttad)|går endast)\b', t):
        return False
    dates = mentioned_dates(t, today)
    return bool(dates) and min(dates) > today


def merge_alerts(alerts):
    """Samma störning publiceras ofta en gång per stationsskylt – slå ihop på text."""
    groups = {}
    for x in alerts:
        key = re.sub(r'\s+', ' ', (x['text'] or x['title']).lower()).strip()[:160]
        groups.setdefault(key, []).append(x)
    merged = []
    for g in groups.values():
        g.sort(key=lambda x: (not x['routed'], bool(CODE_TITLE.match(x['title'] or '')), -len(x['title'] or '')))
        best = dict(g[0])
        best['title'] = nice_title(best['title'], best['text'])
        best['lines'] = sorted({l for x in g for l in x['lines']}, key=int)
        best['stations'] = sorted({s for x in g for s in x['stations']})
        best['cat'] = min((x['cat'] for x in g), key=['traffic', 'access', 'info'].index)
        best['ends'] = [x['end'] for x in g if x['end']]
        best['end'] = max(best['ends']) if best['ends'] else None
        del best['ends'], best['routed']
        merged.append(best)
    # Andra varvet: nästan likadana texter (olika skyltvarianter av samma störning)
    def core(x):
        t = (x['text'] or x['title']).lower()
        t = re.sub(r'^\s*(\w+linjen\s*\d+|linje\s*\d+)\s*:\s*', '', t)
        return re.sub(r'\s+', ' ', t)[:150]
    out = []
    for x in sorted(merged, key=lambda x: (not x['lines'], -len(x['stations']))):
        for y in out:
            if x['cat'] == y['cat'] or {x['cat'], y['cat']} <= {'traffic', 'info'}:
                if difflib.SequenceMatcher(None, core(x), core(y)).ratio() >= 0.72:
                    y['lines'] = sorted(set(y['lines']) | set(x['lines']), key=int)
                    y['stations'] = sorted(set(y['stations']) | set(x['stations']))
                    y['end'] = max(filter(None, [x['end'], y['end']]), default=None)
                    y['cat'] = min(x['cat'], y['cat'], key=['traffic', 'access', 'info'].index)
                    break
        else:
            out.append(x)
    # Stationer som nämns i texten (t.ex. \"mellan Käppala och Gåshaga brygga\") – där sätts markören
    for x in out:
        cand = set(x['stations']) | {s for l in x['lines'] for s in NETWORK['lines'][l]['stops']}
        txt = ' ' + (x['title'] + ' ' + x['text']).lower() + ' '
        hits = []
        for sid in cand:
            nm = NETWORK['stations'][sid].lower()
            for m in re.finditer(re.escape(nm), txt):
                i = m.start()
                if not txt[i - 1].isalnum() and not txt[i + len(nm)].isalnum():
                    hits.append((i, sid))
                    break
        names = {}
        for i, sid in sorted(hits):        # samma namn på flera linjer (t.ex. Universitetet) – behåll en per namn
            names.setdefault(NETWORK['stations'][sid].lower(), sid)
        x['at'] = list(names.values())[:3]
        # Avstängd/ersatt sträcka: \"mellan A och B\", \"sträckan A - B\", \"Inställd trafik A - B\"
        x['stretch'] = None
        if x['cat'] == 'traffic':
            byname = {NETWORK['stations'][sid].lower(): sid for sid in cand}
            pat = r'(?:mellan|sträckan|trafik)\s+(.+?)\s+(?:och|-|–)\s+(.+?)(?=[\s.,;:]|$)'
            for m in re.finditer(pat, txt):
                a_, b_ = m.group(1).strip(), m.group(2).strip()
                # namnet kan vara flera ord – ta längsta kända stationsnamn i början/slutet
                A = next((byname[k] for k in sorted(byname, key=len, reverse=True) if a_.endswith(k)), None)
                B = next((byname[k] for k in sorted(byname, key=len, reverse=True)
                          if txt[m.start(2):].startswith(k)), None)
                if A and B and A != B:
                    x['stretch'] = [A, B]
                    break
    # Planerade störningar som ligger framåt i tiden visas inte
    today = dt.datetime.now(TZ).date()
    upcoming = [x for x in out if is_upcoming(x, today)]
    if upcoming:
        log.info('Döljer %d kommande störningar: %s', len(upcoming), '; '.join(x['title'][:50] for x in upcoming))
    out = [x for x in out if not is_upcoming(x, today)]
    # Tredje varvet: samma kategori och samma utpekade stationer, eller nästan samma rubrik → en störning
    def tcore(x):
        return re.sub(r'^\s*(\w+linjen\s*\d+|linje\s*\d+)\s*:\s*', '', x['title'].lower())[:70]
    final = []
    for x in out:
        for y in final:
            same_at = x['at'] and set(x['at']) == set(y['at']) and x['cat'] == y['cat']
            if same_at or difflib.SequenceMatcher(None, tcore(x), tcore(y)).ratio() >= 0.8:
                if len(x['lines']) > len(y['lines']) or (x['lines'] and not CODE_TITLE.match(x['title']) and not y['lines']):
                    y['title'], y['text'] = x['title'], x['text']
                y['lines'] = sorted(set(y['lines']) | set(x['lines']), key=int)
                y['stations'] = sorted(set(y['stations']) | set(x['stations']))
                y['at'] = y['at'] or x['at']
                y['stretch'] = y.get('stretch') or x.get('stretch')
                y['end'] = max(filter(None, [x['end'], y['end']]), default=None)
                break
        else:
            final.append(x)
    return final


def fetch_alerts(static):
    r = session.get(f'{BASE_URL}/gtfs-rt/{OPERATOR}/ServiceAlerts.pb?key={RT_KEY}', timeout=60)
    r.raise_for_status()
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(r.content)
    return process_alerts(feed, static)
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
        if t0 - STATE['alerts_updated'] > ALERT_SECONDS:
            try:
                alerts = fetch_alerts(static)
                with lock:
                    STATE.update(alerts=alerts, alerts_updated=t0)
                log.info('Störningar: %d meddelanden för spårtrafiken', len(alerts))
            except Exception as e:
                STATE['alerts_updated'] = t0 - ALERT_SECONDS + 60   # nytt försök om en minut
                log.warning('Störningar misslyckades: %s', e)
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
                    'vehicles': STATE['vehicles'], 'alerts': STATE['alerts'],
                }, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith('/api/schedule'):
            if time.time() - SCHED_CACHE['t'] > 3600:
                SCHED_CACHE.update(t=time.time(), body=json.dumps(build_schedule(STATIC_REF['s']), separators=(',', ':')).encode())
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(SCHED_CACHE['body'])))
            self.end_headers()
            self.wfile.write(SCHED_CACHE['body'])
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


def service_runs(cal, date):
    """Går service_id den här dagen (date: datetime.date)?"""
    if not cal:
        return False
    ds = date.strftime('%Y%m%d')
    if ds in cal['remove']:
        return False
    if ds in cal['add']:
        return True
    return cal['start'] <= ds <= cal['end'] and cal['days'][date.weekday()]


def build_schedule(static, now=None):
    """Kompakt tidtabell för spårturer som går mellan nu-1 h och nu+30 h.
    Används av kartan när realtiden är gammal och för avgångar som inte startat än.
    Format: patterns = stationslistor, timings = [ankomst, avgång]-par i sekunder från turens start,
    trips = [tur-id, linje, ritlinje, mönster, tidsprofil, start (epoch)]."""
    now = now or time.time()
    today = dt.datetime.now(TZ).date()
    patterns, pidx, timings, tidx, out = [], {}, [], {}, []
    for d in (today - dt.timedelta(days=1), today, today + dt.timedelta(days=1)):
        base = service_day_epoch(d.strftime('%Y%m%d'))
        runs = {}
        for tid, T in static['trips'].items():
            sv = T.get('service')
            if sv not in runs:
                runs[sv] = service_runs(static['calendar'].get(sv), d)
            if not runs[sv]:
                continue
            st = T['stops']
            start, end = base + st[0]['dep'], base + st[-1]['arr']
            if end < now - 3600 or start > now + 30 * 3600:
                continue
            pk = tuple(s['st'] for s in st)
            if pk not in pidx:
                pidx[pk] = len(patterns); patterns.append(list(pk))
            t0 = st[0]['dep']
            tk = tuple(v for s in st for v in (s['arr'] - t0, s['dep'] - t0))
            if tk not in tidx:
                tidx[tk] = len(timings); timings.append(list(tk))
            out.append([tid, T['line'], T['draw'], pidx[pk], tidx[tk], round(start)])
    out.sort(key=lambda r: r[5])
    # Stationernas geografiska läge (medel av plattformarna) – för \"min position\" på kartan
    acc = {}
    for T in static['trips'].values():
        for s in T['stops']:
            if s['lat'] and s['lon']:
                a = acc.setdefault(s['st'], {})
                a.setdefault(s['ids'][0], (s['lat'], s['lon']))
    geo = {sid: [round(sum(p[0] for p in v.values()) / len(v), 6), round(sum(p[1] for p in v.values()) / len(v), 6)]
           for sid, v in acc.items()}
    return {'generated': round(now), 'patterns': patterns, 'timings': timings, 'trips': out, 'geo': geo}


def snapshot(outfile):
    """Engångskörning för GitHub Actions: hämta realtid en gång och skriv JSON-fil.
    Misslyckas något (t.ex. saknade nycklar) publiceras kartan ändå, utan fordon."""
    out = {'now': time.time(), 'updated': 0, 'static': True, 'poll': 300, 'error': None, 'stats': {}, 'vehicles': [], 'alerts': []}
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
    try:
        out['alerts'] = fetch_alerts(static)
        log.info('Störningar: %d', len(out['alerts']))
    except Exception as e:
        log.warning('Störningar misslyckades: %s', e)
    p.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    # Tidtabell bredvid (api/schedule) – kartan använder den när realtiden är gammal
    sched = build_schedule(static)
    (p.parent / 'schedule').write_text(json.dumps(sched, separators=(',', ':')), encoding='utf-8')
    log.info('Tidtabell: %d turer, %d mönster, %d tidsprofiler', len(sched['trips']), len(sched['patterns']), len(sched['timings']))


def main():
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == '--snapshot':
        return snapshot(sys.argv[2])
    if not RT_KEY:
        raise SystemExit('Saknar TRAFIKLAB_RT_KEY (lägg den i .env)')
    static = build_static()
    STATIC_REF['s'] = static
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
