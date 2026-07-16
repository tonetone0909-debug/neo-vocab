# NEO TOEFL (PWA)

TOEFL 대비 학습 앱. **코드 하나로 두 앱**을 쓴다 — 어휘 트레이너(NEO VOCAB)와 Writing Task 1(Build a Sentence).
iOS·안드로이드·PC 호환 설치형 PWA (정적 HTML/CSS/JS, 빌드 프레임워크 없음).

- **라이브**: https://tonetone0909-debug.github.io/neo-vocab/ (GitHub Pages, repo `tonetone0909-debug/neo-vocab`)
  - repo 이름은 `neo-vocab` 그대로 — **URL을 바꾸면 학생들이 설치한 앱이 끊긴다.** 내용과 이름이 안 맞는 건 감수.
- **운영 컨텍스트**: `웹자료/1. context/vocab-app_context.md` · **변경 이력**: 메모리 `vocab-app-pwa.md`
- 현재 서비스워커 버전: **neo-toefl-v1**

## 구조 — 허브 + 두 앱 (한 origin)

```
/                     허브. [NEO VOCAB] / [WRITING TASK 1] 두 카드
/login.html           공용 코드 게이트 (두 앱 공통)
/admin.html           공용 관리자 — 코드 관리 + 학생별 두 앱 진도
/assets/              공용: colors_and_type.css · app.css · auth.js · config.js · ui.js · shell.js · icons/
/vocab/               어휘 앱 (assets/ · data/ 자체 보유)
/writing/             Writing Task 1 (assets/ · data/ 자체 보유)
/manifest.webmanifest /sw.js   PWA — 앱 1개, SW 1개(scope 전체)
/build/               개발용 스크립트 (배포 제외)
```

**왜 한 폴더인가**: `localStorage`/`sessionStorage`는 **origin 단위**다. 두 앱을 다른 도메인에 두면 로그인 세션(`neo_code`)도 진도도 공유가 불가능하다. 같은 origin에 있어야 코드 하나로 둘 다 열린다.

**앱 추가하기**(Speaking 등): `/새앱/` 폴더를 만들고 `<head>`에 `../assets/`의 config→auth→shell 을 붙이면 게이트·이름칩이 자동으로 붙는다. 진도를 서버에 올릴 거면 `writing/assets/w1store.js`를 본떠 새 `ns`를 쓴다(§동기화).

## 기능

**공통** — 학생 코드 로그인, 기기간 진도 동기화(같은 코드면 어느 기기서나 동일), 관리자 진도 조회
**NEO VOCAB** — 실용/학술 어휘장(틴더식 카드 스택, 좌우 스와이프 채점), 파생어·동의어·예문·배경지식·US/UK TTS, C-test 빈칸 드릴, 동의어 퀴즈, 내 단어장, Leitner SRS 복습
**Writing Task 1** — 개념 11종 학습, 조각 드래그로 문장 조립(세트당 10문항·6분 50초), 모의고사 100세트, 오답 리뷰(정오 표시·해설·해석·개념 복습 링크)

## 데이터 규모
- 어휘 3,155개 (실용/학술 × Reading/Listening), 배경지식 601개, Reading Task1 빈칸 카드 592개
- Writing T1 문항 1,100개(개념 11 × 10세트 × 10문항) + 모의고사 100세트 × 10 = **총 210세트**

## 실행 (서비스워커는 http(s) 필요 — file:// 불가)
```
cd "6. neo-toefl"
python -m http.server 8730
# → http://localhost:8730
```
모바일 실기기 테스트: 같은 Wi-Fi에서 `http://<PC-IP>:8730`.
배포: `6. neo-toefl/` 폴더를 GitHub repo(`tonetone0909-debug/neo-vocab`)에 업로드 → GitHub Pages 자동 반영.
(`_archive/`·`build/`는 올리지 않아도 됨.)

## 코드 인증 + 기기간 진도 동기화

- `assets/config.js`의 `NEO_AUTH.url`에 Apps Script `/exec` URL. **비우면 인증이 통째로 꺼진다** — 로컬 테스트 후 반드시 원복할 것.
- 백엔드 소스: `build/apps_script_auth.gs`. 설정·재배포법: `AUTH_SETUP.md`.
- 학생 코드 형식: 한글 풀네임+전화 뒤4자리(예 `박태환4355`). 관리자에서 엑셀로 일괄 생성.
- **앱별 진도 분리(`ns`)** — 시트 셀 한도가 49,000자라 두 앱을 한 셀에 못 넣는다:

  | 앱 | 클라이언트 | `ns` | 시트 | localStorage |
  |---|---|---|---|---|
  | vocab | `vocab/assets/store.js` | (미전송) | `progress` | `neo_vocab_progress_v1:<code>` |
  | writing | `writing/assets/w1store.js` | `w1` | `progress_w1` | `neo_w1_results:<code>` |

  `ns` 기본값이 기존 동작이라 **배포된 구 vocab 클라이언트는 수정 없이 그대로 동작**한다.
- writing 은 push 할 때 `marks`/`ids`를 **뺀다**(`slim()`). 읽는 곳이 없고, 그대로 올리면 210세트에 41,777자로 한도에 육박한다(빼면 17,207자).
- `auth.js`는 자기 `<script src>` 위치에서 앱 루트를 도출해 `login.html`로 보낸다 — 하위 폴더에서 상대경로로 찾으면 `/vocab/login.html` 404가 난다.

## 데이터 재생성 (개발용, 배포 제외)
```
# 어휘
cd "6. neo-toefl/build"
node build_vocab.js          # → ../vocab/data/vocab.js, meta.js
node build_blanks.js         # → ../vocab/data/blanks.js
node build_ctest.js          # → ../vocab/data/ctest.js

# Writing T1 (스크립트는 웹자료 루트에 있음)
cd "웹자료"
node build_w1_web.js         # w1_sets.json  → writing/data/w1.js
node build_w1_mock.js        # mock_c*.json  → writing/data/w1_mock.js
node build_w1_learn.js       # w1_curriculum.json → writing/data/w1_learn.js
node build_w1_meta.js        # 위 둘을 읽어 → writing/data/w1_meta.js  (마지막에 실행)
```
`w1_meta.js`(908B)는 개념·세트 수와 짧은 라벨의 **단일 출처**다. 관리자·마이페이지가 2.1MB 데이터 대신 이것만 읽는다.

**데이터/코드를 바꾸면 `sw.js`의 `CACHE` 문자열을 반드시 올릴 것** — 캐시 무효화 손잡이는 그거 하나다. (HTML에 `?v=` 쿼리를 붙이면 프리캐시 키와 어긋나 캐시가 영영 안 맞으므로 쓰지 않는다.)

## 발음 (TTS)
브라우저 Web Speech API(`speechSynthesis`). 발음 표기(IPA/한글 차음) 절대 없이 실제 음성만 재생.
US(en-US)/UK(en-GB) 2버튼 — lang 접두 일치로 억양별 voice 구분.
**안드로이드에서 US=UK로 같게 들리면 기기에 영국 영어 음성팩이 없는 것** → `vocab/voice-setup.html` 안내대로 설치(설정→TTS→Google→English UK). iPhone은 기본 내장.
iOS는 무음 모드이면 소리가 안 날 수 있어요.
