/* ==========================================================================
   VYRONIX LABS - DEVS INTERVIEW WEBRTC SERVICE
   Multi-Viewer Dual-Stream (Webcam & Screen Capture) Cloud Firestore Signaling
   ========================================================================== */

class WebRTCService {
  constructor() {
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ]
    };

    // Candidate maintains a Map of RTCPeerConnections (viewerPeerId -> RTCPeerConnection)
    // Viewer maintains a single RTCPeerConnection
    this.peerConnections = new Map();
    this.peerConnection = null;

    this.webcamStream = null;
    this.screenStream = null;
    this.remoteWebcamStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
    this.expectedWebcamStreamId = null;
    this.expectedScreenStreamId = null;

    this.signalingChannel = null;
    this.firestoreUnsub = null;
    this.processedSignals = new Set();

    this.peerId = 'peer-' + Math.random().toString(36).substr(2, 9);
    this.role = null;
    this.roomId = null;

    // Callbacks
    this.onRemoteStreamsReady = null;
    this.onConnectionStateChange = null;
    this.onTrackEnded = null;
  }

  initSignaling(roomId) {
    // Clean up any previous listeners first
    this.teardownSignaling();
    this.roomId = roomId;
    this.processedSignals.clear();

    const handleMessage = async (msg) => {
      if (!msg || msg.senderPeerId === this.peerId) return;
      if (msg.targetPeerId && msg.targetPeerId !== this.peerId) return;
      if (msg.role === this.role) return;

      const sigKey = msg.sigId || `${msg.senderPeerId}-${msg.type}-${msg.timestamp}`;
      if (this.processedSignals.has(sigKey)) return;
      this.processedSignals.add(sigKey);

      try {
        if (msg.type === 'viewer-ready' && this.role === 'candidate') {
          await this.createOfferForViewer(msg.senderPeerId);
        } else if (msg.type === 'candidate-ready' && this.role === 'interviewer') {
          this.sendSignal('viewer-ready', {}, msg.senderPeerId);
        } else if (msg.type === 'offer' && this.role === 'interviewer') {
          await this.handleOffer(msg);
        } else if (msg.type === 'answer' && this.role === 'candidate') {
          await this.handleAnswer(msg.senderPeerId, msg.sdp);
        } else if (msg.type === 'candidate') {
          await this.handleCandidate(msg.senderPeerId, msg.candidate);
        } else if (msg.type === 'stream-stopped') {
          if (this.onTrackEnded) this.onTrackEnded(msg.kind);
        }
      } catch (e) {
        console.warn('[WebRTC] Signaling handler notice:', e.message);
      }
    };

    // 1. Local BroadcastChannel (for same-browser multi-tab sync)
    try {
      this.signalingChannel = new BroadcastChannel(`vyronix_webrtc_${roomId}`);
      this.signalingChannel.onmessage = (event) => handleMessage(event.data);
    } catch (e) {}

    // 2. Cloud Firestore Real-time Signaling (cross-network)
    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        const startTime = Date.now() - 8000;
        this.firestoreUnsub = window.firebaseServices.firestore
          .collection('webrtcRooms')
          .doc(roomId)
          .collection('signals')
          .where('timestamp', '>=', startTime)
          .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                if (data) {
                  data.sigId = change.doc.id;
                  handleMessage(data);
                }
              }
            });
          }, (err) => {
            console.warn('[WebRTC] Firestore signaling listener notice:', err.message);
          });
      } catch (err) {
        console.warn('[WebRTC] Firestore signaling init warning:', err.message);
      }
    }
  }

  teardownSignaling() {
    if (this.firestoreUnsub) {
      try { this.firestoreUnsub(); } catch (e) {}
      this.firestoreUnsub = null;
    }
    if (this.signalingChannel) {
      try { this.signalingChannel.close(); } catch (e) {}
      this.signalingChannel = null;
    }
  }

  sendSignal(type, data = {}, targetPeerId = null) {
    const payload = {
      type,
      role: this.role,
      roomId: this.roomId,
      senderPeerId: this.peerId,
      targetPeerId: targetPeerId || null,
      timestamp: Date.now(),
      sigId: `${this.peerId}-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      ...data
    };

    if (this.signalingChannel) {
      try {
        this.signalingChannel.postMessage(payload);
      } catch (e) {}
    }

    if (window.firebaseServices && window.firebaseServices.firestore && this.roomId) {
      try {
        window.firebaseServices.firestore
          .collection('webrtcRooms')
          .doc(this.roomId)
          .collection('signals')
          .doc(payload.sigId)
          .set(payload)
          .catch(() => {});
      } catch (err) {}
    }
  }

  // Candidate Setup: Capture Webcam + Screen respecting settings & browser capabilities
  async startCandidateMedia(settings = {}) {
    this.role = 'candidate';
    const requireWebcam = settings.requireWebcam !== false;
    const requireScreenShare = settings.requireScreenShare !== false;

    // 1. Webcam + Microphone
    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
      });
    } catch (e) {
      console.warn('[WebRTC] Webcam access rejected or unavailable:', e.message);
      if (requireWebcam) {
        throw new Error('Camera and Microphone access required to proceed.');
      }
    }

    // 2. Screen Share (gracefully skip if mobile browser doesn't support getDisplayMedia)
    const canDisplayMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
    if (canDisplayMedia) {
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor' },
          audio: false
        });

        const screenTrack = this.screenStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => {
            this.sendSignal('stream-stopped', { kind: 'screen' });
            if (this.onTrackEnded) this.onTrackEnded('screen');
          };
        }
      } catch (e) {
        console.warn('[WebRTC] Screen sharing rejected or unavailable:', e.message);
        if (requireScreenShare) {
          throw new Error('Screen sharing permission is required for proctoring.');
        }
      }
    } else {
      console.warn('[WebRTC] getDisplayMedia not supported on this device/browser.');
    }

    return {
      webcamStream: this.webcamStream,
      screenStream: this.screenStream
    };
  }

  // Candidate creates a dedicated RTCPeerConnection for each monitoring viewer (supports Both Suvajit & Swastik!)
  async createOfferForViewer(viewerPeerId) {
    if (!viewerPeerId) return;

    // Close existing connection for this viewer if renegotiating
    if (this.peerConnections.has(viewerPeerId)) {
      try { this.peerConnections.get(viewerPeerId).close(); } catch (e) {}
      this.peerConnections.delete(viewerPeerId);
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(viewerPeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candJson = typeof event.candidate.toJSON === 'function'
          ? event.candidate.toJSON()
          : { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex };
        this.sendSignal('candidate', { candidate: candJson }, viewerPeerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Candidate->Viewer(${viewerPeerId}) State: ${pc.connectionState}`);
      if (this.onConnectionStateChange) this.onConnectionStateChange(pc.connectionState);
    };

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => {
        pc.addTrack(track, this.webcamStream);
      });
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        pc.addTrack(track, this.screenStream);
      });
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendSignal('offer', {
      sdp: { type: offer.type, sdp: offer.sdp },
      webcamStreamId: this.webcamStream ? this.webcamStream.id : null,
      screenStreamId: this.screenStream ? this.screenStream.id : null
    }, viewerPeerId);
  }

  // Candidate starts listening for any monitoring interviewers
  async startCandidateCall(roomId) {
    this.role = 'candidate';
    this.initSignaling(roomId);
    // Announce candidate availability to any already-waiting interviewers
    this.sendSignal('candidate-ready', {});
  }

  // Interviewer / Admin starts monitoring room
  async startMonitoringListener(roomId) {
    this.stopMonitoringOnly();
    this.role = 'interviewer';
    this.remoteWebcamStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
    this.expectedWebcamStreamId = null;
    this.expectedScreenStreamId = null;

    this.initSignaling(roomId);
    this.createViewerPeerConnection();

    // Tell candidate a viewer is ready (and retry briefly in case of race)
    this.sendSignal('viewer-ready', {});
    this._readyRetryTimer = setTimeout(() => {
      if (this.role === 'interviewer' && this.roomId === roomId && this.remoteWebcamStream.getTracks().length === 0 && this.remoteScreenStream.getTracks().length === 0) {
        this.sendSignal('viewer-ready', {});
      }
    }, 2500);
  }

  createViewerPeerConnection() {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnection = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candJson = typeof event.candidate.toJSON === 'function'
          ? event.candidate.toJSON()
          : { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex };
        this.sendSignal('candidate', { candidate: candJson }, this.candidatePeerId || null);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Viewer State: ${pc.connectionState}`);
      if (this.onConnectionStateChange) this.onConnectionStateChange(pc.connectionState);
    };

    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0];
      const streamId = stream ? stream.id : null;
      const track = event.track;

      if (track.kind === 'audio') {
        this.remoteWebcamStream.addTrack(track);
      } else if (track.kind === 'video') {
        if (this.expectedScreenStreamId && streamId === this.expectedScreenStreamId) {
          this.remoteScreenStream.addTrack(track);
        } else if (this.expectedWebcamStreamId && streamId === this.expectedWebcamStreamId) {
          this.remoteWebcamStream.addTrack(track);
        } else if (this.remoteWebcamStream.getVideoTracks().length === 0) {
          this.remoteWebcamStream.addTrack(track);
        } else {
          this.remoteScreenStream.addTrack(track);
        }
      }

      if (this.onRemoteStreamsReady) {
        this.onRemoteStreamsReady({
          webcamStream: this.remoteWebcamStream,
          screenStream: this.remoteScreenStream
        });
      }
    };

    return pc;
  }

  async handleOffer(msg) {
    this.candidatePeerId = msg.senderPeerId;
    this.expectedWebcamStreamId = msg.webcamStreamId || null;
    this.expectedScreenStreamId = msg.screenStreamId || null;

    // Reset remote media containers cleanly for fresh offer
    this.remoteWebcamStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
    const pc = this.createViewerPeerConnection();

    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignal('answer', {
      sdp: { type: answer.type, sdp: answer.sdp }
    }, msg.senderPeerId);
  }

  async handleAnswer(viewerPeerId, sdp) {
    const pc = this.peerConnections.get(viewerPeerId);
    if (pc && sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  async handleCandidate(senderPeerId, candidate) {
    if (!candidate) return;
    const pc = this.role === 'candidate'
      ? this.peerConnections.get(senderPeerId)
      : this.peerConnection;

    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] ICE candidate error:', e.message);
      }
    }
  }

  stopMonitoringOnly() {
    if (this._readyRetryTimer) {
      clearTimeout(this._readyRetryTimer);
      this._readyRetryTimer = null;
    }
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
      this.peerConnection = null;
    }
    this.teardownSignaling();
  }

  // Full cleanup of all streams and connections
  stopAllStreams() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(t => t.stop());
      this.webcamStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.peerConnections.forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    this.peerConnections.clear();
    this.stopMonitoringOnly();
  }
}

window.webRTCService = new WebRTCService();
