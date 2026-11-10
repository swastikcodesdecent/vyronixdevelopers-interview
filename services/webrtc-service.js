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
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    // Candidate maintains Map<viewerPeerId, { pc, pendingCandidates, lastOfferAt }>
    this.peerConnections = new Map();

    // Viewer maintains single RTCPeerConnection
    this.peerConnection = null;
    this.viewerPendingCandidates = [];
    this.candidatePeerId = null;

    this.webcamStream = null;
    this.screenStream = null;
    this.remoteWebcamStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();

    this.expectedWebcamStreamId = null;
    this.expectedScreenStreamId = null;
    this.expectedWebcamTrackIds = [];
    this.expectedScreenTrackIds = [];

    this.signalingChannel = null;
    this.firestoreUnsub = null;
    this.processedSignals = new Set();
    this._viewerRetryInterval = null;

    this.peerId = 'peer-' + Math.random().toString(36).substr(2, 9);
    this.role = null;
    this.roomId = null;

    // Callbacks
    this.onRemoteStreamsReady = null;
    this.onConnectionStateChange = null;
    this.onTrackEnded = null;
  }

  initSignaling(roomId) {
    this.teardownSignaling();
    this.roomId = roomId;
    this.processedSignals.clear();

    // Tolerance of 2 minutes to handle clock skew between candidate & interviewer devices
    const staleThreshold = Date.now() - 120000;

    const handleMessage = async (msg) => {
      if (!msg || msg.senderPeerId === this.peerId) return;
      if (msg.targetPeerId && msg.targetPeerId !== this.peerId) return;
      if (msg.role === this.role) return;
      if (msg.timestamp && msg.timestamp < staleThreshold) return;

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

    // 1. Local BroadcastChannel (instant same-browser testing)
    try {
      this.signalingChannel = new BroadcastChannel(`vyronix_webrtc_${roomId}`);
      this.signalingChannel.onmessage = (event) => handleMessage(event.data);
    } catch (e) {}

    // 2. Cloud Firestore Real-time Signaling (no server-side clock-skew filter)
    if (window.firebaseServices && window.firebaseServices.firestore) {
      try {
        this.firestoreUnsub = window.firebaseServices.firestore
          .collection('webrtcRooms')
          .doc(roomId)
          .collection('signals')
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

  // Candidate Step 1: Capture Webcam + Microphone (never requires user gesture once permission granted)
  async startCandidateWebcam(settings = {}) {
    this.role = 'candidate';
    const requireWebcam = settings.requireWebcam !== false;

    if (this.webcamStream && this.webcamStream.getTracks().some(t => t.readyState === 'live')) {
      return this.webcamStream;
    }

    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
      });
      return this.webcamStream;
    } catch (e) {
      console.warn('[WebRTC] Webcam access rejected or unavailable:', e.message);
      if (requireWebcam) {
        throw new Error('Camera and Microphone access required to proceed.');
      }
      return null;
    }
  }

  // Candidate Step 2: Capture Screen Share (must be called inside a user click gesture!)
  async startCandidateScreenShare(settings = {}) {
    this.role = 'candidate';
    const requireScreenShare = settings.requireScreenShare !== false;
    const canDisplayMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');

    if (!canDisplayMedia) {
      console.warn('[WebRTC] getDisplayMedia not supported on this device/browser.');
      return null;
    }

    if (this.screenStream && this.screenStream.getTracks().some(t => t.readyState === 'live')) {
      return this.screenStream;
    }

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

      // Attach screen tracks and renegotiate with all active interviewers
      await this.attachScreenStreamAndRenegotiate();
      return this.screenStream;
    } catch (e) {
      console.warn('[WebRTC] Screen sharing rejected or unavailable:', e.message);
      if (requireScreenShare) {
        throw new Error('Screen sharing permission is required for proctoring.');
      }
      return null;
    }
  }

  // Legacy combined helper (kept for compatibility)
  async startCandidateMedia(settings = {}) {
    await this.startCandidateWebcam(settings);
    await this.startCandidateScreenShare(settings);
    return {
      webcamStream: this.webcamStream,
      screenStream: this.screenStream
    };
  }

  _buildOfferMetadata(offer) {
    return {
      sdp: { type: offer.type, sdp: offer.sdp },
      webcamStreamId: this.webcamStream ? this.webcamStream.id : null,
      screenStreamId: this.screenStream ? this.screenStream.id : null,
      webcamTrackIds: this.webcamStream ? this.webcamStream.getTracks().map(t => t.id) : [],
      screenTrackIds: this.screenStream ? this.screenStream.getTracks().map(t => t.id) : []
    };
  }

  // Add newly acquired screen tracks to all existing viewer connections and renegotiate
  async attachScreenStreamAndRenegotiate() {
    if (!this.screenStream) return;
    for (const [viewerPeerId, entry] of this.peerConnections.entries()) {
      const pc = entry.pc;
      if (!pc || pc.connectionState === 'closed') continue;
      try {
        const existingTrackIds = new Set(pc.getSenders().map(s => s.track && s.track.id).filter(Boolean));
        this.screenStream.getTracks().forEach(track => {
          if (!existingTrackIds.has(track.id)) {
            pc.addTrack(track, this.screenStream);
          }
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        entry.lastOfferAt = Date.now();
        this.sendSignal('offer', this._buildOfferMetadata(offer), viewerPeerId);
      } catch (err) {
        console.warn('[WebRTC] Screen renegotiation notice:', err.message);
      }
    }
  }

  // Candidate creates a dedicated RTCPeerConnection for each monitoring viewer (supports Both Suvajit & Swastik!)
  async createOfferForViewer(viewerPeerId) {
    if (!viewerPeerId) return;

    const existing = this.peerConnections.get(viewerPeerId);
    if (existing && existing.pc && existing.pc.connectionState !== 'closed' && existing.pc.connectionState !== 'failed') {
      // Avoid duplicate rapid-fire offers during initial handshake
      if (Date.now() - existing.lastOfferAt < 3500) {
        return;
      }
      try { existing.pc.close(); } catch (e) {}
      this.peerConnections.delete(viewerPeerId);
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    const entry = { pc, pendingCandidates: [], lastOfferAt: Date.now() };
    this.peerConnections.set(viewerPeerId, entry);

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

    this.sendSignal('offer', this._buildOfferMetadata(offer), viewerPeerId);
  }

  // Candidate starts listening for any monitoring interviewers
  async startCandidateCall(roomId) {
    this.role = 'candidate';
    this.initSignaling(roomId);
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
    this.expectedWebcamTrackIds = [];
    this.expectedScreenTrackIds = [];
    this.candidatePeerId = null;
    this.viewerPendingCandidates = [];

    this.initSignaling(roomId);
    this.createViewerPeerConnection();

    // Send viewer-ready immediately and keep pulsing every 3.5s until remote video tracks arrive
    this.sendSignal('viewer-ready', {});
    this._viewerRetryInterval = setInterval(() => {
      if (this.role !== 'interviewer' || this.roomId !== roomId) {
        clearInterval(this._viewerRetryInterval);
        this._viewerRetryInterval = null;
        return;
      }
      const hasAnyVideo =
        this.remoteWebcamStream.getVideoTracks().length > 0 ||
        this.remoteScreenStream.getVideoTracks().length > 0;
      if (!hasAnyVideo) {
        this.sendSignal('viewer-ready', {});
      }
    }, 3500);
  }

  createViewerPeerConnection() {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnection = pc;
    this.viewerPendingCandidates = [];

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

      const addUniqueTrack = (targetStream, trk) => {
        if (!targetStream.getTracks().some(t => t.id === trk.id)) {
          targetStream.addTrack(trk);
        }
      };

      if (track.kind === 'audio') {
        addUniqueTrack(this.remoteWebcamStream, track);
      } else if (track.kind === 'video') {
        const isScreenById =
          (this.expectedScreenTrackIds && this.expectedScreenTrackIds.includes(track.id)) ||
          (this.expectedScreenStreamId && streamId === this.expectedScreenStreamId);
        const isWebcamById =
          (this.expectedWebcamTrackIds && this.expectedWebcamTrackIds.includes(track.id)) ||
          (this.expectedWebcamStreamId && streamId === this.expectedWebcamStreamId);

        if (isScreenById) {
          addUniqueTrack(this.remoteScreenStream, track);
        } else if (isWebcamById) {
          addUniqueTrack(this.remoteWebcamStream, track);
        } else if (this.remoteWebcamStream.getVideoTracks().length === 0) {
          addUniqueTrack(this.remoteWebcamStream, track);
        } else {
          addUniqueTrack(this.remoteScreenStream, track);
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
    const isSameCandidate = this.candidatePeerId === msg.senderPeerId &&
      this.peerConnection &&
      this.peerConnection.connectionState !== 'closed' &&
      this.peerConnection.connectionState !== 'failed';

    this.candidatePeerId = msg.senderPeerId;
    this.expectedWebcamStreamId = msg.webcamStreamId || null;
    this.expectedScreenStreamId = msg.screenStreamId || null;
    this.expectedWebcamTrackIds = msg.webcamTrackIds || [];
    this.expectedScreenTrackIds = msg.screenTrackIds || [];

    let pc = this.peerConnection;
    if (!isSameCandidate) {
      this.remoteWebcamStream = new MediaStream();
      this.remoteScreenStream = new MediaStream();
      pc = this.createViewerPeerConnection();
    }

    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

    // Flush any buffered ICE candidates
    while (this.viewerPendingCandidates.length > 0) {
      const c = this.viewerPendingCandidates.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignal('answer', {
      sdp: { type: answer.type, sdp: answer.sdp }
    }, msg.senderPeerId);
  }

  async handleAnswer(viewerPeerId, sdp) {
    const entry = this.peerConnections.get(viewerPeerId);
    if (entry && entry.pc && sdp) {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      while (entry.pendingCandidates.length > 0) {
        const c = entry.pendingCandidates.shift();
        try { await entry.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
      }
    }
  }

  async handleCandidate(senderPeerId, candidate) {
    if (!candidate) return;
    if (this.role === 'candidate') {
      const entry = this.peerConnections.get(senderPeerId);
      if (entry && entry.pc) {
        if (entry.pc.remoteDescription) {
          try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        } else {
          entry.pendingCandidates.push(candidate);
        }
      }
    } else if (this.peerConnection) {
      if (this.peerConnection.remoteDescription) {
        try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
      } else {
        this.viewerPendingCandidates.push(candidate);
      }
    }
  }

  stopMonitoringOnly() {
    if (this._viewerRetryInterval) {
      clearInterval(this._viewerRetryInterval);
      this._viewerRetryInterval = null;
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
    this.peerConnections.forEach(entry => {
      try { if (entry.pc) entry.pc.close(); } catch (e) {}
    });
    this.peerConnections.clear();
    this.stopMonitoringOnly();
  }
}

window.webRTCService = new WebRTCService();
