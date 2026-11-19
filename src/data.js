/* =========================================================================
   SPÅRKARTA – DATA
   Koordinater i kartans pixelsystem (2835 × 1984), uppmätta mot SL:s
   spårtrafikkarta 2025-04-14.
   ========================================================================= */

/* Stationer: id: [namn, x, y, etikett]
   etikett: riktning (e w n s ne se nw sw) eller objekt {d, t, x, y}
   d = riktning, t = text med \n för radbrytning, x/y = egen ankarpunkt */
const STATIONS_RAW = {
  /* --- Pendeltåg norr --- */
  upc: ['Uppsala C', 1624, 286], kni: ['Knivsta', 1624, 320, 'e'], arl: ['Arlanda central', 1624, 366, 'e'],
  mst: ['Märsta', 1548, 349], rsb: ['Rosersberg', 1588, 388, 'w'],
  upv: ['Upplands Väsby', 1624, 434, 'w'], rtb: ['Rotebro', 1624, 474, 'w'], nrv: ['Norrviken', 1624, 516, 'w'],
  hgv: ['Häggvik', 1624, 556, 'w'], stn: ['Sollentuna', 1624, 596, 'w'], hel: ['Helenelund', 1624, 636, 'w'],
  uld: ['Ulriksdal', 1624, 676, 'w'], sol: ['Solna', 1624, 721, 'w'],
  bal: ['Bålsta', 690, 396], bro: ['Bro', 734, 442, 'e'], kgn: ['Kungsängen', 790, 498, 'e'],
  kal: ['Kallhäll', 846, 554, 'e'], jkb: ['Jakobsberg', 902, 610, 'e'], bkb: ['Barkarby', 958, 666, 'e'],
  spa: ['Spånga', 1010, 718, 'e'],
  sby: ['Sundbyberg', 1241, 762, { d: 'e', x: 1234, y: 788 }],
  sodp: ['Stockholm Odenplan', 1761, 1028, { d: 'e', t: 'Stockholm\nOdenplan', x: 1756, y: 1056 }],
  cty: ['Stockholm City', 1891, 1093],
  sod: ['Stockholms södra', 1727, 1297, { d: 'e', t: 'Stockholms\nsödra', x: 1745, y: 1305 }],
  ast: ['Årstaberg', 1615, 1409, { d: 'ne', x: 1605, y: 1388 }], alj: ['Älvsjö', 1576, 1448, 'e'],
  stu: ['Stuvsta', 1516, 1508, 'e'], hud: ['Huddinge', 1480, 1544, 'e'], flb: ['Flemingsberg', 1442, 1581, 'e'],
  tul: ['Tullinge', 1406, 1618, 'e'], tum: ['Tumba', 1368, 1654, 'e'], ron: ['Rönninge', 1332, 1692, 'e'],
  ost: ['Östertälje', 1294, 1728, 'e'], sjh: ['Södertälje hamn', 1260, 1761, { d: 'e', x: 1272, y: 1761 }],
  sjc: ['Södertälje centrum', 1195, 1761],
  sjs: ['Södertälje syd', 1212, 1810, 'e'], jar: ['Järna', 1180, 1842, 'e'], mlb: ['Mölnbo', 1146, 1878, 'e'],
  gne: ['Gnesta', 1121, 1903],
  fst: ['Farsta strand', 1932, 1843, 'ne'],
  trs: ['Trångsund', 1980, 1884, 'ne'], skg: ['Skogås', 2034, 1884, 'ne'], veg: ['Vega', 2086, 1884, 'ne'],
  hnd: ['Handen', 2140, 1884, 'ne'], jrd: ['Jordbro', 2192, 1884, 'ne'], vhn: ['Västerhaninge', 2246, 1884, 'ne'],
  krg: ['Krigslida', 2298, 1884, 'ne'], tgs: ['Tungelsta', 2352, 1884, 'ne'], hmf: ['Hemfosa', 2406, 1884, 'ne'],
  sgs: ['Segersäng', 2458, 1884, 'ne'], osm: ['Ösmo', 2512, 1884, 'ne'], nyg: ['Nynäsgård', 2564, 1884, 'ne'],
  grv: ['Gröndalsviken', 2618, 1884, 'ne'], nyh: ['Nynäshamn', 2682, 1884],

  /* --- Tunnelbana blå --- */
  kgdt: ['Kungsträdgården', 2080, 1093], tc: ['T-Centralen', 1919, 1093],
  rad: ['Rådhuset', 1658, 1093, 'sw'], fri: ['Fridhemsplan', 1585, 1012, 'ne'],
  sdh: ['Stadshagen', 1578, 908, 'e'], vsk: ['Västra skogen', 1578, 858, 'e'],
  hvs: ['Huvudsta', 1471, 848, 'n'], sst: ['Solna strand', 1370, 802, 'e'],
  sbc: ['Sundbybergs centrum', 1241, 734, { d: 'e', t: 'Sundbybergs\ncentrum', x: 1234, y: 704 }],
  dvb: ['Duvbo', 1162, 676, 'e'], rsn: ['Rissne', 1124, 638, 'e'], rnk: ['Rinkeby', 1082, 596, 'e'],
  tns: ['Tensta', 1042, 556, 'e'], hjs: ['Hjulsta', 1014, 528],
  snc: ['Solna centrum', 1489, 750, { d: 'e', t: 'Solna\ncentrum', x: 1486, y: 718 }],
  nkr: ['Näckrosen', 1412, 676, 'e'], hlb: ['Hallonbergen', 1370, 636, 'e'], kis: ['Kista', 1330, 596, 'e'],
  hsb: ['Husby', 1290, 556, 'e'], akl: ['Akalla', 1263, 529],

  /* --- Tunnelbana grön --- */
  hst: ['Hässelby strand', 790, 1012], hgg: ['Hässelby gård', 820, 1012, 'sw'], jhl: ['Johannelund', 870, 1012, 'sw'],
  vlb: ['Vällingby', 920, 1012, 'sw'], rck: ['Råcksta', 970, 1012, 'sw'], blb: ['Blackeberg', 1020, 1012, 'sw'],
  isl: ['Islandstorget', 1070, 1012, 'sw'], ang: ['Ängbyplan', 1120, 1012, 'sw'], akh: ['Åkeshov', 1170, 1012, 'sw'],
  brp: ['Brommaplan', 1220, 1012, 'sw'], abb: ['Abrahamsberg', 1270, 1012, 'sw'], smo: ['Stora mossen', 1320, 1012, 'sw'],
  alv: ['Alvik', 1356, 1012], krb: ['Kristineberg', 1452, 1012, 'ne'], thp: ['Thorildsplan', 1510, 1012, 'ne'],
  ste: ['S:t Eriksplan', 1658, 1012, 'ne'], odp: ['Odenplan', 1761, 1012, { d: 'ne', x: 1764, y: 1000 }],
  rdm: ['Rådmansgatan', 1814, 1012, 'ne'], hot: ['Hötorget', 1870, 1012, 'ne'],
  gst: ['Gamla stan', 1919, 1156, { d: 'e', x: 1942, y: 1156 }], slu: ['Slussen', 1919, 1217],
  med: ['Medborgarplatsen', 1911, 1262, 'w'], sku: ['Skanstull', 1911, 1312, 'w'],
  gul: ['Gullmarsplan', 1905, 1372, { d: 'e', x: 1924, y: 1378 }], smb: ['Skärmarbrink', 1911, 1414, 'e'],
  bls: ['Blåsut', 1911, 1504, 'e'], sdb: ['Sandsborg', 1911, 1550, 'e'], skk: ['Skogskyrkogården', 1911, 1594, 'e'],
  tkg: ['Tallkrogen', 1911, 1640, 'e'], gbg: ['Gubbängen', 1911, 1686, 'e'], hkg: ['Hökarängen', 1911, 1730, 'e'],
  far: ['Farsta', 1911, 1776, 'e'],
  hmh: ['Hammarbyhöjden', 1944, 1460, 'e'], bjh: ['Björkhagen', 1988, 1504, 'e'], krt: ['Kärrtorp', 2032, 1550, 'e'],
  bgm: ['Bagarmossen', 2078, 1594, 'e'], skp: ['Skarpnäck', 2108, 1624],
  glo: ['Globen', 1862, 1414, { d: 'ne', x: 1838, y: 1398 }],
  egd: ['Enskede gård', 1824, 1460, { d: 'e', t: 'Enskede\ngård' }], sop: ['Sockenplan', 1778, 1506, 'e'],
  svm: ['Svedmyra', 1736, 1548, 'e'], stb: ['Stureby', 1694, 1590, 'e'], bdh: ['Bandhagen', 1632, 1652, 'e'],
  hgd: ['Högdalen', 1594, 1690, 'e'], rgv: ['Rågsved', 1556, 1728, 'e'], hag: ['Hagsätra', 1526, 1758],

  /* --- Tunnelbana röd --- */
  mbc: ['Mörby centrum', 1926, 610], dds: ['Danderyds sjukhus', 1926, 694, 'e'], ber: ['Bergshamra', 1926, 736, 'e'],
  uni: ['Universitetet', 1926, 776, { d: 'e', x: 1940, y: 776 }],
  tek: ['Tekniska högskolan', 1926, 818, { d: 'e', t: 'Tekniska\nhögskolan', x: 1940, y: 826 }],
  sta: ['Stadion', 1926, 892, 'e'], omt: ['Östermalmstorg', 1926, 986, 'e'],
  kar: ['Karlaplan', 1982, 924, 'e'], gar: ['Gärdet', 2043, 862, 'e'], rop: ['Ropsten', 2133, 778],
  mar: ['Mariatorget', 1708, 1280, 'ne'], zin: ['Zinkensdamm', 1638, 1280, 'ne'], hor: ['Hornstull', 1558, 1280, 'ne'],
  lil: ['Liljeholmen', 1480, 1280, 'ne'], asp: ['Aspudden', 1344, 1280, 'ne'], orn: ['Örnsberg', 1280, 1280, 'ne'],
  axb: ['Axelsberg', 1216, 1280, 'ne'],
  mhj: ['Mälarhöjden', 1156, 1318, 'e'], bre: ['Bredäng', 1106, 1368, 'e'], sat: ['Sätra', 1058, 1416, 'e'],
  skh: ['Skärholmen', 1010, 1464, 'e'], vbe: ['Vårberg', 962, 1512, 'e'], vbg: ['Vårby gård', 912, 1561, 'e'],
  mas: ['Masmo', 864, 1610, 'e'], fit: ['Fittja', 816, 1658, 'e'], alb: ['Alby', 768, 1706, 'e'],
  hal: ['Hallunda', 718, 1754, 'e'], nor: ['Norsborg', 676, 1800],
  msk: ['Midsommarkransen', 1386, 1366, 'e'], tel: ['Telefonplan', 1338, 1416, 'e'],
  hgs: ['Hägerstensåsen', 1290, 1464, 'e'], vtp: ['Västertorp', 1242, 1510, 'e'], fru: ['Fruängen', 1206, 1546],

  /* --- Tvärbanan --- */
  sols: ['Solna station', 1648, 721], sbp: ['Solna Business Park', 1356, 750, { d: 'e', t: 'Solna\nBusiness\nPark', x: 1352, y: 703 }],
  bbr: ['Bällsta bro', 1218, 824, 'e'], kbv: ['Karlsbodavägen', 1256, 864, 'e'], nul: ['Norra Ulvsunda', 1296, 904, 'e'],
  jhf: ['Johannesfred', 1336, 942, 'e'], avs: ['Alviks strand', 1363, 1052], ses: ['Stora Essingen', 1363, 1124, 'e'],
  grd: ['Gröndal', 1374, 1168, 'e'], trk: ['Trekanten', 1422, 1216, 'e'], asd: ['Årstadal', 1560, 1354, 'ne'],
  asf: ['Årstafältet', 1674, 1412, 'ne'], vtg: ['Valla torg', 1736, 1412, 'ne'], lin: ['Linde', 1798, 1412, 'ne'],
  mtd: ['Mårtensdal', 1924, 1340, 'e'], lum: ['Luma', 1952, 1312, 'e'], skj: ['Sickla kaj', 1980, 1284, 'e'],
  sku2: ['Sickla udde', 2008, 1256, 'e'], sic: ['Sickla', 2105, 1225],
  bfp: ['Bromma flygplats', 1117, 822], bbl: ['Bromma Blocks', 1176, 890, 'w'],

  /* --- Nockebybanan --- */
  alp: ['Alléparken', 1250, 1141, 'sw'], klv: ['Klövervägen', 1200, 1141, 'sw'], sml: ['Smedslätten', 1149, 1141, 'sw'],
  alg: ['Ålstensgatan', 1100, 1141, 'sw'], agd: ['Ålstens gård', 1049, 1141, 'sw'], hgt: ['Höglandstorget', 1000, 1141, 'sw'],
  olv: ['Olovslund', 949, 1141, 'sw'], nbt: ['Nockeby torg', 900, 1141, 'sw'], nby: ['Nockeby', 868, 1141],

  /* --- Roslagsbanan --- */
  soe: ['Stockholms östra', 1890, 818],
  unr: ['Universitetet', 1890, 776, { d: 'w', x: 1860, y: 776 }],
  sts: ['Stocksund', 1905, 734, { d: 'w', x: 1860, y: 734 }],
  mrb: ['Mörby', 1890, 693, { d: 'w', x: 1860, y: 693 }],
  dos: ['Djursholms Ösby', 1890, 654, { d: 'w', x: 1860, y: 654 }],
  brv: ['Bråvallavägen', 1890, 614, { d: 'w', x: 1860, y: 614 }],
  dek: ['Djursholms Ekeby', 1890, 574, { d: 'w', x: 1860, y: 574 }],
  ebb: ['Enebyberg', 1890, 532, { d: 'w', x: 1860, y: 532 }],
  rnb: ['Roslags Näsby', 1883, 490, { d: 'w', x: 1860, y: 490 }],
  tib: ['Tibble', 1876, 450, { d: 'w', x: 1862, y: 450 }],
  ens: ['Ensta', 1876, 410, { d: 'w', x: 1862, y: 410 }],
  vis: ['Visinge', 1876, 370, { d: 'w', x: 1862, y: 370 }],
  tky: ['Täby kyrkby', 2054, 344, 'sw'], kgl: ['Kragstalund', 2116, 344, 'sw'], bls2: ['Bällsta', 2176, 344, 'sw'],
  vtn: ['Vallentuna', 2238, 344, 'sw'], orm: ['Ormsta', 2300, 344, 'sw'], mol: ['Molnby', 2360, 344, 'sw'],
  lho: ['Lindholmen', 2422, 344, 'sw'], frs: ['Frösunda', 2482, 344, 'sw'], eks: ['Ekskogen', 2544, 344, 'sw'],
  kst: ['Kårsta', 2600, 344],
  tbc: ['Täby centrum', 1994, 465, 'sw'], gpf: ['Galoppfältet', 2054, 465, 'sw'], vgh: ['Viggbyholm', 2116, 465, 'sw'],
  hgn: ['Hägernäs', 2176, 465, 'sw'], arn: ['Arninge', 2238, 465, 'sw'], ryd: ['Rydbo', 2300, 465, 'sw'],
  tlj: ['Täljö', 2360, 465, 'sw'], akr: ['Åkers runö', 2422, 465, 'sw'], akb: ['Åkersberga', 2482, 465, 'sw'],
  tun: ['Tunagård', 2544, 465, 'sw'], osk: ['Österskär', 2600, 465],
  vdv: ['Vendevägen', 2176, 583, 'sw'], ostb: ['Östberga', 2238, 583, 'sw'], alt: ['Altorp', 2300, 583, 'sw'],
  lah: ['Lahäll', 2360, 583, 'sw'], nal: ['Näsby allé', 2422, 583, 'sw'], nbp: ['Näsbypark', 2478, 583],

  /* --- Lidingöbanan --- */
  tsv: ['Torsvik', 2168, 764, 'ne'], bgb: ['Baggeby', 2214, 764, 'ne'], bdl: ['Bodal', 2258, 764, 'ne'],
  lsb: ['Larsberg', 2304, 764, 'ne'], aga: ['AGA', 2350, 764, 'ne'], sks: ['Skärsätra', 2396, 764, 'ne'],
  ktl: ['Kottla', 2442, 764, 'ne'], hgb: ['Högberga', 2486, 764, 'ne'], brk: ['Brevik', 2532, 764, 'ne'],
  kpl: ['Käppala', 2578, 764, 'ne'], gsh: ['Gåshaga', 2624, 764, 'ne'], gsb: ['Gåshaga brygga', 2666, 764],

  /* --- Spårväg City --- */
  kgd7: ['Kungsträdgården', 2090, 1012, 'ne'], nyb: ['Nybroplan', 2159, 1012, 'ne'], stg: ['Styrmansgatan', 2227, 1012, 'ne'],
  dgb: ['Djurgårdsbron', 2297, 1012, 'ne'], nmv: ['Nordiska museet / Vasamuseet', 2367, 1012, 'ne'],
  lgl: ['Liljevalchs / Gröna Lund', 2435, 1012, 'ne'], skn: ['Skansen', 2504, 1012, 'ne'],
  dgs: ['Djurgårdsskolan', 2573, 1012, 'ne'], bmr: ['Bellmansro', 2647, 1012, 'ne'], wal: ['Waldemarsudde', 2670, 1062],

  /* --- Saltsjöbanan --- */
  hen: ['Henriksdal', 2051, 1217, 'ne'], nac: ['Nacka', 2158, 1217, 'ne'], sjj: ['Saltsjö-Järla', 2208, 1217, 'ne'],
  lla: ['Lillängen', 2260, 1217, 'ne'], sto: ['Storängen', 2312, 1217, 'ne'], sdv: ['Saltsjö-Duvnäs', 2364, 1217, 'ne'],
  ovk: ['Östervik', 2414, 1217, 'ne'], fis: ['Fisksätra', 2466, 1217, 'ne'], igb: ['Igelboda', 2518, 1224, { d: 'ne', x: 2524, y: 1204 }],
  ngl: ['Neglinge', 2568, 1217, 'ne'], rgv2: ['Ringvägen', 2620, 1217, 'ne'], sjb: ['Saltsjöbaden', 2668, 1217],
  tip: ['Tippen', 2558, 1270, 'e'], tat: ['Tattby', 2592, 1304, 'e'], erb: ['Erstaviksbadet', 2624, 1336, 'e'],
  sls: ['Solsidan', 2670, 1373],
};

/* Linjer. path: 'id' = station, ['id', x, y] = station med egen punkt för linjen, [x, y] = kurvpunkt */
const PENDEL_CORE = [[1624, 762], [1731, 869], [1731, 1028], 'sodp', [1891, 1028], 'cty', [1891, 1133], 'sod', 'ast', 'alj'];
const PENDEL_N = ['upv', 'rtb', 'nrv', 'hgv', 'stn', 'hel', 'uld', 'sol'];
const PENDEL_SW = ['stu', 'hud', 'flb', 'tul', 'tum', 'ron', 'ost', 'sjh', 'sjc'];
const BLUE_C = ['kgdt', 'tc', 'rad', [1578, 1093], ['fri', 1578, 1012], 'sdh', 'vsk'];
const RED_C = [['tc', 1927, 1093], ['gst', 1927, 1156], ['slu', 1927, 1217], [1927, 1280], 'mar', 'zin', 'hor'];
const GREEN_W = ['akh', 'brp', 'abb', 'smo'];
const GREEN_C = ['alv', 'krb', 'thp', 'fri', 'ste', 'odp', 'rdm', 'hot', [1911, 1012], ['tc', 1911, 1093],
  ['gst', 1911, 1156], ['slu', 1911, 1217], 'med', 'sku', ['gul', 1911, 1374]];
const RB = x => [['soe', x, 818], ['unr', x, 776], ['sts', x, 734], ['mrb', x, 693], ['dos', x, 654]];
const RB_MID = x => [['brv', x, 614], ['dek', x, 574], ['ebb', x, 532], ['rnb', x, 490]];
const SALT = [['slu', 1932, 1217], 'hen', ['sic', 2105, 1217], 'nac', 'sjj', 'lla', 'sto', 'sdv', 'ovk', 'fis'];

const COLORS = {
  pendel: ['#f067a6', '#db2e92'], blue: ['#0091d2'], red: ['#e31f26'], green: ['#00b259'],
  tvar: ['#de8221', '#edb984'], roslag: ['#a05da6', '#bc90c2'], saltsjo: ['#00aaad', '#3bc0c4'],
  lidingo: ['#b66732', '#ca9165'], nockeby: ['#738ba4', '#acb6c6'], city: ['#80857e', '#9fa39d'],
};

const LINES = [
  { id: '40', mode: 'pendel', c: 'pendel', name: 'Pendeltåg 40', desc: 'Uppsala C – Södertälje centrum',
    path: ['upc', 'kni', 'arl', ...PENDEL_N, ...PENDEL_CORE, ...PENDEL_SW] },
  { id: '41', mode: 'pendel', c: 'pendel', name: 'Pendeltåg 41', desc: 'Märsta – Södertälje centrum',
    path: ['mst', 'rsb', [1624, 424], ...PENDEL_N, ...PENDEL_CORE, ...PENDEL_SW] },
  { id: '43', mode: 'pendel', c: 'pendel', name: 'Pendeltåg 43', desc: 'Bålsta – Nynäshamn',
    path: ['bal', 'bro', 'kgn', 'kal', 'jkb', 'bkb', 'spa', [1054, 762], 'sby', [1600, 762], ['sol', 1630, 768],
      ...PENDEL_CORE.slice(1), [1566, 1460], [1566, 1482], 'fst', [1972, 1884], 'trs', 'skg', 'veg', 'hnd', 'jrd', 'vhn',
      'krg', 'tgs', 'hmf', 'sgs', 'osm', 'nyg', 'grv', 'nyh'] },
  { id: '48', mode: 'pendel', c: 'pendel', name: 'Pendeltåg 48', desc: 'Södertälje centrum – Gnesta',
    path: ['sjc', 'sjh', 'sjs', 'jar', 'mlb', 'gne'] },

  { id: '10', mode: 'metro', c: 'blue', name: 'Tunnelbana 10', desc: 'Kungsträdgården – Hjulsta',
    path: [...BLUE_C, [1578, 848], 'hvs', [1411, 848], 'sst', [1302, 734], 'sbc', [1220, 734], 'dvb', 'rsn', 'rnk', 'tns', 'hjs'] },
  { id: '11', mode: 'metro', c: 'blue', name: 'Tunnelbana 11', desc: 'Kungsträdgården – Akalla',
    path: [...BLUE_C, [1578, 840], 'snc', 'nkr', 'hlb', 'kis', 'hsb', 'akl'] },
  { id: '13', mode: 'metro', c: 'red', name: 'Tunnelbana 13', desc: 'Ropsten – Norsborg',
    path: [['rop', 2133, 795], [2112, 795], 'gar', 'kar', [1931, 975], 'omt', ...RED_C, 'lil', 'asp', 'orn', 'axb', [1194, 1280],
      'mhj', 'bre', 'sat', 'skh', 'vbe', 'vbg', 'mas', 'fit', 'alb', 'hal', 'nor'] },
  { id: '14', mode: 'metro', c: 'red', name: 'Tunnelbana 14', desc: 'Mörby centrum – Fruängen',
    path: ['mbc', 'dds', 'ber', 'uni', 'tek', 'sta', 'omt', ...RED_C, ['lil', 1474, 1280], 'msk', 'tel', 'hgs', 'vtp', 'fru'] },
  { id: '17', mode: 'metro', c: 'green', name: 'Tunnelbana 17', desc: 'Åkeshov – Skarpnäck',
    path: [...GREEN_W, ...GREEN_C, 'smb', [1911, 1426], 'hmh', 'bjh', 'krt', 'bgm', 'skp'] },
  { id: '18', mode: 'metro', c: 'green', name: 'Tunnelbana 18', desc: 'Alvik – Farsta strand',
    path: [...GREEN_C, 'smb', 'bls', 'sdb', 'skk', 'tkg', 'gbg', 'hkg', 'far', ['fst', 1911, 1842]] },
  { id: '19', mode: 'metro', c: 'green', name: 'Tunnelbana 19', desc: 'Hässelby strand – Hagsätra',
    path: ['hst', 'hgg', 'jhl', 'vlb', 'rck', 'blb', 'isl', 'ang', ...GREEN_W, ...GREEN_C, ['glo', 1868, 1416],
      'egd', 'sop', 'svm', 'stb', 'bdh', 'hgd', 'rgv', 'hag'] },

  { id: '7', mode: 'light', c: 'city', name: 'Spårväg City 7', desc: 'T-Centralen – Waldemarsudde',
    path: [['tc', 1945, 1093], [1945, 1012], 'kgd7', 'nyb', 'stg', 'dgb', 'nmv', 'lgl', 'skn', 'dgs', 'bmr', [2687, 1012], ['wal', 2687, 1062]],
    extra: [[[2592, 1012], [2642, 1062], [2687, 1062]]] },
  { id: '12', mode: 'light', c: 'nockeby', name: 'Nockebybanan 12', desc: 'Alvik – Nockeby',
    path: [['alv', 1345, 1012], [1345, 1070], [1274, 1141], 'alp', 'klv', 'sml', 'alg', 'agd', 'hgt', 'olv', 'nbt', 'nby'] },
  { id: '21', mode: 'light', c: 'lidingo', name: 'Lidingöbanan 21', desc: 'Ropsten – Gåshaga brygga',
    path: [['rop', 2133, 764], 'tsv', 'bgb', 'bdl', 'lsb', 'aga', 'sks', 'ktl', 'hgb', 'brk', 'kpl', 'gsh', 'gsb'] },
  { id: '25', mode: 'light', c: 'saltsjo', name: 'Saltsjöbanan 25', desc: 'Slussen – Saltsjöbaden',
    path: [...SALT, ['igb', 2518, 1217], 'ngl', 'rgv2', 'sjb'] },
  { id: '26', mode: 'light', c: 'saltsjo', name: 'Saltsjöbanan 26', desc: 'Igelboda – Solsidan',
    path: [['igb', 2520, 1232], 'tip', 'tat', 'erb', [2660, 1373], 'sls'] },
  { id: '27', mode: 'light', c: 'roslag', name: 'Roslagsbanan 27', desc: 'Stockholms östra – Kårsta',
    path: [...RB(1876), ...RB_MID(1876), 'tib', 'ens', 'vis', [1876, 344], 'tky', 'kgl', 'bls2', 'vtn', 'orm', 'mol', 'lho', 'frs', 'eks', 'kst'] },
  { id: '28', mode: 'light', c: 'roslag', name: 'Roslagsbanan 28', desc: 'Stockholms östra – Österskär',
    path: [...RB(1890), ...RB_MID(1890), [1890, 465], 'tbc', 'gpf', 'vgh', 'hgn', 'arn', 'ryd', 'tlj', 'akr', 'akb', 'tun', 'osk'] },
  { id: '29', mode: 'light', c: 'roslag', name: 'Roslagsbanan 29', desc: 'Stockholms östra – Näsbypark',
    path: [...RB(1905), [1905, 583], 'vdv', 'ostb', 'alt', 'lah', 'nal', 'nbp'] },
  { id: '30', mode: 'light', c: 'tvar', name: 'Tvärbanan 30', desc: 'Solna station – Sickla',
    path: [['sols', 1650, 721], [1652, 750], 'snc', 'sbp', ['sbc', 1241, 750], [1218, 750], 'bbr', 'kbv', 'nul', 'jhf', [1363, 969],
      ['alv', 1363, 1012], 'avs', 'ses', [1363, 1156], 'grd', 'trk', ['lil', 1486, 1280], 'asd', 'ast', 'asf', 'vtg', 'lin',
      ['glo', 1856, 1412], ['gul', 1898, 1370], 'mtd', 'lum', 'skj', 'sku2', [2032, 1232], ['sic', 2105, 1232]] },
  { id: '31', mode: 'light', c: 'tvar', name: 'Tvärbanan 31', desc: 'Bromma flygplats – Alviks strand',
    path: ['bfp', 'bbl', [1188, 902], 'nul', 'jhf', [1363, 969], ['alv', 1363, 1012], 'avs'] },
];

/* Bytespunkter: [stationer, x1, y1, x2, y2, typ] – typ 'd' = gångavstånd */
const PILLS = [
  [['sol', 'sols'], 1624, 721, 1646, 721, 'd'],
  [['sbc', 'sby'], 1241, 727, 1241, 769],
  [['snc'], 1474, 750, 1504, 750],
  [['alv'], 1340, 1012, 1372, 1012],
  [['fri'], 1570, 1012, 1600, 1012],
  [['odp', 'sodp'], 1761, 1004, 1761, 1035],
  [['tc', 'cty'], 1884, 1093, 1954, 1093],
  [['gst'], 1904, 1156, 1934, 1156],
  [['slu'], 1904, 1217, 1935, 1217],
  [['gul'], 1896, 1369, 1914, 1376],
  [['glo'], 1853, 1410, 1871, 1418],
  [['ast'], 1607, 1401, 1623, 1417],
  [['lil'], 1465, 1280, 1495, 1280],
  [['mar', 'sod'], 1708, 1280, 1727, 1297, 'd'],
  [['sic'], 2105, 1211, 2105, 1239],
  [['igb'], 2518, 1210, 2519, 1238],
  [['rop'], 2133, 752, 2133, 805],
  [['sjc'], 1195, 1750, 1195, 1772],
  [['sjh'], 1258, 1750, 1258, 1772],
  [['fst'], 1911, 1843, 1932, 1843, 'd'],
  [['soe', 'tek'], 1868, 818, 1934, 818],
  [['unr'], 1868, 776, 1912, 776],
  [['unr', 'uni'], 1905, 776, 1926, 776, 'd'],
  [['mrb'], 1868, 693, 1912, 693],
  [['dos'], 1868, 654, 1912, 654],
  [['rnb'], 1868, 490, 1898, 490],
];

/* Ändhållplatser och större stationer: ikoner, linjebrickor, versala namn.
   ['i', x, y, typ] ikon (metro/train/plane/info) · ['b', x, y, linje] bricka · ['t', x, y, text, ankare] */
/* Manuell förskjutning av ändstationens brickor/namn (ersätter den automatiska) */
const TERM_SHIFT = { bal: [-22, -7], mst: [-25, -7], gne: [-22, 18] };
const TERMINI = {
  bal: [['i', 644, 382, 'train'], ['b', 686, 382, '43'], ['t', 718, 382, 'BÅLSTA']],
  hjs: [['i', 975, 515, 'metro'], ['b', 1014, 515, '10'], ['t', 1046, 515, 'HJULSTA']],
  akl: [['i', 1222, 514, 'metro'], ['b', 1261, 514, '11'], ['t', 1293, 514, 'AKALLA']],
  mst: [['i', 1420, 336, 'train'], ['t', 1441, 336, 'MÄRSTA', 'start', 80], ['b', 1547, 336, '41']],
  upc: [['b', 1622, 272, '40'], ['t', 1654, 272, 'UPPSALA C', 'start', 100], ['i', 1773, 272, 'train']],
  sols: [['b', 1653, 697, '30'], ['i', 1695, 697, 'train'], ['t', 1654, 723, 'SOLNA'], ['t', 1654, 744, 'STATION']],
  kst: [['b', 2622, 344, '27'], ['i', 2665, 344, 'train'], ['t', 2645, 371, 'KÅRSTA', 'middle']],
  osk: [['b', 2622, 465, '28'], ['i', 2665, 465, 'train'], ['t', 2645, 492, 'ÖSTERSKÄR', 'middle']],
  nbp: [['b', 2500, 583, '29'], ['i', 2541, 583, 'train'], ['t', 2520, 610, 'NÄSBYPARK', 'middle']],
  mbc: [['b', 1940, 617, '14'], ['i', 1981, 617, 'metro'], ['t', 1938, 644, 'MÖRBY CENTRUM']],
  rop: [['i', 2058, 764, 'train'], ['i', 2058, 795, 'metro'], ['b', 2097, 764, '21'], ['b', 2097, 795, '13'], ['t', 2149, 795, 'ROPSTEN']],
  gsb: [['b', 2687, 764, '21'], ['i', 2728, 764, 'train'], ['t', 2660, 791, 'GÅSHAGA BRYGGA', 'middle']],
  soe: [['t', 1860, 818, 'STOCKHOLMS', 'end', 124], ['t', 1860, 840, 'ÖSTRA', 'end'], ['i', 1848, 866, 'train'],
    ['b', 1889, 842, '27'], ['b', 1889, 873, '28'], ['b', 1889, 904, '29']],
  hst: [['t', 626, 986, 'HÄSSELBY STRAND'], ['i', 637, 1012, 'metro'], ['b', 680, 1012, '17'], ['b', 726, 1012, '18'], ['b', 772, 1012, '19']],
  nby: [['t', 795, 1114, 'NOCKEBY'], ['i', 810, 1141, 'train'], ['b', 849, 1141, '12']],
  alv: [['i', 1291, 985, 'train'], ['b', 1331, 985, '12'], ['t', 1375, 985, 'ALVIK']],
  avs: [['t', 1375, 1053, 'ALVIKS STRAND'], ['b', 1395, 1079, '31'], ['i', 1436, 1079, 'train']],
  bfp: [['i', 881, 818, 'plane'], ['t', 904, 818, 'BROMMA FLYGPLATS', 'start', 186], ['b', 1117, 818, '31'], ['i', 1158, 818, 'train']],
  nor: [['i', 639, 1805, 'metro'], ['b', 681, 1805, '13'], ['t', 710, 1805, 'NORSBORG']],
  fru: [['i', 1161, 1563, 'metro'], ['b', 1200, 1563, '14'], ['t', 1229, 1563, 'FRUÄNGEN']],
  sjc: [['t', 1097, 1750, 'SÖDERTÄLJE', 'end'], ['t', 1097, 1771, 'CENTRUM', 'end'], ['i', 1119, 1760, 'train'],
    ['b', 1163, 1729, '40'], ['b', 1163, 1760, '41'], ['b', 1163, 1792, '48']],
  gne: [['i', 1087, 1905, 'train'], ['b', 1132, 1905, '48'], ['t', 1160, 1905, 'GNESTA']],
  hag: [['i', 1481, 1772, 'metro'], ['b', 1524, 1772, '19'], ['t', 1553, 1772, 'HAGSÄTRA']],
  fst: [['i', 1871, 1864, 'metro'], ['b', 1912, 1864, '18'], ['t', 1934, 1893, 'FARSTA STRAND', 'end']],
  skp: [['i', 2072, 1643, 'metro'], ['b', 2113, 1643, '17'], ['t', 2145, 1643, 'SKARPNÄCK']],
  nyh: [['b', 2685, 1884, '43'], ['i', 2726, 1884, 'train'], ['t', 2705, 1911, 'NYNÄSHAMN', 'middle']],
  sjb: [['b', 2686, 1217, '25'], ['i', 2727, 1217, 'train'], ['t', 2680, 1245, 'SALTSJÖBADEN', 'middle']],
  sls: [['b', 2686, 1373, '26'], ['i', 2727, 1373, 'train'], ['t', 2700, 1401, 'SOLSIDAN', 'middle']],
  igb: [['i', 2443, 1239, 'train'], ['b', 2486, 1239, '26'], ['t', 2465, 1267, 'IGELBODA', 'middle']],
  wal: [['b', 2685, 1065, '7'], ['i', 2727, 1065, 'train'], ['t', 2665, 1093, 'WALDEMARSUDDE', 'middle']],
  slu: [['b', 1877, 1217, '25'], ['t', 1940, 1195, 'SLUSSEN'], ['i', 1951, 1242, 'train']],
  sic: [['b', 2138, 1241, '30'], ['i', 2178, 1241, 'train'], ['t', 2120, 1268, 'SICKLA']],
  tc: [['t', 1956, 1118, 'T-CENTRALEN'], ['b', 1975, 1068, '7'], ['i', 2015, 1068, 'train']],
  cty: [['t', 1885, 1118, 'STOCKHOLM CITY', 'end'], ['i', 1870, 1068, 'info']],
  kgdt: [['b', 2098, 1093, '10'], ['b', 2145, 1093, '11'], ['i', 2186, 1093, 'metro'], ['t', 2208, 1093, 'KUNGSTRÄDGÅRDEN']],
};
