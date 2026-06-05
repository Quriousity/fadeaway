export type Message = {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  /** 보낸 뒤 경과 일수 (2주=14일 보관, 13일↑ 이면 fade) */
  ageDays: number;
};

export type Conversation = {
  id: string;
  name: string;
  initials: string;
  status: string;
  preview: string;
  time: string;
  /** direct = 아이디로 요청·수락한 1:1 / session = 세션ID로 참여하는 방 */
  kind: "direct" | "session";
  /** 시드(목업) 데이터 표시용 — 실제 대화와 구분 */
  dummy?: boolean;
  /** kind === "session" 일 때 공유용 세션 ID */
  sessionId?: string;
  messages: Message[];
};

export const conversations: Conversation[] = [];
