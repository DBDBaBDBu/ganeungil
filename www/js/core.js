// 순수 계산 로직 (네트워크·화면과 무관) — ver.01
export const KATEC_DEF = '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs';

export function makeKatec(proj4) {
  const wgs = 'EPSG:4326';
  return {
    toKatec: (lng, lat) => proj4(wgs, KATEC_DEF, [lng, lat]),
    fromKatec: (x, y) => proj4(KATEC_DEF, wgs, [x, y]),
  };
}

export function haversine(a, b) { // a,b = [lng,lat] → meters
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 카카오 traffic_state → ok / slow / jam
export function trafficClass(state) {
  if (state === 1 || state === 2 || state === 6) return 'jam';
  if (state === 3) return 'slow';
  return 'ok';
}

// Directions 응답 1개 → 정리된 경로
export function parseRoute(json) {
  const r = json && json.routes && json.routes[0];
  if (!r) return { ok: false, code: -1, msg: '경로 응답이 비어 있습니다.' };
  if (r.result_code !== 0) return { ok: false, code: r.result_code, msg: r.result_msg || '경로를 찾지 못했습니다.' };
  const pts = [], segs = [];
  for (const sec of r.sections || []) {
    for (const road of sec.roads || []) {
      const v = road.vertexes || [];
      const start = pts.length;
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      segs.push({ cls: trafficClass(road.traffic_state), dist: road.distance || 0, from: start, to: pts.length });
    }
  }
  return { ok: true, distance: r.summary.distance, duration: r.summary.duration, pts, segs };
}

// 혼잡도 막대용: 같은 등급 연속 구간을 합쳐 거리 비율로
export function trafficBar(route) {
  const out = [];
  for (const s of route.segs) {
    const last = out[out.length - 1];
    if (last && last.cls === s.cls) last.dist += s.dist; else out.push({ cls: s.cls, dist: s.dist });
  }
  const total = out.reduce((a, b) => a + b.dist, 0) || 1;
  const jams = out.filter(o => o.cls === 'jam').length;
  return { bars: out.map(o => ({ cls: o.cls, flex: Math.max(o.dist / total, 0.02) })), jams };
}

// 경로 위 표본점: 경로를 n등분한 각 구간의 중간점
export function samplePoints(pts, totalM, { spacing = 8000, max = 5 } = {}) {
  if (!pts.length) return [];
  const n = Math.max(1, Math.min(max, Math.ceil(totalM / spacing)));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1] || 1;
  const res = [];
  for (let k = 0; k < n; k++) {
    const target = L * (k + 0.5) / n;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[i - 1]) / seg));
    res.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  return res;
}

// 점에서 경로까지 대략 최단거리(m) — 꼭짓점 기준
export function distToRoute(p, pts) {
  let best = Infinity;
  for (const q of pts) { const d = haversine(p, q); if (d < best) best = d; }
  return best;
}

export function estDetourSec(distM) { return (2 * distM * 1.3) / (50000 / 3600); }

export function netSaving({ price, avg, liters, extraM, kmpl }) {
  const gross = (avg - price) * liters;
  const fuelCost = (extraM / 1000 / kmpl) * price;
  return Math.round(gross - fuelCost);
}

export const FUELS = { B027: '휘발유', D047: '경유', K015: 'LPG' };
export const BRANDS = { SKE: 'SK에너지', GSC: 'GS칼텍스', HDO: '현대오일뱅크', SOL: 'S-OIL', RTE: '자영알뜰', RTX: '고속도로알뜰', NHO: '농협알뜰', ETC: '자가상표', E1G: 'E1', SKG: 'SK가스' };

export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 하루 호출 횟수 (store 인터페이스: get(key)/set(key,val))
export const CAPS = { dir: 250, local: 400, opinet: 250 };
export async function useQuota(store, name, n = 1) {
  const k = 'quota';
  const q = (await store.get(k)) || {};
  if (q.day !== today()) { q.day = today(); q.dir = 0; q.local = 0; q.opinet = 0; }
  if ((q[name] || 0) + n > CAPS[name]) { await store.set(k, q); const e = new Error('오늘 사용 한도에 도달했습니다. (' + name + ')'); e.code = 'QUOTA'; throw e; }
  q[name] = (q[name] || 0) + n;
  await store.set(k, q);
}
export async function quotaView(store) {
  const q = (await store.get('quota')) || {};
  const fresh = q.day === today();
  return { dir: fresh ? q.dir || 0 : 0, local: fresh ? q.local || 0 : 0, opinet: fresh ? q.opinet || 0 : 0 };
}

export function kakaoRouteUrl({ sp, vp, ep, by = 'car' }) {
  const f = p => p[1].toFixed(6) + ',' + p[0].toFixed(6); // [lng,lat] → "lat,lng"
  let u = 'kakaomap://route?';
  if (sp) u += 'sp=' + f(sp) + '&';
  if (vp) u += 'vp=' + f(vp) + '&';
  return u + 'ep=' + f(ep) + '&by=' + by;
}
export const fmtMin = s => Math.round(s / 60);
export const won = n => Number(n).toLocaleString('ko-KR');
