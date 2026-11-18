// 'npx cap add android' 로 만들어진 안드로이드 프로젝트에 아이콘·시작화면·설정을 덮어씁니다. — ver.01
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const res = path.join(root, 'android/app/src/main/res');
const main = path.join(root, 'android/app/src/main');
if (!fs.existsSync(res)) { console.error('android 폴더가 없습니다. 먼저 npx cap add android 를 실행하세요.'); process.exit(1); }

function copyDir(src, dst) {
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); n += copyDir(s, d); }
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); n++; }
  }
  return n;
}
console.log('복사한 이미지 파일:', copyDir(path.join(root, 'assets/android-res'), res));

// 적응형 아이콘 배경 = 흰색
const bg = path.join(res, 'values/ic_launcher_background.xml');
fs.mkdirSync(path.dirname(bg), { recursive: true });
fs.writeFileSync(bg, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n');

// 매니페스트: 카카오맵 앱 호출 허용(queries) + 위치 권한 명시
const mf = path.join(main, 'AndroidManifest.xml');
let x = fs.readFileSync(mf, 'utf8');
if (!x.includes('kakaomap')) {
  x = x.replace('</manifest>', `    <queries>\n        <intent>\n            <action android:name="android.intent.action.VIEW" />\n            <data android:scheme="kakaomap" />\n        </intent>\n    </queries>\n</manifest>`);
}
for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
  if (!x.includes(p)) x = x.replace('</manifest>', `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
}
fs.writeFileSync(mf, x);
console.log('설정 적용 완료');
