// 경유지 찾기 전체 흐름 — ver.01
import { parseRoute, trafficBar, samplePoints, distToRoute, estDetourSec, netSaving, haversine, fmtMin, BRANDS } from './core.js';

const K = 6; // 길찾기로 실제 검증할 후보 수

export async function findStops({ api, katec, from, to, what, allowedMin, fuel, kmpl, liters, onStep = () => {} }) {
  // 1) 기본 경로
  onStep('경로 확인 중');
  const base = parseRoute(await api.directions([from.lng, from.lat], [to.lng, to.lat]));
  if (!base.ok) throw new Error('기본 경로를 찾지 못했습니다. ' + base.msg);
  const bar = trafficBar(base);
  const samples = samplePoints(base.pts, base.distance);
  const isGas = what === '주유소';

  // 2) 후보 모으기
  onStep(isGas ? '주변 주유소 가격 조회 중' : '주변 장소 검색 중');
  const found = new Map();
  for (const s of samples) {
    if (isGas) {
      const [kx, ky] = katec.toKatec(s[0], s[1]);
      const list = await api.opinet([kx, ky], fuel, 5000);
      for (const o of list) {
        const id = o.UNI_ID; if (!id || found.has(id)) continue;
        const [lng, lat] = katec.fromKatec(+o.GIS_X_COOR, +o.GIS_Y_COOR);
        found.set(id, { id, name: o.OS_NM, price: +o.PRICE, brand: BRANDS[o.POLL_DIV_CD || o.POLL_DIV_CO] || '', lng, lat });
      }
    } else {
      const docs = await api.keyword(what, { x: s[0], y: s[1], radius: 5000, size: 15, sort: 'distance' });
      for (const d of docs) {
        if (found.has(d.id)) continue;
        found.set(d.id, { id: d.id, name: d.place_name, addr: d.road_address_name || d.address_name || '', lng: +d.x, lat: +d.y });
      }
    }
  }
  const all = [...found.values()].filter(c => c.price == null || c.price > 0);
  if (!all.length) return { base, bar, items: [], hiddenItems: [], checked: 0, avg: null };

  // 3) 추정 우회 시간으로 1차 선별
  const limit = allowedMin * 60 * 1.5;
  for (const c of all) { c.offM = distToRoute([c.lng, c.lat], base.pts); c.est = estDetourSec(c.offM); }
  const pool = all.filter(c => c.est <= limit);
  const avg = isGas ? Math.round(all.reduce((a, c) => a + c.price, 0) / all.length) : null;
  if (isGas) pool.sort((a, b) => a.price - b.price); else pool.sort((a, b) => a.est - b.est);
  const top = pool.slice(0, K);

  // 4) 상위 후보만 실제 경유 경로로 검증
  const items = [];
  const hiddenItems = []; let i = 0;
  for (const c of top) {
    onStep('우회 시간 확인 중 (' + (++i) + '/' + top.length + ')');
    const via = parseRoute(await api.directions([from.lng, from.lat], [to.lng, to.lat], [[c.lng, c.lat]]));
    if (!via.ok) continue;
    const extraSec = via.duration - base.duration, extraM = via.distance - base.distance;
    const extraMin = Math.max(0, fmtMin(extraSec));
    if (extraMin > allowedMin) continue;
    const it = { ...c, extraMin, extraM: Math.max(0, extraM), offKm: c.offM / 1000 };
    if (isGas) {
      it.diff = avg - c.price;
      it.net = netSaving({ price: c.price, avg, liters, extraM: it.extraM, kmpl });
      if (it.net <= 0) { hiddenItems.push(it); continue; }
    }
    items.push(it);
  }
  if (isGas) items.sort((a, b) => b.net - a.net); else items.sort((a, b) => a.extraMin - b.extraMin || a.offKm - b.offKm);
  return { base, bar, items, hiddenItems, checked: top.length, avg };
}
