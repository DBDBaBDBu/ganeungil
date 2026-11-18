// 기기 안 저장소 (앱: Capacitor Preferences, 브라우저 시험: localStorage) — ver.01
let P = null;
try { P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences; } catch (_) {}

export const store = {
  async get(key) {
    try {
      const raw = P ? (await P.get({ key })).value : localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (_) { return null; }
  },
  async set(key, val) {
    try {
      const raw = JSON.stringify(val);
      if (P) await P.set({ key, value: raw }); else localStorage.setItem(key, raw);
    } catch (_) {}
  },
};

export const DEFAULTS = { kakao: '', opinet: '', kmpl: 19, liters: 100, places: [], ver: 2, allowed: 5, fuel: 'B027', recents: ['맥도날드', '치킨', '카페', '편의점'], from: '현재 위치', to: '' };
export async function loadSettings() {
  const s = (await store.get('settings')) || {};
  const m = { ...DEFAULTS, ...s };
  if (!s.ver || s.ver < 2) { m.kmpl = 19; m.liters = 100; m.ver = 2; await store.set('settings', m); }
  return m;
}
export async function saveSettings(patch) {
  const s = { ...(await loadSettings()), ...patch };
  await store.set('settings', s);
  return s;
}
export function pushRecent(recents, word) {
  const w = word.trim();
  if (!w || w === '주유소') return recents;
  return [w, ...recents.filter(r => r !== w)].slice(0, 4);
}
