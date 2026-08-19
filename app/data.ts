export type MessageKind = "text" | "image" | "audio" | "file";

export type Message = {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  /** 보낸 뒤 경과 일수 (14일 보관, 13일↑ 이면 fade) */
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

/**
 * 1:1 대화 하나.
 * id 는 directs.id 이며 그대로 메시지 채널이자 Realtime 채널 이름이 된다.
 */
export type Chat = {
  id: string;
  /** 상대 아이디 */
  name: string;
  otherId: string;
  preview: string;
  time: string;
  messages: Message[];
};
