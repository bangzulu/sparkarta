# Spårkarta – live

Interaktiv spårkarta med SL:s spårfordon i realtid (GTFS Regional via Trafiklab).

## Kom igång

```bash
pip install -r requirements.txt
python3 server.py
```

Öppna **http://localhost:8080**. Kartan startar i läget *Live* (knapparna Live / Demo / Av nere till höger).

Första starten hämtar SL:s statiska GTFS (`sl.zip`) och tolkar den – det kan ta någon minut.
Resultatet cachas i `cache/` och hämtas om högst var 72:e timme (statisk kvot Bronze: 50 hämtningar/månad).

## Hur det fungerar

1. **Statisk data** – rutter med `route_type` för tåg/tunnelbana/spårvagn och linjenummer som finns på kartan
   (10–19, 40–48, 7, 12, 21, 25–31) behålls. Varje turs stopp matchas mot kartans stationer *inom den linjen*
   (namnnormalisering + `ALIASES` i `server.py`).
2. **Realtid** – `VehiclePositions.pb` hämtas var `POLL_SECONDS`. Varje GPS-position projiceras på turens
   stoppsträckor → *mellan station A och B, andel f*. Förseningen räknas mot tidtabellen.
3. **Kartan** hämtar `/api/vehicles` var 10:e sekund och låter fordonen rulla vidare enligt tidtabell + försening
   mellan uppdateringarna (högst 3 stopp förbi senaste mätningen, fryser efter 4 min utan ny data).

Servern pollar bara när någon har kartan öppen (senaste 5 min), så kvoten räcker längre.

## Publik webb via GitHub Pages

Workflowen `.github/workflows/pages.yml` publicerar kartan med realtidsdata utan egen server:
var 5:e minut (GitHub kör schemat ungefärligt, ofta 5–15 min) hämtas positionerna och läggs som
`api/vehicles` bredvid kartan. Mellan uppdateringarna rullar tågen vidare enligt tidtabell + försening.

Engångsinställning:
1. **Settings → Secrets and variables → Actions**: lägg till `TRAFIKLAB_RT_KEY` och `TRAFIKLAB_STATIC_KEY`.
2. **Settings → Pages → Source**: välj *GitHub Actions*.
3. Repot måste vara publikt (eller GitHub Pro) för Pages.
4. **Actions → Publicera spårkarta → Run workflow** för första körningen.

Kvot: ~9 000 realtidsanrop/månad (Bronze tillåter 30 000), statisk data hämtas var 3:e dygn.

## Störningar

Servern hämtar även GTFS-RT **ServiceAlerts** (samma nyckel) var 5:e minut. Meddelanden för spårtrafiken
kopplas till kartans stationer och linjer, dubbletter (samma störning per stationsskylt) slås ihop och
delas in i *Trafikstörningar*, *Hiss & entréer* och *Övrig info* – av/på med knapparna uppe till vänster.
Avstängda/ersatta sträckor ("mellan A och B") ritas som streckad röd linje.

## Kvot

| Nivå   | Realtid/månad | Rimligt `POLL_SECONDS` |
|--------|---------------|------------------------|
| Bronze | 30 000        | 90                     |
| Silver | 2 000 000     | 5–10                   |

Silver kan begäras via *Upgrade quota* på nyckeln i Trafiklab.

## Felsökning

- `http://localhost:8080/api/debug` – stoppnamn som inte matchade kartan (lägg till i `ALIASES`),
  statistik från senaste hämtningen (`unknown_trip`, `off_route`, `stale`) och senaste fel.
- `unknown_trip` högt → statisk data och realtid har olika tur-id:n; radera `cache/` och starta om.
- `off_route` högt → positionerna ligger > 1,5 km från turens stopp (depå/felposition), justera `MAX_OFF_ROUTE_M`.

## Ändra kartan

Källkoden finns i `src/`. Efter ändring i `data.js`:

```bash
cd src && python3 build.py && cp index.html ../public/ && node export_network.js ../network.json
```

## Övrigt

- `.env` innehåller dina API-nycklar – checka inte in den (står i `.gitignore`).
- Öppnas `public/index.html` direkt som fil (utan server) körs kartan i demoläge.
