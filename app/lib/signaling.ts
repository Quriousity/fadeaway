import { supabase } from "./supabase";

/**
 * 시그널링 메시지 — WebRTC 핸드셰이크(offer/answer/ice)와 테스트(ping/pong)에 공용.
 * to 가 있으면 특정 피어 대상(mesh) — 나머지는 무시한다. 없으면 방 전체 브로드캐스트.
 */
export type Signal = { event: string; data: any; from: string; to?: string };

/**
 * 세션ID로 Realtime 브로드캐스트 채널을 열어 양방향 메시지 파이프를 만든다.
 * 연결 성립 전(WebRTC 직접 연결 전) offer/answer/ICE를 실어 나르는 "중매쟁이".
 *
 * - self:false → 내가 보낸 메시지는 내가 안 받음
 * - 구독 완료 전 send()는 큐에 쌓았다가 SUBSCRIBED 되면 flush
 */
export function openSignaling(
  sessionId: string,
  selfId: string,
  onSignal: (s: Signal) => void
) {
  const channel = supabase.channel("session:" + sessionId, {
    config: { broadcast: { self: false } },
  });

  // self:false 가 자기 클라이언트의 메시지를 막아주므로 from 검사 불필요.
  // (같은 계정 두 탭으로 테스트할 때 from이 같아도 서로 받아야 함)
  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    onSignal(payload as Signal);
  });

  let ready = false;
  const queue: Signal[] = [];

  const flush = (s: Signal) =>
    channel.send({ type: "broadcast", event: "signal", payload: s });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      ready = true;
      queue.splice(0).forEach(flush);
    }
  });

  const send = (event: string, data: any = null, to?: string) => {
    const s: Signal = to
      ? { event, data, from: selfId, to }
      : { event, data, from: selfId };
    ready ? flush(s) : queue.push(s);
  };

  const close = () => {
    supabase.removeChannel(channel);
  };

  return { send, close };
}
