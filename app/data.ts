export type MessageKind = "text" | "image" | "audio" | "file";

export type Message = {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  /** 보낸 뒤 경과 일수 (2주=14일 보관, 13일↑ 이면 fade) */
  ageDays: number;
  /** 첨부 종류. 없으면 순수 텍스트 */
  kind?: MessageKind;
  /** attachments 버킷 경로 (kind !== 'text' 일 때) */
  path?: string | null;
  fileName?: string | null;
  mime?: string | null;
  byteSize?: number | null;
  durationMs?: number | null;
  /** 업로드 진행 중인 로컬 임시 메시지 */
  pending?: boolean;
  /** 업로드 전 로컬 미리보기 URL (objectURL) */
  localUrl?: string | null;
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
