# Fadeaway — 셋업 (친구들과 무료로 쓰기)

이 순서대로만 하면 **인증 + 텍스트/이미지/음성/파일 + 음성·영상통화 + 화면공유 + 14일 자동 삭제**가 동작한다.
전부 Supabase / Vercel 무료 티어 안. (원격제어는 범위 밖 — 코드에 주석으로만 남아 있음)

> **service_role 키는 우리가 만지지 않는다.** 앱에도, `.env`에도, 저장소에도 없다.
> 키가 필요한 유일한 작업(Storage 원본 삭제)은 Edge Function이 하고,
> 그 키는 Supabase 플랫폼이 함수 실행 환경에 자동으로 넣어준다.

---

## 1. DB 만들기 — SQL 한 번

대시보드 → **SQL Editor** → `supabase/schema.sql` 전체를 붙여넣고 Run. **이 파일 하나면 끝.**
여러 번 돌려도 안전하다(idempotent).

만들어지는 것:
- `profiles` / `sessions` / `directs` / `messages`
- `is_channel_member()` — messages RLS와 Storage RLS가 **같은 함수**를 쓴다. 규칙이 두 벌이면 반드시 어긋난다
- `attachments` **비공개** 버킷 (파일당 10MB)
- messages 읽기 정책의 **14일 컷오프**
- `pg_cron` 잡 — 만료 메시지 행을 매시간 실제 삭제 (**키 불필요**)

> 이미 이전 버전의 `schema.sql` 을 적용한 DB라면 `supabase/0008_id_editable.sql` 도 실행할 것.
> (아이디 변경 허용 — 설계문서 D-012. 새로 구축하는 경우엔 이미 반영돼 있다)

맨 아래 검증 쿼리 결과가 이렇게 나오면 정상:
```
tables | directs, messages, profiles, sessions
bucket | attachments / public=false / limit=10485760
cron   | fadeaway-purge-messages @ 17 * * * *
```

`cron`이 `미등록`으로 나오면 → Database → Extensions에서 **pg_cron**을 켜고 §7의 `do $$ ... $$` 블록만 다시 실행.

---

## 2. Auth 설정

**Authentication → URL Configuration → Redirect URLs** 에 전부 추가.
(없으면 Google 로그인 후 엉뚱한 주소로 튕긴다)

```
http://localhost:3000
http://localhost:3000/**
https://<배포주소>
https://<배포주소>/**
```

친구들이 바로 들어오게 하려면 **Providers → Email → "Confirm email" 끄기**도 고려.
켜두면 가입 후 메일 인증을 해야 들어온다. (설계문서 §1.3 — 가입 마찰이 곧 이탈)

---

## 3. 환경변수

`.env.local` (로컬) 과 배포처 환경변수에 **이 둘뿐**이다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

둘 다 공개돼도 되는 값이다. RLS가 실제 방어선이다.

---

## 4. 실행

```bash
npm install
npm run dev      # http://localhost:3000
```

이 상태로 **채팅·첨부·통화·영상·화면공유가 전부 동작**한다.
메시지 행도 pg_cron이 알아서 지운다. 아래 5번은 **첨부 파일 원본**까지 지우기 위한 것.

---

## 5. 첨부 원본 삭제 (첨부를 쓴다면 필수)

### 왜 따로 해야 하나

`storage.objects`의 행을 SQL로 지워도 **실제 파일은 S3에 남는다.**
진짜 삭제는 Storage API를 거쳐야 하고, 그건 service_role 권한이 필요하다.

Edge Function은 그 키를 **플랫폼이 자동 주입**한다 — 우리가 키를 복사·보관할 일이 없다.
이게 service_role을 우리 손에 안 쥐고도 진짜 삭제가 되는 이유다.

### (1) 함수 배포

대시보드 → **Edge Functions → Deploy a new function**
- **생성 화면의 이름 입력칸에 `purge` 를 먼저 입력할 것.**
  기본값(`dynamic-handler`)으로 만들면 URL이 `/functions/v1/dynamic-handler` 가 된다.
  표시 이름은 나중에 바꿀 수 있지만 **URL(slug)은 변경 불가**다
- `supabase/functions/purge/index.ts` 내용 붙여넣고 Deploy
- 목록의 URL이 `.../functions/v1/purge` 인지 확인

CLI를 쓴다면: `supabase functions deploy purge`

### (2) Verify JWT 끄기

Edge Functions → `purge` → Settings → **Verify JWT** 토글 OFF

이 함수는 14일 지난 것만 지운다. 이미 아무도 못 읽는 데이터라 누가 호출해도 피해가 없어서,
인증을 붙일 이유가 약하다. 대신 키 관리가 통째로 사라져 나중에 키를 교체해도 안 깨진다.

> 트레이드오프: URL을 아는 사람이 반복 호출해 Edge Function 무료 호출량을 축낼 수 있다.
> 데이터 피해는 없다. 신경 쓰이면 Verify JWT를 켜고 아래 헤더에
> `"Authorization":"Bearer <legacy anon JWT>"` 를 추가하면 된다.
> 이때 반드시 **Legacy API keys** 의 `eyJ...` JWT여야 한다 — `sb_publishable_...` 는 JWT가
> 아니라서 `INVALID_JWT_FORMAT` 으로 거절된다.

### (3) 스케줄 등록

SQL Editor에서 (`<PROJECT_REF>`만 채울 것):

```sql
select cron.schedule(
  'fadeaway-purge-attachments',
  '23 3 * * *',
  $cmd$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge',
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $cmd$
);
```

같은 이름으로 다시 실행하면 덮어쓴다(중복 등록 안 됨).

> 대시보드 Integrations → Cron 으로 만들어도 되지만, 거기서 만든 job은
> `headers:='{}'` 로 비어서 나온다. Verify JWT가 켜져 있으면 401이 난다.

### (4) 확인

```sql
select net.http_post(
  url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge',
  headers := '{"Content-Type":"application/json"}'::jsonb
);
-- 몇 초 뒤
select status_code, content from net._http_response order by id desc limit 1;
```

| 결과 | 의미 |
|---|---|
| `200` + `{"ok":true,...}` | 정상 |
| `404 NOT_FOUND` | 함수 slug가 `purge`가 아님 |
| `401 INVALID_JWT_FORMAT` | Verify JWT가 켜져 있음 (또는 헤더의 키가 JWT가 아님) |
| `500` | 함수 내부 오류 — Edge Functions → Logs 확인 |

---

## 6. 보관 정책이 실제로 작동하는 방식

| 단계 | 담당 | 시점 | 키 필요? |
|---|---|---|---|
| 노출 차단 | RLS `created_at > now() - interval '14 days'` | **정확히 14일, 즉시** | ❌ |
| 메시지 행 삭제 | `pg_cron` | 매시간 | ❌ |
| 첨부 원본 삭제 | Edge Function `purge` | 하루 1회 | 플랫폼이 주입 |

노출 차단을 RLS에 넣은 이유: **크론이 죽어 있어도 14일 지난 메시지는 아무도 못 읽는다.**
"2주 뒤 사라진다"가 크론 주기에 인질로 잡히지 않게 하는 장치다.

---

## 7. 지금 되는 것 / 안 되는 것

### 되는 것
- 이메일·비밀번호 / Google 로그인
- **가입 → 아이디 설정 → 친구 아이디로 추가 → 바로 대화** (진입점 하나)
- 텍스트, **이미지**(첨부·붙여넣기), **음성 메모**(브라우저 녹음), **파일**
- 음성통화 / 영상통화 / 화면공유 — WebRTC mesh, 다자간 가능
- 14일 보관 → 자동 소멸

### 안 되는 것 / 알아둘 것
- **원격제어** — 범위 밖 (`app/page.tsx`에 주석으로 보류 표시)
- **TURN 없음** — 공개 STUN만. 가정용 회선끼리는 대부분 붙지만
  회사망·대칭형 NAT에서는 통화 연결이 실패할 수 있다. 실패 사례가 나오면 그때 추가
- **E2EE 아님** — 서버가 메시지 평문을 볼 수 있다. 설계문서 Q-005 미결.
  "2주 뒤 사라진다"와 "우리도 못 본다"는 다른 얘기다. 대외 문구에서 섞지 말 것
- **세션(코드로 참여하는 임시 방)은 UI에서 뺐다** — 설계문서 D-011.
  테이블·코드는 그대로 남아 있어 되살리는 비용은 낮다
- **무료 티어** — Storage 1GB, DB 500MB, Realtime 동시접속 200.
  첨부 10MB 상한 × 14일 회전이라 친구 몇 명 규모에선 여유 있다
- 설계문서 §4.4의 **파티션 DROP 방식은 미적용**. 지금은 RLS 컷오프 + 크론 DELETE.
  볼륨이 붙으면 그때 옮긴다 (§4.3의 PITR 백업 이슈도 그 시점 과제)

---

## 관련 문서
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 전체 구조
- [BILLING.md](./BILLING.md) — 과금 (미래 계획)
- [../messenger-design.md](../messenger-design.md) — 제품 설계 원칙 / 결정 기록
