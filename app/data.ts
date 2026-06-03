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
  messages: Message[];
};

export const conversations: Conversation[] = [
  {
    id: "c1",
    name: "김도윤",
    initials: "도",
    status: "온라인",
    preview: "화면 공유로 보여줄게요",
    time: "방금",
    messages: [
      { id: "m1", from: "them", text: "어제 보낸 자료 봤어요?", time: "오후 2:01", ageDays: 0 },
      { id: "m2", from: "me", text: "네 확인했어요. 통화 한 번 할까요?", time: "오후 2:03", ageDays: 0 },
      { id: "m3", from: "them", text: "좋아요. 화면 공유로 보여줄게요", time: "오후 2:04", ageDays: 0 },
    ],
  },
  {
    id: "c2",
    name: "이서연",
    initials: "서",
    status: "10분 전 활동",
    preview: "원격으로 봐주실 수 있어요?",
    time: "오후 1:40",
    messages: [
      { id: "m1", from: "them", text: "빌드가 안 돼요 ㅠㅠ", time: "오후 1:35", ageDays: 0 },
      { id: "m2", from: "me", text: "원격제어로 들어가볼게요", time: "오후 1:38", ageDays: 0 },
      { id: "m3", from: "them", text: "원격으로 봐주실 수 있어요?", time: "오후 1:40", ageDays: 0 },
    ],
  },
  {
    id: "c3",
    name: "팀 - 페이드어웨이",
    initials: "팀",
    status: "멤버 6명",
    preview: "이 대화는 곧 사라져요",
    time: "13일 전",
    messages: [
      { id: "m1", from: "them", text: "이번 스프린트 회고 정리했습니다", time: "13일 전", ageDays: 13 },
      { id: "m2", from: "me", text: "고마워요, 곧 사라지니 따로 저장할게요", time: "13일 전", ageDays: 13 },
    ],
  },
  {
    id: "c4",
    name: "박준호",
    initials: "준",
    status: "오프라인",
    preview: "영상통화로 얘기해요",
    time: "어제",
    messages: [
      { id: "m1", from: "them", text: "영상통화로 얘기해요", time: "어제", ageDays: 1 },
    ],
  },
];
