# 화자 이미지

시험 화면 좌측에 뜨는 화자 그림. 파일이 없으면 도형 + MAN/WOMAN 라벨로 대체된다.

| 파일 | 개수 | 쓰임 |
|---|---|---|
| `man01.png` … `man10.png` | 10 | 반신 — Task 1(Choose a Response) · Task 3(Announcement) · Speaking |
| `woman01.png` … `woman10.png` | 10 | 반신 — 위와 같음 |
| `convo01.png` … `convo10.png` | 10 | 남녀 대화 장면 — Task 2(Conversation) |
| `man_full01.png` … `man_full10.png` | 10 | 전신 — Task 4(Academic Talk) |
| `woman_full01.png` … `woman_full10.png` | 10 | 전신 — Task 4 |

## 주의

- **성별이 목소리와 반드시 일치해야 한다.** 어느 그림이 어디 붙는지는 `emit.py` 가
  정하고 `mk{N}_exam.js` 의 `img` / `sex` 필드에 박힌다. TTS 도 같은 값을 읽으므로
  파일만 규약대로 넣으면 자동으로 맞는다.
- 배경은 투명(PNG) 권장. 화면 배경이 `--neo-paper` 라 흰 배경이면 네모가 보인다.
- 세로로 긴 비율(대략 2:3)이 레이아웃에 맞는다. 전신은 더 길어도 된다.
