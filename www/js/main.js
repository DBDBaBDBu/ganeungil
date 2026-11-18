// 화면 구성과 흐름 — ver.02
import { makeKatec, FUELS, quotaView, CAPS, kakaoRouteUrl, parseRoute, won, sortItems } from './core.js';
import { makeApi } from './api.js';
import { findStops } from './search.js';
import { store, loadSettings, saveSettings, pushRecent } from './store.js';
import { currentPosition, openExternal } from './native.js';

export const VERSION = 'ver.03';
const katec = makeKatec(window.proj4);
const api = makeApi({ store, getKeys: async () => { const s = await loadSettings(); return { kakao: s.kakao.trim(), opinet: s.opinet.trim() }; } });
const $app = document.getElementById('app');
const state = { result: null, ctx: null, form: null, hiddenOpen: false, overOpen: false, sort: 'net', field: 'to' };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON_BACK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_GEAR = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICON_NAV = '<svg width="16" height="16" viewBox="0 0 24 24" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l8 18-8-4-8 4z"/></svg>';
const ICON_SEARCH = c => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;

let toastT;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3400); }
function loading(msg) {
  let el = document.getElementById('loading');
  if (msg === false) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'loading'; el.className = 'loading'; el.innerHTML = '<div class="spin"></div><div id="lmsg"></div>'; document.body.appendChild(el); }
  document.getElementById('lmsg').textContent = msg;
}
const findSaved = (s, name) => (s.places || []).find(p => p.name === String(name).trim());

/* ---------- 첫 화면 ---------- */
async function viewMain() {
  const s = await loadSettings();
  const f = state.form || { what: '주유소', allowed: s.allowed, fuel: s.fuel, from: s.from, to: s.to, road: s.road || 'free' };
  state.form = f;
  const chips = ['주유소', ...s.recents].slice(0, 5);
  const places = s.places || [];
  $app.innerHTML = `
  <div class="top head"><h1 style="line-height:0"><img class="logo" src="img/logo.png" alt="가는길"></h1>
  <p class="tag">가는길에 들를 수 있는 곳을<br>빠르게 안내합니다</p>
  <button class="gear" id="gear" aria-label="설정">${ICON_GEAR}</button></div>
  <div class="card" style="padding:4px 16px 0">
    <div class="row"><span class="dot" style="border-radius:6px;background:#000"></span><label for="from">출발</label><input id="from" type="text" value="${esc(f.from)}"></div>
    <div class="row"><span class="dot" style="border-radius:2px;background:#000"></span><label for="to">도착</label><input id="to" type="text" value="${esc(f.to)}" placeholder="예: 판교역"></div>
    ${places.length ? `<div class="pl"><small>자주 가는 곳 · 누르면 ${state.field === 'from' ? '출발지' : '도착지'}에 입력됩니다</small>${places.map(p => `<button type="button" data-p="${esc(p.name)}" class="${p.name === f.to || p.name === f.from ? 'sel' : ''}">${esc(p.name)}</button>`).join('')}</div>` : ''}
  </div>
  <div style="display:flex;flex-direction:column;gap:8px">
    <label class="lbl" for="what">경유할 곳</label>
    <div class="field">${ICON_SEARCH('#525252')}<input id="what" type="text" value="${esc(f.what)}" placeholder="예: 맥도날드, 치킨집, 카페"></div>
    <div class="hint">주유소 고정 · 최근 검색 4개</div>
    <div class="chips" id="chips">${chips.map(c => `<button type="button" data-c="${esc(c)}" class="${c === f.what ? 'on' : ''}"><span>${esc(c)}</span></button>`).join('')}</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px"><div class="lbl">허용 우회 시간</div>
    <div class="seg" id="allowed">${[3, 5, 10].map(n => `<button type="button" data-v="${n}" class="${n === f.allowed ? 'on' : ''}">${n}분</button>`).join('')}</div></div>
  <div style="display:flex;flex-direction:column;gap:8px"><div class="lbl">유종 <small>(주유소 선택 시)</small></div>
    <div class="seg" id="fuel">${Object.entries(FUELS).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === f.fuel ? 'on' : ''}">${v}</button>`).join('')}</div></div>
  <div style="display:flex;flex-direction:column;gap:8px"><div class="lbl">도로</div>
    <div class="seg" id="road" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[['free', '무료도로'], ['toll', '유료도로']].map(([k, n]) => `<button type="button" data-v="${k}" class="${k === f.road ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="hint">${f.road === 'free' ? '유료도로를 뺀 경로로 계산합니다.' : '유료도로를 포함한 추천 경로로 계산합니다.'}</div></div>
  <div class="spacer"></div>
  <button class="primary" id="go">${ICON_SEARCH('#fff')}경유지 찾기</button>`;

  const sync = () => { f.from = $app.querySelector('#from').value; f.to = $app.querySelector('#to').value; f.what = $app.querySelector('#what').value.trim(); };
  $app.querySelector('#from').addEventListener('focus', () => { state.field = 'from'; });
  $app.querySelector('#to').addEventListener('focus', () => { state.field = 'to'; });
  $app.querySelector('#gear').onclick = () => { sync(); location.hash = '#/settings'; };
  const pl = $app.querySelector('.pl');
  if (pl) pl.onclick = e => { const b = e.target.closest('button'); if (!b) return; sync(); f[state.field] = b.dataset.p; viewMain(); };
  $app.querySelector('#chips').onclick = e => { const b = e.target.closest('button'); if (!b) return; sync(); f.what = b.dataset.c; viewMain(); };
  $app.querySelector('#allowed').onclick = e => { const b = e.target.closest('button'); if (!b) return; sync(); f.allowed = +b.dataset.v; viewMain(); };
  $app.querySelector('#fuel').onclick = e => { const b = e.target.closest('button'); if (!b) return; sync(); f.fuel = b.dataset.v; viewMain(); };
  $app.querySelector('#road').onclick = e => { const b = e.target.closest('button'); if (!b) return; sync(); f.road = b.dataset.v; viewMain(); };
  $app.querySelector('#go').onclick = () => { sync(); run(f); };
}

async function resolvePlace(text, s, near) {
  const p = findSaved(s, text);
  if (p) return { name: p.name, lng: p.lng, lat: p.lat };
  return api.geocode(text.trim(), near);
}

async function run(f) {
  if (!f.to) return toast('도착지를 입력해 주세요.');
  if (!f.what) return toast('경유할 곳을 입력해 주세요.');
  const s = await loadSettings();
  if (!s.kakao || (f.what === '주유소' && !s.opinet)) { toast('먼저 설정에서 키를 입력해 주세요.'); location.hash = '#/settings'; return; }
  loading('출발지 확인 중');
  try {
    const here = (!f.from || f.from === '현재 위치');
    const fromPos = here ? { ...(await currentPosition()), name: '현재 위치', here: true } : await resolvePlace(f.from, s);
    loading('도착지 확인 중');
    const toPos = await resolvePlace(f.to, s, [fromPos.lng, fromPos.lat]);
    const r = await findStops({ api, katec, from: fromPos, to: toPos, what: f.what, allowedMin: f.allowed, fuel: f.fuel, kmpl: +s.kmpl || 19, liters: +s.liters || 100, avoidToll: f.road === 'free', onStep: loading });
    await saveSettings({ allowed: f.allowed, fuel: f.fuel, road: f.road, from: f.from || '현재 위치', to: f.to, recents: pushRecent(s.recents, f.what) });
    state.result = r; state.hiddenOpen = false; state.overOpen = false; state.sort = f.what === '주유소' ? 'net' : 'time';
    state.ctx = { from: fromPos, to: toPos, what: f.what, allowed: f.allowed, fuel: f.fuel, liters: +s.liters || 100, road: f.road };
    loading(false);
    location.hash = f.what === '주유소' ? '#/gas' : '#/place';
  } catch (e) {
    loading(false);
    toast(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
  }
}

function guide(item) {
  const c = state.ctx;
  const url = kakaoRouteUrl({ sp: c.from.here ? null : [c.from.lng, c.from.lat], vp: [item.lng, item.lat], ep: [c.to.lng, c.to.lat] });
  openExternal(url).then(ok => { if (!ok) toast('카카오맵 앱을 열지 못했습니다. 설치되어 있는지 확인해 주세요.'); });
}

function topBar(sub) {
  const c = state.ctx;
  return `<div class="top"><button class="back" id="back" aria-label="뒤로">${ICON_BACK}</button><div class="t"><h1>${esc(c.from.name)} → ${esc(c.to.name)}</h1><p>${sub}</p></div></div>`;
}
function trafficCard() {
  const { bar, base, freeFallback } = state.result;
  return `${freeFallback ? '<div class="note" style="padding:10px 14px"><span>무료로만 가는 경로가 없어 유료도로를 포함해 계산했습니다.</span></div>' : ''}<div class="card" style="padding:12px 16px;display:flex;flex-direction:column;gap:8px">
    <div class="between"><span class="lbl">경로 혼잡도</span><span class="hint">${bar.jams ? '정체 구간 ' + bar.jams + '곳' : '정체 구간 없음'} · ${Math.round(base.duration / 60)}분 · ${(base.distance / 1000).toFixed(1)}km</span></div>
    <div class="bar" role="img" aria-label="경로 혼잡도">${bar.bars.map(b => `<div class="${b.cls}" style="flex:${b.flex}"></div>`).join('')}</div>
    <div class="legend"><span><i class="ok"></i>원활</span><span><i class="slow"></i>서행</span><span><i class="jam"></i>정체</span></div></div>`;
}
const bindBack = () => { const b = $app.querySelector('#back'); if (b) b.onclick = () => history.back(); };
const bindGo = list => $app.querySelectorAll('[data-i]').forEach(b => b.onclick = () => guide(list[+b.dataset.i]));
const roadLabel = (c, r) => c.road === 'free' && !r.freeFallback ? '무료도로' : '유료도로 포함';
const km = m => '+' + (m / 1000).toFixed(1) + 'km';
function sortBar(opts) {
  return `<div class="sortrow" style="grid-template-columns:repeat(${opts.length},minmax(0,1fr))" id="sorts">${opts.map(([k, n]) => `<button type="button" data-k="${k}" class="${state.sort === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
}
function bindSort(rerender) { const el = $app.querySelector('#sorts'); if (el) el.onclick = e => { const b = e.target.closest('button'); if (!b) return; state.sort = b.dataset.k; rerender(); }; }

/* ---------- 주유소 결과 ---------- */
function gasCard(it, i, bestId) {
  const best = it.id === bestId && !it.over;
  return `<div class="res c2 ${best ? 'best' : ''} ${it.over ? 'over' : ''}"><div class="hd"><div class="l">
    <div class="name">${best ? '<span class="badge">추천</span>' : ''}<span>${esc(it.name)}</span></div>
    <div class="m">${it.brand ? esc(it.brand) + ' · ' : ''}경로에서 ${it.offKm.toFixed(1)}km</div></div>
    <div class="price">${won(it.price)}<small>원/L</small></div></div>
    <div class="bt"><div class="stat"><div class="${it.over ? 'o' : ''}"><b>+${it.extraMin}분</b>${it.over ? '허용 초과' : '추가 시간'}</div><div><b>${km(it.extraM)}</b>추가 거리</div><div class="g"><b>${won(it.net)}원</b>절약 (${state.ctx.liters}L 기준)</div></div>
    <button class="go" data-i="${i}" aria-label="${esc(it.name)} 길안내">${ICON_NAV}길안내</button></div></div>`;
}
function viewGas() {
  if (!state.result) return (location.hash = '#/');
  const r = state.result, c = state.ctx;
  const main = sortItems(state.hiddenOpen ? [...r.items, ...r.hiddenItems] : r.items, state.sort);
  const over = state.overOpen ? sortItems(r.over, state.sort) : [];
  const list = [...main, ...over];
  const bestId = r.items.length ? sortItems(r.items, 'net')[0].id : null;
  $app.innerHTML = topBar(`현재 ${Math.round(r.base.duration / 60)}분 · ${FUELS[c.fuel]} · 우회 ${c.allowed}분 이내 · ${roadLabel(c, r)}`) + trafficCard() +
    `<div class="between"><h2 style="font-size:15px;font-weight:700">경유 가능 ${r.items.length}곳</h2><span class="hint">주변 평균 ${r.avg ? won(r.avg) : '-'}원/L</span></div>` +
    (r.items.length ? sortBar([['net', '절약액순'], ['price', '가격순'], ['time', '시간순']]) : '') +
    (list.length ? `<div class="cards">${list.map((it, i) => gasCard(it, i, bestId)).join('')}</div>` :
      `<div class="empty">조건에 맞는 주유소가 없습니다.<br>허용 우회 시간을 늘려 보세요.</div>`) +
    (r.over.length && !state.overOpen ? `<button type="button" class="fold" id="fold"><span>허용 시간을 넘지만 더 싼 곳 ${r.over.length}곳</span><span>펼치기 ⌄</span></button>` : '') +
    (r.hiddenItems.length && !state.hiddenOpen ? `<div class="note"><span>우회 비용이 절약액보다 큰 ${r.hiddenItems.length}곳은 숨겼습니다.</span><button id="show">보기</button></div>` : '') +
    `<p class="foot">길안내를 누르면 선택한 곳이 경유지로 들어간 상태로 카카오맵 앱이 열립니다. 가격은 오피넷 기준이라 현장과 다를 수 있습니다. 절약 = 주변 평균가 대비 ${c.liters}L 기준, 우회 연료비 반영.</p>`;
  bindBack(); bindGo(list); bindSort(viewGas);
  const sh = $app.querySelector('#show'); if (sh) sh.onclick = () => { state.hiddenOpen = true; viewGas(); };
  const fo = $app.querySelector('#fold'); if (fo) fo.onclick = () => { state.overOpen = true; viewGas(); };
}

/* ---------- 일반 장소 결과 ---------- */
function viewPlace() {
  if (!state.result) return (location.hash = '#/');
  const r = state.result, c = state.ctx;
  const main = sortItems(r.items, state.sort === 'dist' ? 'dist' : 'time');
  const over = state.overOpen ? sortItems(r.over, state.sort === 'dist' ? 'dist' : 'time') : [];
  const list = [...main, ...over];
  const bestId = r.items.length ? sortItems(r.items, 'time')[0].id : null;
  $app.innerHTML = topBar(`현재 ${Math.round(r.base.duration / 60)}분 · 우회 ${c.allowed}분 이내 · ${roadLabel(c, r)}`) + trafficCard() +
    `<div class="between"><h2 style="font-size:15px;font-weight:700">"${esc(c.what)}" 경유 가능 ${r.items.length}곳</h2></div>` +
    (r.items.length ? sortBar([['time', '시간순'], ['dist', '추가 거리순']]) : '') +
    (list.length ? `<div class="cards">${list.map((it, i) => `<div class="res c2 ${it.id === bestId && !it.over ? 'best' : ''} ${it.over ? 'over' : ''}"><div class="hd"><div class="l">
      <div class="name">${it.id === bestId && !it.over ? '<span class="badge">가장 가까움</span>' : ''}<span>${esc(it.name)}</span></div>
      <div class="m">${esc(it.addr)}</div></div></div>
      <div class="bt"><div class="stat"><div class="${it.over ? 'o' : ''}"><b>+${it.extraMin}분</b>${it.over ? '허용 초과' : '추가 시간'}</div><div><b>${km(it.extraM)}</b>추가 거리</div><div><b>${it.offKm.toFixed(1)}km</b>경로에서</div></div>
      <button class="go" data-i="${i}" aria-label="${esc(it.name)} 길안내">${ICON_NAV}길안내</button></div></div>`).join('')}</div>` :
      `<div class="empty">조건에 맞는 곳이 없습니다.<br>허용 우회 시간을 늘리거나 다른 검색어를 써 보세요.</div>`) +
    (r.over.length && !state.overOpen ? `<button type="button" class="fold" id="fold"><span>허용 시간을 넘지만 가까운 곳 ${r.over.length}곳</span><span>펼치기 ⌄</span></button>` : '') +
    `<p class="foot">길안내를 누르면 선택한 곳이 경유지로 들어간 상태로 카카오맵 앱이 열립니다.</p>`;
  bindBack(); bindGo(list); bindSort(viewPlace);
  const fo = $app.querySelector('#fold'); if (fo) fo.onclick = () => { state.overOpen = true; viewPlace(); };
}

/* ---------- 설정 ---------- */
async function viewSettings() {
  const s = await loadSettings(), q = await quotaView(store);
  $app.innerHTML = `<div class="top"><button class="back" id="back" aria-label="뒤로">${ICON_BACK}</button><div class="t"><h1>설정</h1><p>키와 저장한 장소는 이 휴대폰 안에만 저장됩니다.</p></div></div>
  <div class="set" style="display:flex;flex-direction:column;gap:14px">
    <button type="button" class="nav" id="goplaces">자주 가는 곳<span>${(s.places || []).length}곳 <i>›</i></span></button>
    <div><label class="k" for="kakao">카카오 REST API 키</label><input id="kakao" type="password" autocomplete="off" value="${esc(s.kakao)}"></div>
    <div><label class="k" for="opinet">오피넷 API 키</label><input id="opinet" type="password" autocomplete="off" value="${esc(s.opinet)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label class="k" for="kmpl">연비 (km/L)</label><input id="kmpl" type="number" inputmode="decimal" value="${esc(s.kmpl)}"></div>
      <div><label class="k" for="liters">주유량 (L)</label><input id="liters" type="number" inputmode="decimal" value="${esc(s.liters)}"></div></div>
    <button class="primary" id="save">저장</button>
    <button class="ghost" id="t1">연결 시험</button>
    <div class="test" id="tres"></div>
    <button class="ghost" id="t2">길안내 시험 (카카오맵 열기)</button>
    <p class="hint">서울시청 → 남산 경유 → 강남역 경로로 카카오맵이 열립니다. 경유지(남산)가 표시되는지 확인해 주세요.</p>
    <div class="use">오늘 사용량 · 길찾기 ${q.dir}/${CAPS.dir} · 장소검색 ${q.local}/${CAPS.local} · 오피넷 ${q.opinet}/${CAPS.opinet}<br>가는길 ${VERSION}</div>
  </div>`;
  bindBack();
  $app.querySelector('#goplaces').onclick = () => { location.hash = '#/places'; };
  const read = () => ({ kakao: $app.querySelector('#kakao').value.trim(), opinet: $app.querySelector('#opinet').value.trim(), kmpl: +$app.querySelector('#kmpl').value || 19, liters: +$app.querySelector('#liters').value || 100 });
  $app.querySelector('#save').onclick = async () => { await saveSettings(read()); toast('저장했습니다.'); };
  $app.querySelector('#t1').onclick = async () => {
    await saveSettings(read());
    const out = $app.querySelector('#tres'); out.innerHTML = '';
    const line = (name, ok, msg) => { out.insertAdjacentHTML('beforeend', `<div><b class="${ok ? 'ok' : 'no'}">${ok ? '성공' : '실패'}</b><span>${esc(name)}${msg ? ' · ' + esc(msg) : ''}</span></div>`); };
    const tests = [
      ['카카오 장소검색', async () => { const d = await api.keyword('시청', { x: 126.978, y: 37.5665, size: 1 }); if (!d.length) throw new Error('결과 없음'); return d[0].place_name; }],
      ['카카오 길찾기', async () => { const r = parseRoute(await api.directions([126.978, 37.5665], [127.0276, 37.4979])); if (!r.ok) throw new Error(r.msg); return Math.round(r.duration / 60) + '분'; }],
      ['오피넷 유가', async () => { const [x, y] = katec.toKatec(126.978, 37.5665); const l = await api.opinet([x, y], 'B027', 3000); if (!l.length) throw new Error('결과 없음 (키 확인)'); return l.length + '곳 조회'; }],
    ];
    for (const [name, fn] of tests) { try { line(name, true, await fn()); } catch (e) { line(name, false, e.message); } }
  };
  $app.querySelector('#t2').onclick = () => {
    const url = kakaoRouteUrl({ sp: [126.978, 37.5665], vp: [126.9886, 37.5512], ep: [127.0276, 37.4979] });
    openExternal(url).then(ok => { if (!ok) toast('카카오맵 앱을 열지 못했습니다.'); });
  };
}

/* ---------- 자주 가는 곳 ---------- */
async function viewPlaces() {
  const s = await loadSettings(); const places = s.places || [];
  $app.innerHTML = `<div class="top"><button class="back" id="back" aria-label="뒤로">${ICON_BACK}</button><div class="t"><h1>자주 가는 곳</h1><p>첫 화면에서 누르면 도착지에 입력됩니다.</p></div></div>
  <div class="set" style="display:flex;flex-direction:column;gap:12px">
    ${places.length ? places.map((p, i) => `<div class="pcard"><div class="h"><b>${esc(p.name)}</b><button type="button" data-d="${i}">삭제</button></div><div class="ad">${esc(p.address)} <span class="ok2">· 위치 확인됨</span></div></div>`).join('') : '<div class="empty">저장한 장소가 없습니다.<br>아래에서 추가해 보세요.</div>'}
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px;border-style:dashed">
      <div><label class="k" for="pname">장소 (이름)</label><input id="pname" type="text" placeholder="예: 헬스장" maxlength="12"></div>
      <div><label class="k" for="paddr">주소</label><input id="paddr" type="text" placeholder="예: 서울 ○○구 ○○로 00"></div>
      <button class="primary" id="padd" style="height:48px;font-size:15px;border-radius:12px">장소 추가</button>
      <div class="hint">추가할 때 주소 위치를 한 번 확인해 저장합니다.</div></div>
  </div>`;
  bindBack();
  $app.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { const next = places.filter((_, i) => i !== +b.dataset.d); await saveSettings({ places: next }); viewPlaces(); });
  $app.querySelector('#padd').onclick = async () => {
    const name = $app.querySelector('#pname').value.trim(), address = $app.querySelector('#paddr').value.trim();
    if (!name || !address) return toast('장소 이름과 주소를 모두 입력해 주세요.');
    if (name === '현재 위치' || name === '주유소') return toast('사용할 수 없는 이름입니다.');
    if (places.filter(p => p.name !== name).length >= 12) return toast('최대 12곳까지 저장할 수 있습니다.');
    if (!s.kakao) return toast('먼저 설정에서 카카오 키를 입력해 주세요.');
    loading('주소 확인 중');
    try {
      const g = await api.geocodeAddress(address);
      await saveSettings({ places: [...places.filter(p => p.name !== name), { name, address, lng: g.lng, lat: g.lat }] });
      loading(false); toast('저장했습니다.'); viewPlaces();
    } catch (e) { loading(false); toast(e.message || '주소를 확인하지 못했습니다.'); }
  };
}

/* ---------- 라우터 ---------- */
async function route() {
  window.scrollTo(0, 0);
  const h = location.hash || '#/';
  if (h === '#/gas') viewGas();
  else if (h === '#/place') viewPlace();
  else if (h === '#/settings') await viewSettings();
  else if (h === '#/places') await viewPlaces();
  else await viewMain();
}
window.addEventListener('hashchange', route);
route();
setTimeout(() => document.getElementById('splash').classList.add('off'), 1100);
window.__app = { api, katec, state };
