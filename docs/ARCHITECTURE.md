# Fadeaway — 설계 방안

> 2주 뒤 사라지는 휘발성 메신저 + 데스크탑-데스크탑 실시간 통화/영상/화면공유/원격제어.
> 이 문서는 전체 구조와 단계별 구현 계획을 정리한다.

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) + React 19 | 정적/CSR 혼합 |
| 인증 | Supabase Auth | 이메일/비밀번호 + Google OAuth |
| 시그널링 | Supabase Realtime (Broadcast + Presence) | 별도 ws 서버 불필요 |
| 미디어 | WebRTC (`RTCPeerConnection`) | P2P 직접 연결 |
| NAT 통과 | STUN(무료) → TURN(필요 시) | TURN은 유일한 변동비 |
| 데이터 저장 | Supabase Postgres (예정) | 2주 TTL 휘발 |

## 2. 인증 (구현 완료)

- 앱 전체를 `app/components/AuthGate.tsx`로 감쌈 → **로그인 안 하면 진입 불가**
- 이메일/비밀번호 + Google OAuth 둘 다 지원
- `useAuth()` 훅으로 컴포넌트 내에서 `user` / `signOut` 접근
- 세션 유지(`persistSession`) + 자동 토큰 갱신

**Supabase 설정 주의:**
- Authentication → URL Configuration → Redirect URLs 에 로컬·배포 주소 모두 등록
  (없으면 OAuth 후 Site URL(배포판)로 튕김)
- 로컬 테스트 시 `http://localhost:3000`, `http://localhost:3000/**` 추가

## 3. 시그널링 — 왜 Supabase Realtime인가

WebRTC는 **직접 연결을 만들기 위해** 먼저 연결정보(SDP/ICE)를 교환해야 한다.
하지만 아직 직접 연결이 없으므로, **양쪽이 모두 닿을 수 있는 제3의 통로**가 필요하다.
이것이 시그널링 서버이며, Realtime이 그 역할을 한다.

```
연결 전 (잠깐)                    연결 후 (통화 내내)
┌─────────────┐                 ┌──────────────┐
│ Supabase    │  offer/answer   │  PC A ⇄ PC B  │  ← 직접 P2P
│ Realtime    │  / ICE 교환     │  미디어는     │
│ 채널        │ ──────────────► │  서버 안 거침 │
└─────────────┘                 └──────────────┘
```

- **중매쟁이 모델**: 악수시킬 때만 쓰고, 연결되면 손 뗌
- Presence로 "상대 접속 여부" 자동 감지
- 추가 서버 0개, 연결 후 부하·비용 거의 0

**채널 설계:**
- 세션ID 1개 = Realtime 채널 1개 (`session:<세션ID>`)
- `broadcast` 이벤트로 `offer` / `answer` / `ice` 메시지 전달
- `presence`로 멤버 입퇴장 추적

## 4. 비용 / 서버 유지 모델

핵심: **통화 중엔 서버가 거의 일을 안 한다** (미디어 P2P 직접).

| 구간 | 역할 | 비용 | 부하 |
|---|---|---|---|
| Supabase Realtime | 연결 시 SDP/ICE 수십 KB 교환 | 무료 tier 충분 | ~0 |
| STUN (구글 공개) | 공인 IP 확인 | 무료 | 패킷 몇 개 |
| TURN | P2P 실패 시 미디어 중계 | **GB당 과금 (유일한 변동비)** | 여기만 부하 |

- 전체 연결의 약 80~90%는 STUN만으로 직접 연결 → TURN 미사용 → 공짜
- 나머지 10~20%(회사망/대칭형 NAT)만 TURN 경유 → 영상 1시간 ≈ 0.5~1.3GB/인
- 따라서 1~4단계는 TURN 없이 진행, 실제 실패 케이스 확인 후 6단계에서 TURN 추가

## 5. 단계별 구현 로드맵

```
[완료] 0   Supabase 스캐폴딩 (client, env, gitignore)
[완료] —   인증 (이메일/비번 + Google, AuthGate, 로그아웃)
[완료] 1   Realtime 시그널링 — 세션 채널 입장 + 통화 울림
[완료] 2   음성 통화 — getUserMedia(audio) + RTCPeerConnection + STUN
[완료] 3   영상 통화 — video 트랙 추가 (replaceTrack / 재협상)
[완료] 4   화면 공유 — getDisplayMedia 트랙 추가/교체
[완료] 4.5 첨부 + 14일 TTL — Storage 비공개 버킷 + purge 크론
[보류] 5   원격 제어 — 1차 범위 밖 (page.tsx에 주석으로 남김)
[다음] 6   TURN 추가 — 실제 연결 실패 사례가 나오면
```

각 단계는 독립적으로 테스트 가능하도록 "하나씩 천천히" 붙인다.

## 6. 첨부 (이미지 / 음성 / 파일) — 구현 완료

- **비공개** Storage 버킷 `attachments`, 경로 규칙 `<channel>/<uuid>.<ext>`
- 첫 폴더가 채널이라 `storage.objects` RLS에서 `is_channel_member()`로 그대로 막는다
  (messages RLS와 **같은 함수**를 쓴다 — 규칙이 두 벌이 되면 반드시 어긋난다)
- 비공개이므로 표시할 때마다 **서명 URL(1시간)** 을 발급, 클라이언트에서 50분 캐시
- 음성 메모는 브라우저 `MediaRecorder` — 서버 부담 0
- 파일당 10MB 상한 (버킷 설정 + 클라이언트 양쪽에서 검사)

## 7. 데이터 휘발 (2주 TTL) — 구현 완료

**2단 구조.** 크론 주기에 "사라진다"는 약속이 인질로 잡히지 않게 하기 위함.

| 단계 | 담당 | 시점 | 키 |
|---|---|---|---|
| 노출 차단 | RLS `created_at > now() - interval '14 days'` | 정확히 14일, 즉시 | 불필요 |
| 메시지 행 삭제 | `pg_cron` (Postgres 내부) | 매시간 | 불필요 |
| 첨부 원본 삭제 | Edge Function `purge` | 하루 1회 | 플랫폼 자동 주입 |

- 노출 차단을 RLS에 둔 이유: 크론이 죽어도 "2주 뒤 사라진다"가 안 깨진다
- `storage.objects` 행만 지우면 실제 파일은 S3에 남는다 → Storage API `remove()` 필요 →
  그 권한은 service_role 뿐 → **Edge Function**을 쓴다.
  Edge Function 실행 환경에는 `SUPABASE_SERVICE_ROLE_KEY`가 자동으로 들어 있어,
  키를 저장소·환경변수 어디에도 두지 않는다
- 파일 수명 = 메시지 수명이라 14일 지난 객체는 전부 대상.
  업로드 후 메시지 insert가 실패해 남은 **고아 파일**도 같이 정리된다
- 함수는 만료분만 지우므로 누가 호출해도 피해가 없다 → 별도 시크릿 없음

`[미적용]` 설계문서 §4.4의 파티션 DROP 방식, §4.3의 PITR 백업 대응은 아직. 볼륨이 붙는 시점 과제.

## 관련 문서
- [SETUP.md](./SETUP.md) — 실제로 띄우는 순서 (SQL / 환경변수 / 크론)
- [BILLING.md](./BILLING.md) — 상용 서비스 과금 체계 (미래 계획)
