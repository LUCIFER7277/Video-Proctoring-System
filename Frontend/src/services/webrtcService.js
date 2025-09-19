class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.socket = null;
    this.isInitialized = false;

    // WebRTC Configuration with multiple STUN servers for better reliability
    this.rtcConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    // Event handlers
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onIceCandidate = null;
  }

  // Initialize WebRTC service with socket
  initialize(socket) {
    this.socket = socket;
    this.isInitialized = true;
    console.log('WebRTC Service initialized');
  }

  // Create peer connection
  async createPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    // Import the async config function
    const { getWebRTCConfig } = await import('../utils/webrtcConfig.js');

    // Get updated configuration with TURN servers
    const updatedConfig = await getWebRTCConfig();
    this.rtcConfiguration = updatedConfig;

    this.peerConnection = new RTCPeerConnection(this.rtcConfiguration);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote stream');
      const [remoteStream] = event.streams;
      this.remoteStream = remoteStream;
      if (this.onRemoteStream) {
        this.onRemoteStream(remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        console.log('Sending ICE candidate');
        this.socket.emit('ice-candidate', event.candidate);
        if (this.onIceCandidate) {
          this.onIceCandidate(event.candidate);
        }
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('WebRTC Connection state:', state);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      console.log('ICE Connection state:', state);
    };

    // Handle signaling state changes
    this.peerConnection.onsignalingstatechange = () => {
      console.log('Signaling state:', this.peerConnection.signalingState);
    };

    return this.peerConnection;
  }

  // Get user media with enhanced settings
  async getUserMedia(constraints = {}) {
    const defaultConstraints = {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    const finalConstraints = { ...defaultConstraints, ...constraints };

    try {
      console.log('Requesting user media with constraints:', finalConstraints);
      const stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      this.localStream = stream;
      console.log('Local stream obtained successfully');
      return stream;
    } catch (error) {
      console.error('Error getting user media:', error);

      // Fallback to lower quality if high quality fails
      try {
        console.log('Trying fallback constraints...');
        const fallbackConstraints = {
          video: { width: 640, height: 480 },
          audio: true
        };
        const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        this.localStream = stream;
        console.log('Fallback stream obtained successfully');
        return stream;
      } catch (fallbackError) {
        console.error('Fallback media request also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  // Add local stream to peer connection
  addLocalStream(stream) {
    if (this.peerConnection && stream) {
      stream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        this.peerConnection.addTrack(track, stream);
      });
    }
  }

  // Create offer (for initiator - usually interviewer)
  async createOffer() {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('Creating offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log('Local description set (offer)');

      if (this.socket) {
        this.socket.emit('offer', offer);
      }

      return offer;
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }

  // Handle received offer and create answer (for receiver - usually candidate)
  async handleOffer(offer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('Handling offer...');
      await this.peerConnection.setRemoteDescription(offer);

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log('Local description set (answer)');

      if (this.socket) {
        this.socket.emit('answer', answer);
      }

      return answer;
    } catch (error) {
      console.error('Error handling offer:', error);
      throw error;
    }
  }

  // Handle received answer (for initiator)
  async handleAnswer(answer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('Handling answer...');
      await this.peerConnection.setRemoteDescription(answer);
      console.log('Remote description set');
    } catch (error) {
      console.error('Error handling answer:', error);
      throw error;
    }
  }

  // Handle received ICE candidate
  async handleIceCandidate(candidate) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('Adding ICE candidate');
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      // Don't throw - ICE candidate errors are often non-fatal
    }
  }

  // Get connection statistics
  async getConnectionStats() {
    if (!this.peerConnection) {
      return null;
    }

    try {
      const stats = await this.peerConnection.getStats();
      const report = {};

      stats.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.mediaType === 'video') {
          report.inboundVideo = {
            bytesReceived: stat.bytesReceived,
            packetsReceived: stat.packetsReceived,
            packetsLost: stat.packetsLost,
            frameRate: stat.framesPerSecond
          };
        }
        if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
          report.outboundVideo = {
            bytesSent: stat.bytesSent,
            packetsSent: stat.packetsSent,
            frameRate: stat.framesPerSecond
          };
        }
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          report.connection = {
            localCandidateType: stat.localCandidateType,
            remoteCandidateType: stat.remoteCandidateType,
            state: stat.state
          };
        }
      });

      return report;
    } catch (error) {
      console.error('Error getting connection stats:', error);
      return null;
    }
  }

  // Check if WebRTC is supported
  static isSupported() {
    return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Clean up resources
  cleanup() {
    console.log('Cleaning up WebRTC service');

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped local track:', track.kind);
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.socket = null;
    this.isInitialized = false;

    // Clear event handlers
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onIceCandidate = null;
  }

  // Getters
  getConnectionState() {
    return this.peerConnection ? this.peerConnection.connectionState : 'closed';
  }

  getIceConnectionState() {
    return this.peerConnection ? this.peerConnection.iceConnectionState : 'closed';
  }

  getSignalingState() {
    return this.peerConnection ? this.peerConnection.signalingState : 'closed';
  }

  isConnected() {
    return this.getConnectionState() === 'connected';
  }
}

export default WebRTCService;