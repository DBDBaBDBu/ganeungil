// 경유지 찾기 전체 흐름 — ver.02
import { parseRoute, trafficBar, samplePoints, distToRoute, estDetourSec, netSaving, fmtMin, BRANDS, sortItems } from './core.js';

const K_PRICE = 6, K_NEAR = 4, MAX_SHOW = 4, OVER_EXTRA = 5, OVER_MAX = 2;

export async function findStops({ api, katec, from, to, what, allowedMin, fuel, kmpl, liters, onStep = () => {} }) {
  onStep('경로 확인 중');
  const base = parseRoute(await api.directions([from.lng, from.lat], [to.lng, to.lat]));
  if (!base.ok) throw new Error('기본 경로를 찾지 못했습니다. ' + base.msg);
  const bar = trafficBar(base);
  const samples = samplePoints(base.pts, base.distance);
  const isGas = what === '주유소';

  onStep(isGas ? '주변 주유소 가격 조회 중' : '주변 장소 검색 중');
  const found = new Map();
  for (const s of samples) {
    if (isGas) {
      const [kx, ky] = katec.toKatec(s[0], s[1]);
      for (const o of await api.opinet([kx, ky], fuel, 5000)) {
        const id = o.UNI_ID; if (!id || found.has(id)) continue;
        const [lng, lat] = katec.fromKatec(+o.GIS_X_COOR, +o.GIS_Y_COOR);
        found.set(id, { id, name: o.OS_NM, price: +o.PRICE, brand: BRANDS[o.POLL_DIV_CD || o.POLL_DIV_CO] || '', lng, lat });
      }
    } else {
      for (const d of await api.keyword(what, { x: s[0], y: s[1], radius: 5000, size: 15, sort: 'distance' })) {
        if (found.has(d.id)) continue;
        found.set(d.id, { id: d.id, name: d.place_name, addr: d.road_address_name || d.address_name || '', lng: +d.x, lat: +d.y });
      }
    }
  }
  const all = [...found.values()].filter(c => c.price == null || c.price > 0);
  const empty = { base, bar, items: [], over: [], hiddenItems: [], checked: 0, avg: null };
  if (!all.length) return empty;

  const limit = (allowedMin + 3) * 60 * 1.5;
  for (const c of all) { c.offM = distToRoute([c.lng, c.lat], base.pts); c.est = estDetourSec(c.offM); }
  const pool = all.filter(c => c.est <= limit);
  const avg = isGas ? Math.round(all.reduce((a, c) => a + c.price, 0) / all.length) : null;

  // 검증 후보: 주유소는 '싼 곳 6 + 가까운 곳 4', 일반 장소는 '가까운 곳 10'
  const near = [...pool].sort((a, b) => a.est - b.est);
  let top;
  if (isGas) {
    const cheap = [...pool].sort((a, b) => a.price - b.price).slice(0, K_PRICE);
    const seen = new Set(cheap.map(c => c.id));
    top = cheap.concat(near.filter(c => !seen.has(c.id)).slice(0, K_NEAR));
  } else top = near.slice(0, K_PRICE + K_NEAR);

  const pass = [], over = [], hiddenItems = [];
  let i = 0;
  for (const c of top) {
    onStep('우회 시간 확인 중 (' + (++i) + '/' + top.length + ')');
    const via = parseRoute(await api.directions([from.lng, from.lat], [to.lng, to.lat], [[c.lng, c.lat]]));
    if (!via.ok) continue;
    const extraMin = Math.max(0, fmtMin(via.duration - base.duration));
    const extraM = Math.max(0, via.distance - base.distance);
    const it = { ...c, extraMin, extraM, offKm: c.offM / 1000 };
    if (isGas) { it.diff = avg - c.price; it.net = netSaving({ price: c.price, avg, liters, extraM, kmpl }); }
    if (extraMin <= allowedMin) { (isGas && it.net <= 0 ? hiddenItems : pass).push(it); }
    else if (extraMin <= allowedMin + OVER_EXTRA && (!isGas || it.net > 0)) over.push({ ...it, over: true });
  }
  const items = sortItems(pass, isGas ? 'net' : 'time').slice(0, MAX_SHOW);
  const overShown = items.length < 3 ? sortItems(over, isGas ? 'net' : 'time').slice(0, OVER_MAX) : [];
  return { base, bar, items, over: overShown, hiddenItems, checked: top.length, avg };
}
