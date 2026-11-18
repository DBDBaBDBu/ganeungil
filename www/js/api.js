// 외부 서비스 호출 (카카오 길찾기·로컬, 오피넷) — ver.01
import { useQuota } from './core.js';

export class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

async function getJson(url, headers, label) {
  let res;
  try { res = await fetch(url, { headers }); }
  catch (e) { throw new ApiError(label + ' 연결에 실패했습니다. 인터넷 연결을 확인해 주세요.', 'NET'); }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  if (!res.ok) {
    let hint = '';
    if (res.status === 401) hint = ' (키가 올바르지 않습니다)';
    if (res.status === 403) hint = ' (해당 서비스가 이 키의 앱에서 켜져 있지 않거나 권한이 없습니다)';
    if (res.status === 429) hint = ' (호출 한도 초과)';
    throw new ApiError(label + ' 오류 ' + res.status + hint + (json && (json.msg || json.message) ? ' · ' + (json.msg || json.message) : ''), 'HTTP' + res.status);
  }
  if (json === null) throw new ApiError(label + ' 응답을 읽지 못했습니다.', 'PARSE');
  return json;
}

const kakaoHead = key => ({ Authorization: 'KakaoAK ' + key });
const pt = p => p[0] + ',' + p[1];

export function makeApi({ store, getKeys }) {
  return {
    async directions(origin, dest, waypoints = []) {
      const { kakao } = await getKeys();
      if (!kakao) throw new ApiError('설정에서 카카오 REST API 키를 입력해 주세요.', 'NOKEY');
      await useQuota(store, 'dir');
      let u = 'https://apis-navi.kakaomobility.com/v1/directions?origin=' + pt(origin) + '&destination=' + pt(dest) +
        '&priority=RECOMMEND&summary=false&alternatives=false&road_details=false';
      if (waypoints.length) u += '&waypoints=' + waypoints.map(pt).join('|');
      return getJson(u, kakaoHead(kakao), '카카오 길찾기');
    },
    async keyword(query, { x, y, radius, size = 15, sort = 'distance' } = {}) {
      const { kakao } = await getKeys();
      if (!kakao) throw new ApiError('설정에서 카카오 REST API 키를 입력해 주세요.', 'NOKEY');
      await useQuota(store, 'local');
      let u = 'https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent(query) + '&size=' + size;
      if (x != null && y != null) { u += '&x=' + x + '&y=' + y; if (radius) u += '&radius=' + radius; u += '&sort=' + sort; }
      const j = await getJson(u, kakaoHead(kakao), '카카오 장소검색');
      return j.documents || [];
    },
    async geocode(text, near) {
      const docs = await this.keyword(text, near ? { x: near[0], y: near[1], size: 1, sort: 'accuracy' } : { size: 1 });
      if (!docs.length) throw new ApiError('"' + text + '" 위치를 찾지 못했습니다.', 'NOPLACE');
      const d = docs[0];
      return { name: d.place_name, lng: +d.x, lat: +d.y };
    },
    async geocodeAddress(text) {
      const { kakao } = await getKeys();
      if (!kakao) throw new ApiError('설정에서 카카오 REST API 키를 입력해 주세요.', 'NOKEY');
      await useQuota(store, 'local');
      const j = await getJson('https://dapi.kakao.com/v2/local/search/address.json?size=1&query=' + encodeURIComponent(text), kakaoHead(kakao), '카카오 주소검색');
      const d = (j.documents || [])[0];
      if (d) return { lng: +d.x, lat: +d.y };
      const k = await this.keyword(text, { size: 1 });
      if (k.length) return { lng: +k[0].x, lat: +k[0].y };
      throw new ApiError('주소를 찾지 못했습니다. 도로명 또는 지번 주소를 다시 확인해 주세요.', 'NOPLACE');
    },
    async opinet(katecXY, prodcd, radius = 5000) {
      const { opinet } = await getKeys();
      if (!opinet) throw new ApiError('설정에서 오피넷 API 키를 입력해 주세요.', 'NOKEY');
      await useQuota(store, 'opinet');
      const u = 'https://www.opinet.co.kr/api/aroundAll.do?code=' + encodeURIComponent(opinet) + '&certkey=' + encodeURIComponent(opinet) +
        '&out=json&x=' + katecXY[0].toFixed(1) + '&y=' + katecXY[1].toFixed(1) + '&radius=' + radius + '&prodcd=' + prodcd + '&sort=1';
      const j = await getJson(u, {}, '오피넷');
      const list = j && j.RESULT && j.RESULT.OIL;
      return Array.isArray(list) ? list : [];
    },
  };
}
