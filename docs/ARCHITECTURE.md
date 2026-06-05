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
[다음] 1   Realtime 시그널링 — 세션 채널 입장 + Presence로 상대 접속 표시
       2   음성 통화 — getUserMedia(audio) + RTCPeerConnection + STUN
       3   영상 통화 — video 트랙 추가
       4   화면 공유 — getDisplayMedia 트랙 추가/교체
       5   원격 제어 — 화면공유 + 입력 이벤트(마우스/키) DataChannel 전송
       6   TURN 추가 — 인터넷 너머 까다로운 망 커버
```

각 단계는 독립적으로 테스트 가능하도록 "하나씩 천천히" 붙인다.

## 6. 데이터 휘발 (2주 TTL) — 예정

- 메시지/세션을 Supabase Postgres에 저장하되 14일 후 자동 삭제
- 구현 후보: `created_at` 기준 cron(Edge Function/pg_cron)으로 주기 삭제
- 현재는 `app/data.ts`의 시드(dummy) 데이터로 UI만 구성 — 각 행에 `dummy` 칩 표시

## 관련 문서
- [BILLING.md](./BILLING.md) — 상용 서비스 과금 체계 (미래 계획)
