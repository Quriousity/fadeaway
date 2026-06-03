"use client";

import { useState } from "react";
import { conversations as seed, type Message } from "./data";
import { Phone, Video, Screen, Remote, Mic, Hang } from "./icons";

type CallKind = "통화" | "영상통화" | "화면 공유" | "원격 제어";

export default function Home() {
  const [chats, setChats] = useState(seed);
  const [activeId, setActiveId] = useState(seed[0].id);
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallKind | null>(null);
  const [muted, setMuted] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

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
            +
          </button>
        </div>

        <div className="retention">
          모든 데이터는 <b>2주</b> 뒤 자동으로 사라집니다.
        </div>

        <div className="search">
          <input placeholder="대화 검색" />
        </div>

        <div className="list">
          {chats.map((c) => (
            <button
              key={c.id}
              className={"row" + (c.id === activeId ? " active" : "")}
              onClick={() => setActiveId(c.id)}
            >
              <div className="avatar">{c.initials}</div>
              <div className="row-main">
                <div className="row-top">
                  <span className="row-name">{c.name}</span>
                  <span className="row-time">{c.time}</span>
                </div>
                <div className="row-msg">
                  <span className={c.id === "c3" ? "expiring" : ""}>
                    {c.preview}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <main className="chat">
        <header className="chat-header">
          <div className="avatar">{active.initials}</div>
          <div className="who">
            <div className="name">{active.name}</div>
            <div className="status">{active.status}</div>
          </div>
          <div className="actions">
            <button className="action" title="통화" onClick={() => setCall("통화")}>
              <Phone />
            </button>
            <button className="action" title="영상통화" onClick={() => setCall("영상통화")}>
              <Video />
            </button>
            <button className="action" title="화면 공유" onClick={() => setCall("화면 공유")}>
              <Screen />
            </button>
            <button className="action" title="원격 제어" onClick={() => setCall("원격 제어")}>
              <Remote />
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

      {/* Call / share / remote overlay */}
      {call && (
        <div className="overlay" onClick={() => setCall(null)}>
          <div className="call" onClick={(e) => e.stopPropagation()}>
            <div className="stage">
              <span className="kind">{call}</span>

              {call === "통화" && <div className="avatar big-avatar">{active.initials}</div>}

              {call === "영상통화" && (
                <>
                  <div className="avatar big-avatar">{active.initials}</div>
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
                <Mic />
              </button>
              <button className="cc end" onClick={() => setCall(null)} title="종료">
                <Hang />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
