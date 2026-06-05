"use client";

import { useState, useEffect, useRef } from "react";
import {
  conversations as seed,
  type Message,
  type Conversation,
} from "./data";
import {
  Phone,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  MousePointerClick,
  MousePointerBan,
  Mic,
  MicOff,
  PhoneOff,
  User,
  Plus,
  AtSign,
  Hash,
  Receipt,
  X,
  LogOut,
  Radio,
  Copy,
  Check,
  HelpCircle,
  ChevronLeft,
  Lock,
  Pencil,
} from "lucide-react";
import { useAuth } from "./components/AuthGate";
import { listMySessions, saveSession, renameSession } from "./lib/sessions";
import { getMyProfile, setNickname, isNicknameTaken } from "./lib/profile";
import {
  findUserByNickname,
  startDirect,
  listMyDirects,
  type Direct,
} from "./lib/directs";
import { loadMessages, sendMessage, type ChatMsg } from "./lib/messages";
import { openSignaling } from "./lib/signaling";
import { createCallRoom, type CallRoom, type RemotePeer } from "./lib/callroom";
import MediaTile from "./components/MediaTile";

type CallKind = "통화" | "영상통화" | "화면 공유" | "원격 제어";

/** 공유용 세션 ID 생성 — 헷갈리는 문자(I,O,0,1) 제외, XXXX-XXXX 형식 */
function makeSessionId() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () =>
    Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `${pick()}-${pick()}`;
}

/** DB 메시지 → 화면용 Message 변환 */
function toMessage(m: ChatMsg, selfId: string): Message {
  const created = new Date(m.created_at);
  const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
  return {
    id: m.id,
    from: m.sender === selfId ? "me" : "them",
    text: m.body,
    time: created.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    }),
    ageDays,
  };
}

export default function Home() {
  const { user, signOut } = useAuth();
  const [chats, setChats] = useState(seed);
  const [activeId, setActiveId] = useState(seed[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallKind | null>(null);
  const [muted, setMuted] = useState(true); // 기본 음소거
  const [newOpen, setNewOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileChat, setMobileChat] = useState(false); // 모바일: 우측 뷰 노출 여부
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [rightView, setRightView] = useState<"chat" | "profile">("chat");
  const [nick, setNick] = useState("");
  const [savedNick, setSavedNick] = useState("");
  const [nickMsg, setNickMsg] = useState<string | null>(null);
  const [nickSaving, setNickSaving] = useState(false);
  const [nickStatus, setNickStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [adClosed, setAdClosed] = useState(false);
  const [joinId, setJoinId] = useState("");
  const [directNick, setDirectNick] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // 음성 통화방 상태
  const [inCall, setInCall] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [ringing, setRinging] = useState(false); // 세션에 통화가 떠 울리는 중
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);

  const openCall = (kind: CallKind) => {
    setAdClosed(false);
    setCall(kind);
  };

  // 목록에서 대화 선택 (모바일에선 채팅 뷰로 전환)
  const openChat = (id: string) => {
    setActiveId(id);
    setRightView("chat");
    setMobileChat(true);
  };

  // 사이드바 프로필 영역 → 프로필 수정 페이지
  const openProfile = () => {
    setRightView("profile");
    setMobileChat(true);
  };
  const closeMock = () => {
    setMuted(true);
    setCall(null);
  };

  const active = chats.find((c) => c.id === activeId);
  // 세션·다이렉트 모두 sessionId를 Realtime 채널로 사용 (더미는 채널 없음)
  const activeSessionId = active?.sessionId ?? null;
  const selfName =
    savedNick ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "나";

  // 이 탭의 고유 피어 ID (같은 계정 여러 탭도 구분)
  const clientIdRef = useRef<string>("");
  if (!clientIdRef.current)
    clientIdRef.current =
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);

  // 토스트 자동 사라짐
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const sigRef = useRef<ReturnType<typeof openSignaling> | null>(null);
  const roomRef = useRef<CallRoom | null>(null);
  const ringDismissedRef = useRef(false);
  const activeCallersRef = useRef<Set<string>>(new Set());

  // 활성 세션의 시그널링 채널 + 통화방 구성
  useEffect(() => {
    sigRef.current?.close();
    roomRef.current?.leave();
    sigRef.current = null;
    roomRef.current = null;
    setInCall(false);
    setRemotePeers([]);
    setRinging(false);
    setLocalStream(null);
    setCamOn(false);
    setSharing(false);
    ringDismissedRef.current = false;
    activeCallersRef.current = new Set();
    if (!activeSessionId) return;

    const myId = clientIdRef.current;

    const sig = openSignaling(activeSessionId, myId, async (s) => {
      if (s.to && s.to !== myId) return; // 특정 대상 메시지 — 나에게 온 것만

      if (s.event === "ping") {
        setToast("📨 상대 핑 도착 — 퐁 응답함");
        sig.send("pong");
        return;
      }
      if (s.event === "pong") {
        setToast("✅ 상대 연결 확인 (왕복 성공)");
        return;
      }

      if (s.event === "chat") {
        const body = s.data?.body;
        if (body) {
          const incoming: Message = {
            id: s.data?.id ?? Math.random().toString(36).slice(2),
            from: "them",
            text: body,
            time: "방금",
            ageDays: 0,
          };
          setChats((cs) =>
            cs.map((c) =>
              c.sessionId === activeSessionId
                ? {
                    ...c,
                    messages: [...c.messages, incoming],
                    preview: body,
                    time: "방금",
                  }
                : c
            )
          );
        }
        return;
      }

      // 통화 활성 추적(울림용) — call-join/leave 는 비참가자도 본다
      if (s.event === "call-join") {
        activeCallersRef.current.add(s.from);
        if (!roomRef.current?.isActive() && !ringDismissedRef.current)
          setRinging(true);
      } else if (s.event === "call-leave") {
        activeCallersRef.current.delete(s.from);
        if (activeCallersRef.current.size === 0) {
          ringDismissedRef.current = false;
          setRinging(false);
        }
      }

      await roomRef.current?.handleSignal(s);
    });
    sigRef.current = sig;

    // 채널 메시지 히스토리 로드 → 해당 대화에 채워넣기
    loadMessages(activeSessionId).then((msgs) => {
      setChats((cs) =>
        cs.map((c) =>
          c.sessionId === activeSessionId
            ? { ...c, messages: msgs.map((m) => toMessage(m, user.id)) }
            : c
        )
      );
    });

    roomRef.current = createCallRoom({
      selfId: myId,
      selfName,
      send: (event, data, to) => sig.send(event, data, to),
      onChange: (peers) => setRemotePeers(peers),
      onLocal: (stream, video) => {
        setLocalStream(stream);
        setCamOn(video === "camera");
        setSharing(video === "screen");
      },
    });

    return () => {
      sig.close();
      roomRef.current?.leave();
      sigRef.current = null;
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, user.id]);

  const sendPing = () => {
    sigRef.current?.send("ping");
    setToast("📡 핑 전송… 상대 응답 대기");
  };

  // 통화방 입장 (마이크 권한 확보)
  const joinRoom = async () => {
    if (!roomRef.current || inCall) return;
    setRinging(false);
    ringDismissedRef.current = false;
    try {
      await roomRef.current.join();
      roomRef.current.setMuted(muted); // 현재 음소거 상태 반영 (기본 음소거)
      setInCall(true);
      setToast("🔊 통화방 입장 (기본 음소거)");
    } catch {
      setToast("마이크 권한이 필요해요");
    }
  };

  // 통화방 나가기 — 나만 퇴장, 남은 사람들 통화는 유지
  const leaveRoom = () => {
    roomRef.current?.leave();
    setInCall(false);
    setRemotePeers([]);
    setLocalStream(null);
    setCamOn(false);
    setSharing(false);
    setMuted(true); // 기본 음소거로 리셋
  };

  // 화면공유 시작 — 네이티브 선택창(탭/창/전체화면)이 다 처리
  const startShare = async () => {
    try {
      await roomRef.current?.startScreen();
    } catch (e: any) {
      if (e?.name === "NotAllowedError") setToast("화면공유 취소됨");
      else {
        console.error("[screen]", e);
        setToast(`화면공유 오류: ${e?.name ?? e?.message ?? e}`);
      }
    }
  };

  const stopShare = () => roomRef.current?.stopScreen();

  // 카메라 토글 (통화 중 영상 추가/제거 — 재협상)
  const toggleCamera = async () => {
    if (!roomRef.current) return;
    try {
      await roomRef.current.toggleCamera();
    } catch {
      setToast("카메라 권한이 필요해요");
    }
  };

  // 울림 무시 — 방은 계속 진행, 이후 통화 버튼으로 입장 가능
  const dismissRing = () => {
    setRinging(false);
    ringDismissedRef.current = true;
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    roomRef.current?.setMuted(m);
  };

  // 호출 버튼: 세션의 "통화"는 통화방 입장, 그 외는 기존 목업 오버레이
  const handleCallButton = (kind: CallKind) => {
    if (kind === "통화" && activeSessionId) joinRoom();
    else openCall(kind);
  };

  const [copied, setCopied] = useState(false);
  const copySessionId = async () => {
    if (!activeSessionId) return;
    try {
      await navigator.clipboard.writeText(activeSessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setToast("복사 실패 — 수동으로 선택해주세요");
    }
  };

  // SessionRow → 사이드바 Conversation 변환
  const sessionToConvo = (
    sid: string,
    role: "owner" | "member",
    name?: string | null
  ): Conversation => ({
    id: "s_" + sid,
    name: name || "세션 " + sid,
    initials: "#",
    status: `세션ID: ${sid} · ${role === "owner" ? "내가 만듦" : "참여함"}`,
    preview:
      role === "owner" ? "세션ID를 공유해 상대를 초대하세요" : "세션에 참여했어요",
    time: "방금",
    kind: "session",
    sessionId: sid,
    messages: [],
  });

  // Direct → 사이드바 Conversation 변환 (채널 = directs.id)
  const directToConvo = (d: Direct): Conversation => ({
    id: "d_" + d.id,
    name: d.otherNick,
    initials: "",
    status: "다이렉트",
    preview: "대화를 시작하세요",
    time: "",
    kind: "direct",
    sessionId: d.id,
    messages: [],
  });

  // 로그인 시 내 다이렉트를 DB에서 불러와 사이드바에 합침
  useEffect(() => {
    listMyDirects().then((ds) => {
      if (!ds.length) return;
      setChats((cs) => {
        const existing = new Set(cs.map((c) => c.id));
        const add = ds
          .map(directToConvo)
          .filter((c) => !existing.has(c.id));
        return [...add, ...cs];
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인 시 내 세션을 DB에서 불러와 사이드바에 합침
  useEffect(() => {
    listMySessions().then((rows) => {
      if (!rows.length) return;
      setChats((cs) => {
        const existing = new Set(cs.map((c) => c.id));
        const add = rows
          .map((r) => sessionToConvo(r.session_id, r.role, r.name))
          .filter((c) => !existing.has(c.id));
        return [...add, ...cs];
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인 시 내 닉네임 불러오기
  useEffect(() => {
    getMyProfile().then((p) => {
      setNick(p?.nickname ?? "");
      setSavedNick(p?.nickname ?? "");
    });
  }, []);

  // 입력할 때마다 실시간 중복확인 (debounce)
  useEffect(() => {
    const value = nick.trim();
    setNickMsg(null);
    if (value === savedNick || value.length === 0) {
      setNickStatus("idle");
      return;
    }
    if (value.length < 2 || value.length > 20) {
      setNickStatus("invalid");
      return;
    }
    setNickStatus("checking");
    const t = setTimeout(async () => {
      const taken = await isNicknameTaken(value, user.id);
      setNickStatus(taken ? "taken" : "available");
    }, 400);
    return () => clearTimeout(t);
  }, [nick, savedNick, user.id]);

  // 닉네임 저장 (사용 가능 상태일 때만)
  const saveNick = async () => {
    const value = nick.trim();
    if (nickStatus !== "available") return;
    setNickSaving(true);
    setNickMsg(null);
    const res = await setNickname(value);
    setNickSaving(false);
    if (res.ok) {
      setSavedNick(value);
      setNickMsg("✅ 저장됐어요");
    } else {
      setNickMsg(res.error ?? "저장 실패");
    }
  };

  // 세션을 목록에 올리고 활성화 (이미 있으면 선택만)
  const upsertLocal = (convo: Conversation) => {
    setChats((cs) =>
      cs.some((c) => c.id === convo.id) ? cs : [convo, ...cs]
    );
    setActiveId(convo.id);
    setRightView("chat");
    setMobileChat(true);
    setNewOpen(false);
  };

  const createSession = async () => {
    const sid = makeSessionId();
    upsertLocal(sessionToConvo(sid, "owner"));
    await saveSession(sid, "owner");
  };

  const joinSession = async () => {
    const sid = joinId.trim().toUpperCase();
    if (!sid) return;
    upsertLocal(sessionToConvo(sid, "member"));
    setJoinId("");
    await saveSession(sid, "member");
  };

  // 세션 이름 수정
  const openRename = () => {
    setRenameValue(active?.name ?? "");
    setRenameOpen(true);
  };
  const saveRename = async () => {
    const value = renameValue.trim();
    if (!value || !activeSessionId) return;
    setChats((cs) =>
      cs.map((c) => (c.id === activeId ? { ...c, name: value } : c))
    );
    setRenameOpen(false);
    await renameSession(activeSessionId, value);
  };

  // 상대 닉네임으로 1:1 다이렉트 시작
  const startDirectChat = async () => {
    const target = directNick.trim();
    if (!target) return;
    if (!savedNick) {
      setToast("먼저 프로필에서 닉네임을 설정하세요");
      return;
    }
    if (target === savedNick) {
      setToast("자기 자신은 추가할 수 없어요");
      return;
    }
    const found = await findUserByNickname(target);
    if (!found) {
      setToast("그 닉네임의 사용자가 없어요");
      return;
    }
    const d = await startDirect(found.id);
    if (!d) {
      setToast("다이렉트 생성 실패");
      return;
    }
    upsertLocal(
      directToConvo({ id: d.id, otherId: found.id, otherNick: found.nickname })
    );
    setDirectNick("");
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const msg: Message = {
      id: Math.random().toString(36).slice(2),
      from: "me",
      text,
      time: "방금",
      ageDays: 0,
    };
    setChats((cs) =>
      cs.map((c) =>
        c.id === activeId
          ? { ...c, messages: [...c.messages, msg], preview: text, time: "방금" }
          : c
      )
    );
    // 실제 채널이면 상대에게 실시간 전송 + DB 저장 (더미 대화는 로컬만)
    if (activeSessionId) {
      sigRef.current?.send("chat", { body: text });
      sendMessage(activeSessionId, text);
    }
  };

  return (
    <div className={"app" + (mobileChat ? " mobile-chat" : "")}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.svg" alt="Fadeaway" />
          <h1>Fadeaway</h1>
          <button className="new-btn" title="새 대화" onClick={() => setNewOpen(true)}>
            <Plus size={20} />
          </button>
        </div>

        <div className="retention">
          모든 데이터는 <b>2주</b> 뒤 자동으로 사라집니다.
        </div>

        <div className="list">
          <div className="group">
            <div className="group-head">
              <AtSign size={13} />
              <span>다이렉트</span>
            </div>
            <p className="group-desc">
              상대의 아이디로 요청을 보내고, 양쪽이 수락하면 연결돼요. 자주
              연락하는 상대를 위한 지속 연결입니다.
            </p>
            {chats
              .filter((c) => c.kind === "direct")
              .map((c) => (
                <button
                  key={c.id}
                  className={"row" + (c.id === activeId ? " active" : "")}
                  onClick={() => openChat(c.id)}
                >
                  <div className="avatar">
                    <User size={22} />
                  </div>
                  <div className="row-main">
                    <div className="row-top">
                      <span className="row-name">{c.name}</span>
                      {c.dummy && <span className="chip-dummy">dummy</span>}
                      <span className="row-time">{c.time}</span>
                    </div>
                    <div className="row-msg">{c.preview}</div>
                  </div>
                </button>
              ))}
          </div>

          <div className="group">
            <div className="group-head">
              <Hash size={13} />
              <span>세션</span>
            </div>
            <p className="group-desc">
              세션ID만 있으면 누구나 참여하는 임시 방이에요. 끝나면 휘발됩니다.
              통화·화면공유·원격제어가 열리는 곳. (원격제어는 입장과 별개로 매번
              수락 필요)
            </p>
            {chats
              .filter((c) => c.kind === "session")
              .map((c) => (
                <button
                  key={c.id}
                  className={"row" + (c.id === activeId ? " active" : "")}
                  onClick={() => openChat(c.id)}
                >
                  <div className="avatar session">
                    <Hash size={20} />
                  </div>
                  <div className="row-main">
                    <div className="row-top">
                      <span className="row-name">{c.name}</span>
                      {c.dummy && <span className="chip-dummy">dummy</span>}
                      <span className="row-time">{c.time}</span>
                    </div>
                    <div className="row-msg">
                      <span className="expiring">{c.preview}</span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>

        <button className="billing-btn" onClick={() => setBillingOpen(true)}>
          <Receipt size={16} />
          <span>과금 체계</span>
        </button>

        <div className="account">
          <button
            className={
              "account-main" + (rightView === "profile" ? " active" : "")
            }
            onClick={openProfile}
            title="프로필"
          >
            <div className="account-avatar">
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="" />
              ) : (
                <User size={18} />
              )}
            </div>
            <div className="account-info">
              <div className="account-name">
                {savedNick ||
                  user.user_metadata?.full_name ||
                  user.user_metadata?.name ||
                  user.email}
              </div>
              <div className="account-email">{user.email}</div>
            </div>
          </button>
          <button className="logout-btn" title="로그아웃" onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Chat */}
      {rightView === "chat" && active && (
      <main className="chat">
        <header className="chat-header">
          <button
            className="back-btn"
            title="목록으로"
            onClick={() => setMobileChat(false)}
          >
            <ChevronLeft size={22} />
          </button>
          <div className="avatar">
            <User size={22} />
          </div>
          <div className="who">
            <div className="name">
              {active.name}
              {active.kind === "session" && (
                <button
                  className="rename-btn"
                  title="세션 이름 수정"
                  onClick={openRename}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            <div className="status">{active.status}</div>
          </div>
          <div className="actions">
            {activeSessionId && (
              <button
                className="action ping"
                title="연결 테스트 (핑)"
                onClick={sendPing}
              >
                <Radio size={20} />
              </button>
            )}
            <button
              className="action"
              title="통화"
              onClick={() => handleCallButton("통화")}
            >
              <Phone size={20} />
            </button>
          </div>
        </header>

        {active?.kind === "session" && activeSessionId && (
          <div className="session-bar">
            <span className="session-bar-label">세션 ID</span>
            <code className="session-bar-id">{activeSessionId}</code>
            <button
              className="session-bar-copy"
              onClick={copySessionId}
              title="세션 ID 복사"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "복사됨" : "복사"}
            </button>
            <span className="session-bar-hint">
              이 ID를 상대에게 보내 참여시키세요
            </span>
          </div>
        )}

        <div className="thread">
          <div className="day">2주 보관 · 이후 자동 삭제</div>
          {active.messages.map((m) => (
            <div
              key={m.id}
              className={
                "bubble " + m.from + (m.ageDays >= 13 ? " fading" : "")
              }
            >
              {m.text}
              <span className="meta">{m.time}</span>
            </div>
          ))}
        </div>

        <div className="composer">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`${active.name}에게 메시지`}
          />
          <button className="send" onClick={send}>
            전송
          </button>
        </div>
      </main>
      )}

      {/* Empty state — 선택된 대화 없음 */}
      {rightView === "chat" && !active && (
        <main className="chat">
          <div className="empty-chat">
            <p className="empty-title">대화를 선택하세요</p>
            <p className="empty-sub">
              <b>+</b> 로 세션을 만들거나, 상대 닉네임으로 다이렉트를 시작하세요.
            </p>
          </div>
        </main>
      )}

      {/* Profile edit (빈 페이지) */}
      {rightView === "profile" && (
        <main className="chat">
          <header className="chat-header">
            <button
              className="back-btn"
              title="목록으로"
              onClick={() => setMobileChat(false)}
            >
              <ChevronLeft size={22} />
            </button>
            <div className="who">
              <div className="name">프로필</div>
              <div className="status">{user.email}</div>
            </div>
          </header>
          <div className="profile-body">
            <div className="profile-form">
              <label className="profile-label">닉네임</label>

              {savedNick ? (
                <>
                  <div className="nick-locked">
                    <span className="nick-locked-value">{savedNick}</span>
                    <Lock size={15} />
                  </div>
                  <p className="profile-note">
                    닉네임은 한 번 설정하면 <b>변경할 수 없어요.</b>
                  </p>
                </>
              ) : (
                <>
                  <div className="nick-row">
                    <input
                      className="nick-input"
                      value={nick}
                      onChange={(e) => {
                        setNick(e.target.value);
                        setNickMsg(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && saveNick()}
                      placeholder="2~20자"
                      maxLength={20}
                    />
                    <button
                      className="nick-save"
                      onClick={saveNick}
                      disabled={nickSaving || nickStatus !== "available"}
                    >
                      저장
                    </button>
                  </div>
                  {nickStatus !== "idle" && (
                    <p
                      className={
                        "nick-status " +
                        (nickStatus === "available" ? "ok" : "bad")
                      }
                    >
                      {nickStatus === "checking" && "확인 중…"}
                      {nickStatus === "available" && "✓ 사용 가능"}
                      {nickStatus === "taken" && "이미 사용 중이에요"}
                      {nickStatus === "invalid" && "2~20자여야 해요"}
                    </p>
                  )}
                  <p className="profile-note">
                    닉네임을 설정해야 <b>친구를 추가</b>할 수 있어요. 상대가 이
                    닉네임으로 나를 찾습니다. (한 번 정하면 변경 불가)
                  </p>
                  {nickMsg && <p className="nick-msg">{nickMsg}</p>}
                </>
              )}
            </div>
          </div>
        </main>
      )}

      {/* New conversation modal */}
      {newOpen && (
        <div className="overlay" onClick={() => setNewOpen(false)}>
          <div className="modal new-conv" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">새 대화</h3>

            <button className="modal-btn" onClick={createSession}>
              <span className="mb-icon">
                <Hash size={18} />
              </span>
              <span className="mb-text">
                <span className="mb-title">새 세션 만들기</span>
                <span className="mb-desc">
                  세션ID가 생성돼요. 공유하면 누구나 참여할 수 있어요.
                </span>
              </span>
            </button>

            <div className="join-row">
              <input
                className="join-input"
                placeholder="세션 아이디로 참여 (예: 7K2P-9QXM)"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinSession()}
              />
              <button className="join-btn" onClick={joinSession}>
                참여
              </button>
            </div>

            <div className="join-row">
              <input
                className="join-input"
                placeholder="상대 닉네임으로 대화 시작"
                value={directNick}
                onChange={(e) => setDirectNick(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startDirectChat()}
              />
              <button className="join-btn" onClick={startDirectChat}>
                시작
              </button>
            </div>
            {!savedNick && (
              <p className="modal-foot">
                · 다이렉트는 <b>내 닉네임</b>이 있어야 시작할 수 있어요 (프로필에서
                설정).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Rename session modal */}
      {renameOpen && (
        <div className="overlay" onClick={() => setRenameOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">세션 이름</h3>
            <div className="join-row">
              <input
                className="join-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
                placeholder="세션 이름"
                autoFocus
              />
              <button className="join-btn" onClick={saveRename}>
                저장
              </button>
            </div>
            <p className="modal-foot">· 이 이름은 내 목록에만 보이는 라벨이에요.</p>
          </div>
        </div>
      )}

      {/* Billing modal */}
      {billingOpen && (
        <div className="overlay" onClick={() => setBillingOpen(false)}>
          <div className="modal billing" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">과금 체계</h3>
            <p className="modal-sub">모든 기능 10분 무료 · 이후 분당 과금</p>
            <ul className="price-list">
              <li>
                <Phone size={18} />
                <span className="price-name">통화</span>
                <span className="price-val">1원<i>/분</i></span>
              </li>
              <li>
                <Video size={18} />
                <span className="price-name">영상통화</span>
                <span className="price-val">10원<i>/분·인</i></span>
              </li>
              <li>
                <ScreenShare size={18} />
                <span className="price-name">화면 공유</span>
                <span className="price-val">10원<i>/분·인</i></span>
              </li>
              <li>
                <MousePointerClick size={18} />
                <span className="price-name">원격 제어</span>
                <span className="price-val">15원<i>/분·인</i></span>
              </li>
            </ul>
            <p className="modal-foot">· /분·인 = 분당 이용자 1인 기준</p>
          </div>
        </div>
      )}

      {/* Help modal (통화방 사용법) */}
      {helpOpen && (
        <div className="overlay overlay-top" onClick={() => setHelpOpen(false)}>
          <div className="modal help" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">통화방 사용법</h3>
            <p className="modal-sub">
              처음 연결되면 소리·영상·화면공유가 <b>모두 꺼진 상태</b>로
              시작해요. 필요한 것만 켜세요.
            </p>
            <ul className="help-list">
              <li className="help-item">
                <div className="help-head">
                  <span className="help-name">소리</span>
                  <span className="help-icon off">
                    <MicOff size={16} />
                  </span>
                  <span className="help-tag">음소거(기본)</span>
                  <span className="help-arrow">→</span>
                  <span className="help-icon on">
                    <Mic size={16} />
                  </span>
                  <span className="help-tag">켜짐</span>
                </div>
                <p className="help-desc">켜면 내 목소리가 상대에게 전달돼요.</p>
              </li>
              <li className="help-item">
                <div className="help-head">
                  <span className="help-name">영상</span>
                  <span className="help-icon off">
                    <VideoOff size={16} />
                  </span>
                  <span className="help-tag">꺼짐(기본)</span>
                  <span className="help-arrow">→</span>
                  <span className="help-icon on">
                    <Video size={16} />
                  </span>
                  <span className="help-tag">켜짐</span>
                </div>
                <p className="help-desc">켜면 내 카메라 영상이 공유돼요.</p>
              </li>
              <li className="help-item">
                <div className="help-head">
                  <span className="help-name">화면공유</span>
                  <span className="help-icon off">
                    <ScreenShareOff size={16} />
                  </span>
                  <span className="help-tag">꺼짐(기본)</span>
                  <span className="help-arrow">→</span>
                  <span className="help-icon on">
                    <ScreenShare size={16} />
                  </span>
                  <span className="help-tag">켜짐</span>
                </div>
                <p className="help-desc">켜면 내 화면을 상대에게 보여줘요.</p>
              </li>
            </ul>
            <p className="modal-foot">
              · 보더에 색 = 켜짐 / 아이콘에만 색 = 꺼짐
            </p>
          </div>
        </div>
      )}

      {/* Ringing — 세션에 통화가 떠 울리는 중 (비참가자) */}
      {ringing && !inCall && (
        <div className="overlay">
          <div className="incoming" onClick={(e) => e.stopPropagation()}>
            <div className="ring-avatar">
              <span className="ring r1" />
              <span className="ring r2" />
              <div className="avatar big-avatar">
                <Phone size={40} />
              </div>
            </div>
            <h3 className="incoming-name">{active?.name ?? "세션"}</h3>
            <div className="incoming-sub">세션에서 통화가 진행 중…</div>
            <div className="incoming-actions">
              <button className="ic decline" onClick={dismissRing} title="무시">
                <PhoneOff size={26} />
              </button>
              <button className="ic accept" onClick={joinRoom} title="참여">
                <Phone size={26} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 음성 통화방 (참가자 mesh) */}
      {inCall && (
        <div className="overlay">
          <div className="call room" onClick={(e) => e.stopPropagation()}>
            {!adClosed && (
              <div className="ad">
                <button
                  className="ad-close"
                  title="닫기"
                  onClick={() => setAdClosed(true)}
                >
                  <X size={18} />
                </button>
                <div className="ad-body">
                  <p className="ad-text">여기에 광고가 표시됩니다.</p>
                  <button className="ad-cta">광고 문의</button>
                </div>
              </div>
            )}
            <button
              className="room-help"
              title="사용법"
              onClick={() => setHelpOpen(true)}
            >
              <HelpCircle size={20} />
            </button>

            <span className="kind">
              통화방 · {active?.name} · {remotePeers.length + 1}명
            </span>

            <div className="grid">
              <MediaTile stream={localStream} label={selfName} self />
              {remotePeers.map((p) => (
                <MediaTile
                  key={p.id}
                  stream={p.stream}
                  label={
                    p.name +
                    (p.state === "connected"
                      ? ""
                      : p.state === "failed"
                      ? " · 실패"
                      : " · 연결 중…")
                  }
                />
              ))}
            </div>

            <div className="call-controls">
              <button
                className={"cc " + (muted ? "off" : "on")}
                onClick={toggleMute}
                title={muted ? "음소거 해제" : "음소거"}
              >
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <button
                className={"cc " + (camOn ? "on" : "off")}
                title={camOn ? "영상 끄기" : "영상 켜기"}
                onClick={toggleCamera}
              >
                {camOn ? <Video size={22} /> : <VideoOff size={22} />}
              </button>
              <button
                className={"cc " + (sharing ? "on" : "off")}
                title={sharing ? "화면공유 중지" : "화면 공유"}
                onClick={() => (sharing ? stopShare() : startShare())}
              >
                {sharing ? (
                  <ScreenShare size={22} />
                ) : (
                  <ScreenShareOff size={22} />
                )}
              </button>
              {/* 원격 제어 — 추후 구현, 일단 보류
              <button
                className="cc off dummy-action"
                title="원격 제어 (준비 중)"
                onClick={() => setToast("원격제어 — 준비 중")}
              >
                <MousePointerBan size={22} />
                <span className="action-dummy">dummy</span>
              </button>
              */}
              <button className="cc end" onClick={leaveRoom} title="나가기">
                <PhoneOff size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 목업 오버레이 (영상·화면공유·원격제어, 비세션 통화) */}
      {call && (
        <div className="overlay" onClick={closeMock}>
          <div className="call" onClick={(e) => e.stopPropagation()}>
            {!adClosed && (
              <div className="ad">
                <button
                  className="ad-close"
                  title="닫기"
                  onClick={() => setAdClosed(true)}
                >
                  <X size={18} />
                </button>
                <div className="ad-body">
                  <p className="ad-text">여기에 광고가 표시됩니다.</p>
                  <button className="ad-cta">광고 문의</button>
                </div>
              </div>
            )}
            <div className="stage">
              <span className="kind">{call}</span>

              {call === "통화" && (
                <div className="avatar big-avatar">
                  <User size={44} />
                </div>
              )}

              {call === "영상통화" && (
                <>
                  <div className="avatar big-avatar">
                    <User size={44} />
                  </div>
                  <div className="self-cam">내 화면</div>
                </>
              )}

              {(call === "화면 공유" || call === "원격 제어") && (
                <>
                  <div className="share-frame">
                    {active?.name ?? "상대"}의 화면
                    {call === "원격 제어" && " · 제어 중"}
                  </div>
                  <div className="self-cam">
                    {call === "원격 제어" ? "내 마우스" : "내 화면"}
                  </div>
                </>
              )}
            </div>

            <h3>{active?.name ?? ""}</h3>
            <div className="timer">{call} · 00:04</div>

            <div className="call-controls">
              <button
                className={"cc " + (muted ? "off" : "on")}
                onClick={() => setMuted((m) => !m)}
                title={muted ? "음소거 해제" : "음소거"}
              >
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <button className="cc end" onClick={closeMock} title="종료">
                <PhoneOff size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signaling test toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
