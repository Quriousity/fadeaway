import { createPeer, type Peer } from "./webrtc";
import type { Signal } from "./signaling";

/**
 * 세션당 통화방 1개 (mesh + perfect negotiation).
 *  - 마이크는 항상, 영상 소스는 1개(카메라 또는 화면공유 — 상호배타)
 *  - 카메라↔화면 전환은 replaceTrack(재협상 없음), 켜기/끄기는 add/removeTrack(재협상)
 *  - leave(): 내 연결만 닫고 call-leave — 남은 사람 연결은 유지
 */

export type VideoKind = "camera" | "screen" | null;

export type RemotePeer = {
  id: string;
  name: string;
  stream: MediaStream | null;
  state: RTCPeerConnectionState;
};

type Send = (event: string, data: any, to?: string) => void;

export function createCallRoom(opts: {
  selfId: string;
  selfName: string;
  send: Send;
  onChange: (peers: RemotePeer[]) => void;
  onLocal: (stream: MediaStream | null, video: VideoKind) => void;
}) {
  const peers = new Map<string, { peer: Peer; info: RemotePeer }>();
  const names = new Map<string, string>();
  let localStream: MediaStream | null = null;
  let micTrack: MediaStreamTrack | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  let videoKind: VideoKind = null;
  let inCall = false;
  let muted = true; // 기본 음소거

  const emit = () =>
    opts.onChange([...peers.values()].map((p) => ({ ...p.info })));
  const emitLocal = () => opts.onLocal(localStream, videoKind);

  const ensureMic = async () => {
    if (!localStream) localStream = new MediaStream();
    if (!micTrack) {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      micTrack = s.getAudioTracks()[0];
      micTrack.enabled = !muted;
      localStream.addTrack(micTrack);
      emitLocal();
    }
  };

  const ensurePeer = (remoteId: string) => {
    if (peers.has(remoteId)) return;
    const info: RemotePeer = {
      id: remoteId,
      name: names.get(remoteId) ?? "참가자",
      stream: null,
      state: "new",
    };
    const peer = createPeer({
      polite: opts.selfId > remoteId, // ID 큰 쪽이 polite
      send: (event, data) => opts.send(event, data, remoteId),
      onRemoteStream: (stream) => {
        info.stream = stream;
        emit();
      },
      onState: (st) => {
        info.state = st;
        if (st === "failed") {
          peer.close();
          peers.delete(remoteId);
        }
        emit();
      },
    });
    peers.set(remoteId, { peer, info });
    if (micTrack) peer.pc.addTrack(micTrack, localStream!);
    if (videoTrack) peer.pc.addTrack(videoTrack, localStream!);
    emit();
  };

  // 영상 소스 교체/추가. 기존 트랙 있으면 replaceTrack(매끄럽게), 없으면 addTrack(재협상)
  const setVideoTrack = (track: MediaStreamTrack, kind: VideoKind) => {
    const old = videoTrack;
    if (old) {
      peers.forEach((p) => {
        const sender = p.peer.pc.getSenders().find((s) => s.track === old);
        sender?.replaceTrack(track);
      });
      localStream?.removeTrack(old);
      old.stop();
      localStream?.addTrack(track);
    } else {
      localStream?.addTrack(track);
      peers.forEach((p) => p.peer.pc.addTrack(track, localStream!));
    }
    videoTrack = track;
    videoKind = kind;
    // 사용자가 브라우저 "공유 중지" 누르거나 트랙 종료 시
    track.onended = () => stopVideo();
    emitLocal();
  };

  const stopVideo = () => {
    if (!videoTrack) return;
    peers.forEach((p) => {
      const sender = p.peer.pc.getSenders().find((s) => s.track === videoTrack);
      if (sender) p.peer.pc.removeTrack(sender);
    });
    localStream?.removeTrack(videoTrack);
    videoTrack.stop();
    videoTrack = null;
    videoKind = null;
    emitLocal();
  };

  return {
    isActive: () => inCall,
    count: () => peers.size,
    videoKind: () => videoKind,

    async join() {
      if (inCall) return;
      await ensureMic();
      inCall = true;
      opts.send("call-join", { name: opts.selfName });
    },

    leave() {
      if (!inCall) return;
      inCall = false;
      opts.send("call-leave", { name: opts.selfName });
      peers.forEach((p) => p.peer.close());
      peers.clear();
      names.clear();
      videoTrack?.stop();
      micTrack?.stop();
      localStream?.getTracks().forEach((t) => t.stop());
      localStream = null;
      micTrack = null;
      videoTrack = null;
      videoKind = null;
      emit();
      emitLocal();
    },

    setMuted(m: boolean) {
      muted = m;
      if (micTrack) micTrack.enabled = !m;
    },

    // 카메라 토글. 이미 카메라면 끄고, 아니면 켬(화면공유 중이면 카메라로 교체)
    async toggleCamera() {
      if (!inCall) return;
      if (videoKind === "camera") {
        stopVideo();
        return;
      }
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      setVideoTrack(s.getVideoTracks()[0], "camera");
    },

    // 화면공유 시작 — 네이티브 선택창이 탭/창/전체화면을 다 처리
    async startScreen() {
      if (!inCall) return;
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      setVideoTrack(s.getVideoTracks()[0], "screen");
    },

    stopScreen() {
      if (videoKind === "screen") stopVideo();
    },

    async handleSignal(s: Signal) {
      const from = s.from;
      if (s.data?.name) names.set(from, s.data.name);

      if (s.event === "call-join") {
        if (!inCall) return;
        opts.send("call-here", { name: opts.selfName }, from);
        ensurePeer(from);
      } else if (s.event === "call-here") {
        if (!inCall) return;
        ensurePeer(from);
      } else if (s.event === "call-leave") {
        const p = peers.get(from);
        if (p) {
          p.peer.close();
          peers.delete(from);
          emit();
        }
      } else if (s.event === "desc") {
        if (!inCall) return;
        ensurePeer(from);
        const e = peers.get(from);
        if (e) {
          if (names.get(from)) e.info.name = names.get(from)!;
          await e.peer.handleDesc(s.data);
          emit();
        }
      } else if (s.event === "ice") {
        await peers.get(from)?.peer.handleIce(s.data);
      }
    },
  };
}

export type CallRoom = ReturnType<typeof createCallRoom>;
