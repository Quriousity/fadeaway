"use client";

import { useState } from "react";
import { conversations as seed, type Message } from "./data";
import {
  Phone,
  Video,
  ScreenShare,
  MousePointerClick,
  Mic,
  PhoneOff,
  User,
  Plus,
  AtSign,
  Hash,
  Receipt,
  X,
} from "lucide-react";

type CallKind = "통화" | "영상통화" | "화면 공유" | "원격 제어";

export default function Home() {
  const [chats, setChats] = useState(seed);
  const [activeId, setActiveId] = useState(seed[0].id);
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallKind | null>(null);
  const [muted, setMuted] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [adClosed, setAdClosed] = useState(false);

  const openCall = (kind: CallKind) => {
    setAdClosed(false);
    setCall(kind);
  };

  const active = chats.find((c) => c.id === activeId)!;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
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
    setDraft("");
  };

  return (
    <div className="app">
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

        <div className="search">
          <input placeholder="대화 검색" />
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
                  onClick={() => setActiveId(c.id)}
                >
                  <div className="avatar">
                    <User size={22} />
                  </div>
                  <div className="row-main">
                    <div className="row-top">
                      <span className="row-name">{c.name}</span>
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
                  onClick={() => setActiveId(c.id)}
                >
                  <div className="avatar session">
                    <Hash size={20} />
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
              ))}
          </div>
        </div>

        <button className="billing-btn" onClick={() => setBillingOpen(true)}>
          <Receipt size={16} />
          <span>과금 체계</span>
        </button>
      </aside>

      {/* Chat */}
      <main className="chat">
        <header className="chat-header">
          <div className="avatar">
            <User size={22} />
          </div>
          <div className="who">
            <div className="name">{active.name}</div>
            <div className="status">{active.status}</div>
          </div>
          <div className="actions">
            <button className="action" title="통화" onClick={() => openCall("통화")}>
              <Phone size={20} />
            </button>
            <button className="action" title="영상통화" onClick={() => openCall("영상통화")}>
              <Video size={20} />
            </button>
            <button className="action" title="화면 공유" onClick={() => openCall("화면 공유")}>
              <ScreenShare size={20} />
            </button>
            <button className="action" title="원격 제어" onClick={() => openCall("원격 제어")}>
              <MousePointerClick size={20} />
            </button>
          </div>
        </header>

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

      {/* New conversation modal (empty) */}
      {newOpen && (
        <div className="overlay" onClick={() => setNewOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-btn">상대방의 아이디로 대화 시작</button>
            <button className="modal-btn">상대방의 세션 아이디로 세션에 참여</button>
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

      {/* Call / share / remote overlay */}
      {call && (
        <div className="overlay" onClick={() => setCall(null)}>
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
                    {active.name}의 화면
                    {call === "원격 제어" && " · 제어 중"}
                  </div>
                  <div className="self-cam">
                    {call === "원격 제어" ? "내 마우스" : "내 화면"}
                  </div>
                </>
              )}
            </div>

            <h3>{active.name}</h3>
            <div className="timer">{call} · 00:04</div>

            <div className="call-controls">
              <button
                className={"cc" + (muted ? " active" : "")}
                onClick={() => setMuted((m) => !m)}
                title="음소거"
              >
                <Mic size={22} />
              </button>
              <button className="cc end" onClick={() => setCall(null)} title="종료">
                <PhoneOff size={22} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
