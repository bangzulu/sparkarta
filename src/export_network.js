// Exporterar linjer och stationer från data.js till network.json (används av servern)
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/data.js', 'utf8');
const ctx = {};
new Function('ctx', src + '\nctx.S=STATIONS_RAW; ctx.L=LINES;')(ctx);
const out = { stations: {}, lines: {} };
for (const id in ctx.S) out.stations[id] = ctx.S[id][0];
ctx.L.forEach(l => {
  out.lines[l.id] = { name: l.name, mode: l.mode,
    stops: l.path.filter(e => typeof e === 'string' || typeof e[0] === 'string').map(e => typeof e === 'string' ? e : e[0]) };
});
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(Object.keys(out.lines).length, 'linjer,', Object.keys(out.stations).length, 'stationer');
