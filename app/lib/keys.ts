import type { KeyboardEvent } from "react";

/**
 * 한글/일본어 등 IME 입력에서 Enter 는 '조합 확정' 키를 겸한다.
 * 그래서 조합 중 Enter 를 누르면 keydown 이 두 번 뜬다 —
 * 한 번은 확정용(isComposing: true), 한 번은 진짜 Enter.
 *
 * 이걸 안 걸러내면 "ㅋㅋㅋㅋㅋ" 를 보낼 때
 *   1) 아직 상태에 안 들어간 "ㅋㅋㅋㅋ" 가 먼저 나가고
 *   2) 확정되며 남은 "ㅋ" 이 또 나간다
 * → 메시지가 쪼개져서 두 번 전송된 것처럼 보인다.
 *
 * keyCode 229 는 isComposing 을 지원하지 않는 구형 브라우저용 보루.
 */
export function isSubmitEnter(e: KeyboardEvent): boolean {
  if (e.key !== "Enter") return false;
  if (e.shiftKey) return false;
  const native = e.nativeEvent as KeyboardEvent["nativeEvent"] & {
    isComposing?: boolean;
    keyCode?: number;
  };
  if (native.isComposing || native.keyCode === 229) return false;
  return true;
}
