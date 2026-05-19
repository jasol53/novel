[README.md](https://github.com/user-attachments/files/27986416/README.md)
# Novel Site Split Version

기존 `index.html`의 기능은 유지하고, 관리하기 쉽도록 파일만 분리한 버전입니다.

## 구조

```txt
index.html
css/style.css
js/app.js
```

## Firebase Hosting 배포

이 폴더 전체를 Firebase Hosting의 public 폴더처럼 배포하면 됩니다.

```bash
firebase deploy
```

또는 Firebase 콘솔/스토리지에 수동 업로드한다면 `index.html`, `css/style.css`, `js/app.js` 경로를 그대로 맞춰서 올려야 합니다.

## 주의

이번 분리는 리팩터링 1단계입니다. JS 내부 기능별 분리는 아직 하지 않았고, 우선 CSS와 앱 스크립트만 외부 파일로 뺐습니다.
