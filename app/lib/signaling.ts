import { supabase } from "./supabase";

/**
 * 시그널링 메시지 — WebRTC 핸드셰이크(desc/ice)와 채팅 전달에 공용.
 * to 가 있으면 특정 피어 대상(mesh) — 나머지는 무시한다. 없으면 방 전체 브로드캐스트.
 */
export type Signal = { event: string; data: any; from: string; to?: string };

/** 토픽 형식. realtime.messages RLS 정책이 콜론 뒤를 채널 식별자로 읽는다. */
const topicOf = (channelId: string) => `chat:${channelId}`;

/**
 * 채널ID로 Realtime 브로드캐스트 파이프를 연다.
 * WebRTC 직접 연결이 서기 전까지 offer/answer/ICE 를 실어 나르는 "중매쟁이".
 *
 * private: true — 이게 핵심이다.
 *   공개 채널이면 anon key 만 가진 누구나 토픽을 구독하고 가짜 메시지를 밀어넣을 수 있어,
 *   messages 테이블에 건 RLS 를 실시간 경로가 통째로 우회한다.
 *   private 채널은 접속 시 JWT 로 인가되고, 판단은 realtime.messages 의 RLS 가 한다
 *   (supabase/0009_realtime_rls.sql — 저장 경로와 같은 is_channel_member() 를 쓴다).
 *
 * - self:false → 내가 보낸 메시지는 내가 안 받음
 * - 구독 완료 전 send() 는 큐에 쌓았다가 SUBSCRIBED 되면 flush
 */
export function openSignaling(
  channelId: string,
  selfId: string,
  onSignal: (s: Signal) => void
) {
  const channel = supabase.channel(topicOf(channelId), {
    config: { private: true, broadcast: { self: false } },
  });

  // self:false 가 자기 클라이언트의 메시지를 막아주므로 from 검사 불필요.
  // (같은 계정 두 탭으로 테스트할 때 from 이 같아도 서로 받아야 함)
  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    onSignal(payload as Signal);
  });

  let ready = false;
  let closed = false;
  const queue: Signal[] = [];

  const flush = (s: Signal) =>
    channel.send({ type: "broadcast", event: "signal", payload: s });

  // private 채널은 접속 시 토큰으로 인가된다 → 구독 전에 토큰을 실어야 한다.
  (async () => {
    const { data } = await supabase.auth.getSession();
    await supabase.realtime.setAuth(data.session?.access_token ?? null);
    if (closed) return;
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        ready = true;
        queue.splice(0).forEach(flush);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // 대개 인가 실패다. 이 채널의 멤버가 아니거나 0009 SQL 미적용.
        console.error("[signaling] 채널 구독 실패", status, err?.message ?? "");
      }
    });
  })();

  const send = (event: string, data: any = null, to?: string) => {
    const s: Signal = to
      ? { event, data, from: selfId, to }
      : { event, data, from: selfId };
    ready ? flush(s) : queue.push(s);
  };

  const close = () => {
    closed = true;
    supabase.removeChannel(channel);
  };

  return { send, close };
}
