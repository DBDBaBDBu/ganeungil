// 휴대폰 기능 (위치, 다른 앱 열기) — ver.01
const Cap = window.Capacitor;
const plugin = n => (Cap && Cap.Plugins && Cap.Plugins[n]) || null;

export async function currentPosition() {
  const G = plugin('Geolocation');
  if (G) {
    try { await G.requestPermissions(); } catch (_) {}
    const p = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return { lng: p.coords.longitude, lat: p.coords.latitude };
  }
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('위치 기능을 사용할 수 없습니다.'));
    navigator.geolocation.getCurrentPosition(p => res({ lng: p.coords.longitude, lat: p.coords.latitude }), () => rej(new Error('현재 위치를 가져오지 못했습니다. 위치 권한을 확인해 주세요.')), { timeout: 15000 });
  });
}

export async function openExternal(url) {
  const L = plugin('AppLauncher');
  if (L) {
    try { await L.openUrl({ url }); return true; } catch (_) { return false; }
  }
  window.open(url, '_blank');
  return true;
}
