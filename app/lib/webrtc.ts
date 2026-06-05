/**
 * 단일 상대와의 WebRTC 연결 1개 (perfect negotiation).
 *
 * 통화 중 트랙을 추가/제거(카메라 켜기, 화면공유)하면 재협상이 필요하다.
 * 양쪽이 동시에 재협상을 시도하면 충돌(glare)이 나는데, polite/impolite 규칙으로
 * 안전하게 수렴시킨다 — impolite 쪽이 충돌 시 상대 offer를 무시하고 자기 것을 밀어붙임.
 *
 * desc 이벤트 하나로 offer/answer를 모두 실어 나른다(setLocalDescription 무인자 API).
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type Peer = {
  pc: RTCPeerConnection;
  handleDesc: (desc: RTCSessionDescriptionInit) => Promise<void>;
  handleIce: (cand: RTCIceCandidateInit) => Promise<void>;
  close: () => void;
};

export function createPeer(opts: {
  polite: boolean;
  send: (event: string, data: any) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: RTCPeerConnectionState) => void;
}): Peer {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  let makingOffer = false;
  let ignoreOffer = false;

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      await pc.setLocalDescription(); // 무인자 → 적절히 offer 생성
      opts.send("desc", pc.localDescription);
    } catch (e) {
      console.error("[webrtc] negotiation 실패", e);
    } finally {
      makingOffer = false;
    }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) opts.send("ice", candidate.toJSON());
  };
  pc.ontrack = (e) => {
    if (e.streams[0]) opts.onRemoteStream(e.streams[0]);
  };
  pc.onconnectionstatechange = () => opts.onState(pc.connectionState);

  return {
    pc,
    async handleDesc(desc) {
      const offerCollision =
        desc.type === "offer" &&
        (makingOffer || pc.signalingState !== "stable");
      ignoreOffer = !opts.polite && offerCollision;
      if (ignoreOffer) return; // impolite: 충돌 시 내 offer 우선

      await pc.setRemoteDescription(desc);
      if (desc.type === "offer") {
        await pc.setLocalDescription(); // 무인자 → answer 생성
        opts.send("desc", pc.localDescription);
      }
    },
    async handleIce(cand) {
      try {
        await pc.addIceCandidate(cand);
      } catch (e) {
        if (!ignoreOffer) console.error("[webrtc] ICE 실패", e);
      }
    },
    close() {
      pc.onnegotiationneeded = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    },
  };
}
