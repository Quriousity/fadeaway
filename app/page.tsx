"use client";

import { useState, useEffect, useRef } from "react";
import type { Chat, Message } from "./data";
import {
  Phone,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Mic,
  MicOff,
  PhoneOff,
  User,
  UserPlus,
  Receipt,
  LogOut,
  ChevronLeft,
  Pencil,
  HelpCircle,
  X,
} from "lucide-react";
import { useAuth } from "./components/AuthGate";
import { useMyId, IdSetup } from "./components/IdGate";
import { findUserByNickname, startDirect, listMyDirects } from "./lib/directs";
import {
  loadMessages,
  sendMessage,
  sendAttachmentMessage,
  type ChatMsg,
} from "./lib/messages";
import { uploadAttachment, type AttachKind } from "./lib/attachments";
import { openSignaling } from "./lib/signaling";
import { createCallRoom, type CallRoom, type RemotePeer } from "./lib/callroom";
import MediaTile from "./components/MediaTile";
import Composer from "./components/Composer";
import Attachment from "./components/Attachment";

/** DB 메시지 → 화면용 Message */
function toMessage(m: ChatMsg, selfId: string): Message {
  const created = new Date(m.created_at);
  return {
    id: m.id,
    from: m.sender === selfId ? "me" : "them",
    text: m.body ?? "",
    time: created.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    }),
    ageDays: Math.floor((Date.now() - created.getTime()) / 86400000),
    kind: m.kind ?? "text",
    path: m.path,
    fileName: m.file_name,
    mime: m.mime,
    byteSize: m.byte_size,
    durationMs: m.duration_ms,
  };
}

/** 브로드캐스트 payload → 화면용 Message (상대가 보낸 것) */
function fromPayload(d: any): Message {
  return {
    id: d?.id ?? Math.random().toString(36).slice(2),
    from: "them",
    text: d?.body ?? "",
    time: "방금",
    ageDays: 0,
    kind: d?.kind ?? "text",
    path: d?.path ?? null,
    fileName: d?.file_name ?? null,
    mime: d?.mime ?? null,
    byteSize: d?.byte_size ?? null,
    durationMs: d?.duration_ms ?? null,
  };
}

/** 목록 미리보기 — 첨부는 텍스트가 없으니 종류로 대체 */
function previewOf(m: Message) {
  if (!m.kind || m.kind === "text") return m.text;
  if (m.text) return m.text;
  return m.kind === "image" ? "📷 사진" : m.kind === "audio" ? "🎤 음성" : "📎 파일";
}

export default function Home() {
  const { user, signOut } = useAuth();
  const { myId, changeId } = useMyId();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [friendInput, setFriendInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [idEditOpen, setIdEditOpen] = useState(false);

  // 통화방 상태
  const [inCall, setInCall] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [ringing, setRinging] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(true); // 기본 음소거
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);

  const active = chats.find((c) => c.id === activeId) ?? null;
  const channel = active?.id ?? null;

  // 이 탭의 고유 피어 ID (같은 계정 여러 탭도 구분)
  const clientIdRef = useRef("");
  if (!clientIdRef.current)
    clientIdRef.current =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const sigRef = useRef<ReturnType<typeof openSignaling> | null>(null);
  const roomRef = useRef<CallRoom | null>(null);
  const ringDismissedRef = useRef(false);
  const activeCallersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (id: string, fn: (c: Chat) => Chat) =>
    setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  // 친구 목록 로드
  useEffect(() => {
    listMyDirects().then((ds) =>
      setChats(
        ds.map((d) => ({
          id: d.id,
          name: d.otherNick,
          otherId: d.otherId,
          preview: "대화를 시작하세요",
          time: "",
          messages: [],
        }))
      )
    );
  }, []);

  // 활성 대화의 시그널링 채널 + 통화방
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
    if (!channel) return;

    const myPeerId = clientIdRef.current;

    const sig = openSignaling(channel, myPeerId, async (s) => {
      if (s.to && s.to !== myPeerId) return;

      if (s.event === "chat") {
        if (!s.data) return;
        const incoming = fromPayload(s.data);
        const isText = !incoming.kind || incoming.kind === "text";
        if (isText && !incoming.text) return;
        patch(channel, (c) => ({
          ...c,
          messages: [...c.messages, incoming],
          preview: previewOf(incoming),
          time: "방금",
        }));
        return;
      }

      // 통화 울림 추적 — call-join/leave 는 비참가자도 본다
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

    loadMessages(channel).then((msgs) =>
      patch(channel, (c) => ({
        ...c,
        messages: msgs.map((m) => toMessage(m, user.id)),
      }))
    );

    roomRef.current = createCallRoom({
      selfId: myPeerId,
      selfName: myId,
      send: (event, data, to) => sig.send(event, data, to),
      onChange: setRemotePeers,
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
  }, [channel, user.id]);

  // ---- 친구 추가 ----------------------------------------------------------
  const addFriend = async () => {
    const target = friendInput.trim();
    if (!target || adding) return;
    if (target === myId) return setToast("자기 아이디예요");

    setAdding(true);
    const found = await findUserByNickname(target);
    if (!found) {
      setAdding(false);
      return setToast(`'${target}' 아이디를 쓰는 사람이 없어요`);
    }

    const existing = chats.find((c) => c.otherId === found.id);
    if (existing) {
      setAdding(false);
      setFriendInput("");
      return openChat(existing.id);
    }

    const d = await startDirect(found.id);
    setAdding(false);
    if (!d) return setToast("친구 추가에 실패했어요");

    const chat: Chat = {
      id: d.id,
      name: found.nickname,
      otherId: found.id,
      preview: "대화를 시작하세요",
      time: "",
      messages: [],
    };
    setChats((cs) => (cs.some((c) => c.id === d.id) ? cs : [chat, ...cs]));
    setFriendInput("");
    openChat(d.id);
    setToast(`${found.nickname} 추가됨`);
  };

  const openChat = (id: string) => {
    setActiveId(id);
    setMobileChat(true);
  };

  // ---- 메시지 -------------------------------------------------------------
  const sendText = (text: string) => {
    if (!channel) return;
    const msg: Message = {
      id: Math.random().toString(36).slice(2),
      from: "me",
      text,
      time: "방금",
      ageDays: 0,
      kind: "text",
    };
    patch(channel, (c) => ({
      ...c,
      messages: [...c.messages, msg],
      preview: text,
      time: "방금",
    }));
    sigRef.current?.send("chat", { body: text, kind: "text" });
    sendMessage(channel, text);
  };

  /** 첨부 — 낙관적 표시 → 업로드 → DB 저장 → 브로드캐스트 */
  const sendFile = async (
    file: Blob,
    name: string,
    kind: AttachKind,
    durationMs?: number
  ) => {
    const chan = channel;
    if (!chan) return;

    const tempId = "up_" + Math.random().toString(36).slice(2);
    const localUrl = kind === "file" ? null : URL.createObjectURL(file);
    const temp: Message = {
      id: tempId,
      from: "me",
      text: "",
      time: "방금",
      ageDays: 0,
      kind,
      path: null,
      fileName: name,
      mime: file.type || null,
      byteSize: file.size,
      durationMs: durationMs ?? null,
      pending: true,
      localUrl,
    };
    patch(chan, (c) => ({
      ...c,
      messages: [...c.messages, temp],
      preview: previewOf(temp),
      time: "방금",
    }));

    const drop = (why: string) => {
      if (localUrl) URL.revokeObjectURL(localUrl);
      patch(chan, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== tempId),
      }));
      setToast(why);
    };

    const up = await uploadAttachment(chan, file, { name, kind, durationMs });
    if (!up.ok) return drop(up.error);

    const row = await sendAttachmentMessage(chan, up.attachment);
    if (!row) return drop("전송 실패 — 잠시 후 다시 시도해주세요");

    const saved = toMessage(row, user.id);
    saved.localUrl = localUrl; // 방금 올린 건 서명 URL 왕복 없이 로컬 것으로
    patch(chan, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === tempId ? saved : m)),
    }));

    sigRef.current?.send("chat", {
      id: row.id,
      body: row.body,
      kind: row.kind,
      path: row.path,
      file_name: row.file_name,
      mime: row.mime,
      byte_size: row.byte_size,
      duration_ms: row.duration_ms,
    });
  };

  // ---- 통화 ---------------------------------------------------------------
  const joinRoom = async () => {
    if (!roomRef.current || inCall) return;
    setRinging(false);
    ringDismissedRef.current = false;
    try {
      await roomRef.current.join();
      roomRef.current.setMuted(muted);
      setInCall(true);
    } catch {
      setToast("마이크 권한이 필요해요");
    }
  };

  const leaveRoom = () => {
    roomRef.current?.leave();
    setInCall(false);
    setRemotePeers([]);
    setLocalStream(null);
    setCamOn(false);
    setSharing(false);
    setMuted(true);
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    roomRef.current?.setMuted(m);
  };

  const toggleCamera = async () => {
    try {
      await roomRef.current?.toggleCamera();
    } catch {
      setToast("카메라 권한이 필요해요");
    }
  };

  const toggleShare = async () => {
    if (sharing) return roomRef.current?.stopScreen();
    try {
      await roomRef.current?.startScreen();
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") setToast("화면공유 오류");
    }
  };

  // ---- 렌더 ---------------------------------------------------------------
  if (idEditOpen) {
    return (
      <IdSetup
        current={myId}
        onCancel={() => setIdEditOpen(false)}
        onDone={async (v) => {
          await changeId(v);
          setIdEditOpen(false);
          setToast("아이디를 바꿨어요");
        }}
      />
    );
  }

  return (
    <div className={"app" + (mobileChat ? " mobile-chat" : "")}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.svg" alt="Fadeaway" />
          <h1>Fadeaway</h1>
        </div>

        <div className="retention">
          모든 메시지는 <b>2주</b> 뒤 자동으로 사라집니다.
        </div>

        <div className="add-friend">
          <UserPlus size={16} />
          <input
            value={friendInput}
            onChange={(e) => setFriendInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFriend()}
            placeholder="친구 아이디 입력"
          />
          <button onClick={addFriend} disabled={adding || !friendInput.trim()}>
            {adding ? "…" : "추가"}
          </button>
        </div>

        <div className="list">
          {chats.length === 0 ? (
            <p className="list-empty">
              아직 친구가 없어요.
              <br />위에 상대 <b>아이디</b>를 넣고 추가하면 바로 대화할 수 있어요.
            </p>
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                className={"row" + (c.id === activeId ? " active" : "")}
                onClick={() => openChat(c.id)}
              >
                <div className="avatar">
                  <User size={20} />
                </div>
                <div className="row-main">
                  <div className="row-top">
                    <span className="row-name">{c.name}</span>
                    <span className="row-time">{c.time}</span>
                  </div>
                  <div className="row-msg">
                    <span className="expiring">{c.preview}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <button className="billing-btn" onClick={() => setBillingOpen(true)}>
          <Receipt size={16} />
          <span>과금 체계</span>
        </button>

        <div className="account">
          <button
            className="account-main"
            onClick={() => setIdEditOpen(true)}
            title="아이디 변경"
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
                {myId}
                <Pencil size={12} />
              </div>
              <div className="account-email">{user.email}</div>
            </div>
          </button>
          <button className="logout-btn" title="로그아웃" onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {active ? (
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
              <div className="name">{active.name}</div>
              <div className="status">
                {ringing ? "통화 중 — 눌러서 참여" : "2주 뒤 사라지는 대화"}
              </div>
            </div>
            <div className="actions">
              <button
                className={"action" + (ringing ? " ringing" : "")}
                title="통화"
                onClick={joinRoom}
              >
                <Phone size={20} />
              </button>
            </div>
          </header>

          <div className="thread">
            <div className="day">2주 보관 · 이후 자동 삭제</div>
            {active.messages.map((m) => (
              <div
                key={m.id}
                className={
                  "bubble " +
                  m.from +
                  (m.ageDays >= 13 ? " fading" : "") +
                  (m.kind && m.kind !== "text" ? " with-att" : "")
                }
              >
                {m.kind && m.kind !== "text" && <Attachment msg={m} />}
                {m.text && <span className="bubble-text">{m.text}</span>}
                <span className="meta">{m.time}</span>
              </div>
            ))}
          </div>

          <Composer
            key={active.id}
            placeholder={`${active.name}에게 메시지`}
            canAttach
            onSendText={sendText}
            onSendFile={sendFile}
            onError={setToast}
          />
        </main>
      ) : (
        <main className="chat">
          <div className="empty-chat">
            <p className="empty-title">
              {chats.length ? "대화를 선택하세요" : "친구를 추가하세요"}
            </p>
            <p className="empty-sub">
              내 아이디는 <b>{myId}</b> 입니다. 친구에게 알려주세요.
            </p>
          </div>
        </main>
      )}

      {/* 통화방 */}
      {inCall && (
        <div className="overlay">
          <div className="call room" onClick={(e) => e.stopPropagation()}>
            <button
              className="room-help"
              title="사용법"
              onClick={() => setHelpOpen(true)}
            >
              <HelpCircle size={20} />
            </button>

            <span className="kind">
              {active?.name} · {remotePeers.length + 1}명
            </span>

            <div className="grid">
              <MediaTile stream={localStream} label={myId} self />
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
                onClick={toggleShare}
              >
                {sharing ? (
                  <ScreenShare size={22} />
                ) : (
                  <ScreenShareOff size={22} />
                )}
              </button>
              <button className="cc end" onClick={leaveRoom} title="나가기">
                <PhoneOff size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="overlay" onClick={() => setHelpOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">통화 사용법</h3>
            <ul className="help-list">
              <li>기본은 음소거예요. 마이크를 눌러 해제하세요.</li>
              <li>카메라와 화면공유는 동시에 못 켜요 — 누르면 서로 바뀝니다.</li>
              <li>나가도 남은 사람들 통화는 계속됩니다.</li>
            </ul>
            <button className="join-btn" onClick={() => setHelpOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {billingOpen && (
        <div className="overlay" onClick={() => setBillingOpen(false)}>
          <div className="modal billing" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setBillingOpen(false)}
            >
              <X size={18} />
            </button>
            <h3 className="modal-title">과금 체계</h3>
            <p className="modal-sub">
              지금은 <b>전부 무료</b>예요. 아래는 상용화 시 적용할 계획입니다.
            </p>
            <ul className="price-list">
              <li>
                <Phone size={18} />
                <span className="price-name">통화</span>
                <span className="price-val">
                  1원<i>/분</i>
                </span>
              </li>
              <li>
                <Video size={18} />
                <span className="price-name">영상통화</span>
                <span className="price-val">
                  10원<i>/분·인</i>
                </span>
              </li>
              <li>
                <ScreenShare size={18} />
                <span className="price-name">화면 공유</span>
                <span className="price-val">
                  10원<i>/분·인</i>
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
