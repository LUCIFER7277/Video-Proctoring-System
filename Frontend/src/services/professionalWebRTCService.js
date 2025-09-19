/**
 * Professional WebRTC Service
 * Enterprise-grade WebRTC implementation for video proctoring
 *
 * Features:
 * - Advanced error handling and recovery
 * - Professional connection management
 * - Optimized for reliability and performance
 * - Support for multiple network conditions
 */

class ProfessionalWebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.socket = null;
    this.isInitialized = false;
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.signalingState = 'closed';

    // Advanced connection management
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.reconnectDelay = 1000;
    this.isReconnecting = false;
    this.iceRestartCount = 0;
    this.maxIceRestarts = 2;

    // Internal negotiation guard
    this.makingOffer = false;

    // Event handlers
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onIceCandidate = null;
    this.onError = null;
    this.onConnectionEstablished = null;
    this.onConnectionLost = null;

    // Professional configuration
    this.rtcConfiguration = {
      iceServers: [
        // Google STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },

        // Cloudflare STUN
        { urls: 'stun:stun.cloudflare.com:3478' },

        // Metered.ca free TURN servers
        {
          urls: 'turn:staticauth.openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret'
        },
        {
          urls: 'turn:staticauth.openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret'
        },
        {
          urls: 'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret'
        }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-compat',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
      sdpSemantics: 'unified-plan'
    };

    // Media constraints for professional quality
    this.mediaConstraints = {
      video: {
        width: { ideal: 1280, max: 1920, min: 640 },
        height: { ideal: 720, max: 1080, min: 480 },
        frameRate: { ideal: 30, max: 30, min: 15 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 }
      }
    };

    this.bindMethods();
  }

  bindMethods() {
    this.handleIceCandidate = this.handleIceCandidate.bind(this);
    this.handleTrack = this.handleTrack.bind(this);
    this.handleConnectionStateChange = this.handleConnectionStateChange.bind(this);
    this.handleIceConnectionStateChange = this.handleIceConnectionStateChange.bind(this);
    this.handleSignalingStateChange = this.handleSignalingStateChange.bind(this);
  }

  /**
   * Initialize the WebRTC service with socket connection
   */
  async initialize(socket, config = {}) {
    try {
      console.log('🚀 Initializing Professional WebRTC Service...');

      this.socket = socket;
      this.rtcConfiguration = { ...this.rtcConfiguration, ...config };

      // Get user media first
      await this.getUserMedia();

      this.isInitialized = true;
      console.log('✅ Professional WebRTC Service initialized successfully');

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize WebRTC service:', error);
      this.handleError('initialization_failed', error);
      throw error;
    }
  }

  /**
   * Get user media with professional fallback strategy
   */
  async getUserMedia(constraints = null) {
    const attemptConstraints = constraints || this.mediaConstraints;

    try {
      console.log('📹 Requesting user media with constraints:', attemptConstraints);

      const stream = await navigator.mediaDevices.getUserMedia(attemptConstraints);
      this.localStream = stream;

      console.log('✅ Media stream acquired:', {
        id: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          readyState: t.readyState,
          enabled: t.enabled
        }))
      });

      return stream;
    } catch (error) {
      console.warn('⚠️ Media request failed:', error.name, error.message);

      // Professional fallback strategy
      if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        console.log('📹 Trying fallback constraints...');
        return this.getUserMediaFallback();
      } else if (error.name === 'NotAllowedError') {
        throw new Error('Camera and microphone access denied. Please allow permissions and refresh.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No camera or microphone found. Please connect devices and refresh.');
      } else if (error.name === 'NotReadableError') {
        throw new Error('Camera/microphone in use by another application.');
      }

      throw error;
    }
  }

  /**
   * Professional fallback media strategy
   */
  async getUserMediaFallback() {
    const fallbackStrategies = [
      // Strategy 1: Lower resolution
      {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 30 }
        },
        audio: true
      },
      // Strategy 2: Basic constraints
      {
        video: true,
        audio: true
      },
      // Strategy 3: Audio only
      {
        audio: true
      }
    ];

    for (let i = 0; i < fallbackStrategies.length; i++) {
      try {
        console.log(`📹 Attempting fallback strategy ${i + 1}:`, fallbackStrategies[i]);
        const stream = await navigator.mediaDevices.getUserMedia(fallbackStrategies[i]);
        this.localStream = stream;
        console.log(`✅ Fallback strategy ${i + 1} succeeded`);
        return stream;
      } catch (error) {
        console.warn(`❌ Fallback strategy ${i + 1} failed:`, error.message);
        if (i === fallbackStrategies.length - 1) {
          throw error;
        }
      }
    }
  }

  /**
   * Create peer connection with professional configuration
   */
  async createPeerConnection() {
    try {
      if (this.peerConnection) {
        console.log('🔄 Closing existing peer connection...');
        this.peerConnection.close();
      }

      console.log('🔗 Creating new peer connection with config:', this.rtcConfiguration);
      this.peerConnection = new RTCPeerConnection(this.rtcConfiguration);

      // Set up event handlers
      this.peerConnection.onicecandidate = this.handleIceCandidate;
      this.peerConnection.ontrack = this.handleTrack;
      this.peerConnection.onconnectionstatechange = this.handleConnectionStateChange;
      this.peerConnection.oniceconnectionstatechange = this.handleIceConnectionStateChange;
      this.peerConnection.onsignalingstatechange = this.handleSignalingStateChange;

      // Renegotiate automatically when needed (e.g., after replaceTrack)
      this.peerConnection.onnegotiationneeded = async () => {
        console.log('🧩 onnegotiationneeded fired');
        try {
          if (this.makingOffer) {
            console.log('⚠️ Already making an offer, skipping');
            return;
          }
          this.makingOffer = true;
          await this.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        } catch (err) {
          console.error('❌ Negotiation failed:', err);
        } finally {
          this.makingOffer = false;
        }
      };

      // Add local stream tracks
      if (this.localStream) {
        console.log('🎥 Adding local stream tracks to peer connection');
        this.localStream.getTracks().forEach(track => {
          console.log(`➕ Adding ${track.kind} track:`, track.label);
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      console.log('✅ Peer connection created successfully');
      return this.peerConnection;
    } catch (error) {
      console.error('❌ Failed to create peer connection:', error);
      this.handleError('peer_connection_failed', error);
      throw error;
    }
  }

  /**
   * Handle ICE candidates with buffering
   */
  handleIceCandidate(event) {
    if (event.candidate) {
      console.log('🧊 ICE candidate generated:', {
        type: event.candidate.type,
        protocol: event.candidate.protocol,
        address: event.candidate.address,
        port: event.candidate.port
      });

      if (this.socket && this.socket.connected) {
        this.socket.emit('ice-candidate', event.candidate);
      } else {
        console.warn('⚠️ Socket not connected, buffering ICE candidate');
      }

      if (this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    } else {
      console.log('🧊 ICE gathering complete');
    }
  }

  /**
   * Handle incoming remote stream
   */
  handleTrack(event) {
    console.log('📺 Remote track received:', {
      kind: event.track.kind,
      id: event.track.id,
      readyState: event.track.readyState,
      enabled: event.track.enabled,
      streams: event.streams.length
    });

    const [remoteStream] = event.streams;
    if (remoteStream && remoteStream !== this.remoteStream) {
      this.remoteStream = remoteStream;

      console.log('✅ Remote stream established:', {
        id: remoteStream.id,
        tracks: remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`)
      });

      if (this.onRemoteStream) {
        this.onRemoteStream(remoteStream);
      }
    }
  }

  /**
   * Handle connection state changes with professional monitoring
   */
  handleConnectionStateChange() {
    const newState = this.peerConnection.connectionState;
    const oldState = this.connectionState;
    this.connectionState = newState;

    console.log(`🔄 Connection state: ${oldState} → ${newState}`);

    switch (newState) {
      case 'connected':
        console.log('✅ WebRTC connection established successfully');
        this.connectionAttempts = 0;
        this.isReconnecting = false;
        if (this.onConnectionEstablished) {
          this.onConnectionEstablished();
        }
        break;

      case 'disconnected':
        console.log('⚠️ WebRTC connection disconnected');
        this.handleConnectionIssue('disconnected');
        break;

      case 'failed':
        console.log('❌ WebRTC connection failed');
        this.handleConnectionFailure();
        break;

      case 'closed':
        console.log('🔒 WebRTC connection closed');
        break;
    }

    if (this.onConnectionStateChange) {
      this.onConnectionStateChange(newState, oldState);
    }
  }

  /**
   * Handle ICE connection state changes
   */
  handleIceConnectionStateChange() {
    const newState = this.peerConnection.iceConnectionState;
    const oldState = this.iceConnectionState;
    this.iceConnectionState = newState;

    console.log(`🧊 ICE connection state: ${oldState} → ${newState}`);

    if (newState === 'failed' && this.iceRestartCount < this.maxIceRestarts) {
      console.log('🔄 ICE connection failed, attempting restart...');
      this.restartIce();
    }
  }

  /**
   * Handle signaling state changes
   */
  handleSignalingStateChange() {
    const newState = this.peerConnection.signalingState;
    const oldState = this.signalingState;
    this.signalingState = newState;

    console.log(`📡 Signaling state: ${oldState} → ${newState}`);
  }

  /**
   * Professional connection failure handling
   */
  async handleConnectionFailure() {
    if (this.isReconnecting) {
      console.log('🔄 Already attempting reconnection...');
      return;
    }

    this.connectionAttempts++;

    if (this.connectionAttempts <= this.maxConnectionAttempts) {
      console.log(`🔄 Attempting reconnection ${this.connectionAttempts}/${this.maxConnectionAttempts}...`);
      this.isReconnecting = true;

      setTimeout(async () => {
        try {
          await this.createPeerConnection();
          // Restart the connection process
          if (this.onConnectionLost) {
            this.onConnectionLost();
          }
        } catch (error) {
          console.error('❌ Reconnection attempt failed:', error);
          this.isReconnecting = false;
        }
      }, this.reconnectDelay * this.connectionAttempts);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.handleError('max_reconnection_attempts', new Error('Failed to establish connection'));
    }
  }

  /**
   * Handle connection issues
   */
  handleConnectionIssue(issue) {
    console.log(`⚠️ Handling connection issue: ${issue}`);

    // Implement progressive recovery strategies
    setTimeout(() => {
      if (this.peerConnection && this.peerConnection.connectionState === 'disconnected') {
        console.log('🔄 Attempting ICE restart for disconnected connection...');
        this.restartIce();
      }
    }, 2000);
  }

  /**
   * Restart ICE with professional handling
   */
  restartIce() {
    if (this.iceRestartCount >= this.maxIceRestarts) {
      console.log('❌ Max ICE restart attempts reached');
      return;
    }

    this.iceRestartCount++;
    console.log(`🔄 Restarting ICE (attempt ${this.iceRestartCount}/${this.maxIceRestarts})...`);

    try {
      this.peerConnection.restartIce();
    } catch (error) {
      console.error('❌ ICE restart failed:', error);
    }
  }

  /**
   * Create offer with professional handling
   */
  async createOffer(options = {}) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      const defaultOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      };

      const offerOptions = { ...defaultOptions, ...options };
      console.log('📤 Creating offer with options:', offerOptions);

      const offer = await this.peerConnection.createOffer(offerOptions);
      await this.peerConnection.setLocalDescription(offer);

      console.log('✅ Offer created and local description set');

      if (this.socket && this.socket.connected) {
        this.socket.emit('offer', offer);
      }

      return offer;
    } catch (error) {
      console.error('❌ Failed to create offer:', error);
      this.handleError('create_offer_failed', error);
      throw error;
    }
  }

  /**
   * Handle incoming offer with professional processing
   */
  async handleOffer(offer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('📥 Handling incoming offer...');
      await this.peerConnection.setRemoteDescription(offer);

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      console.log('✅ Answer created and local description set');

      if (this.socket && this.socket.connected) {
        this.socket.emit('answer', answer);
      }

      return answer;
    } catch (error) {
      console.error('❌ Failed to handle offer:', error);
      this.handleError('handle_offer_failed', error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(answer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('📥 Handling incoming answer...');
      await this.peerConnection.setRemoteDescription(answer);
      console.log('✅ Remote description set successfully');
    } catch (error) {
      console.error('❌ Failed to handle answer:', error);
      this.handleError('handle_answer_failed', error);
      throw error;
    }
  }

  /**
   * Handle incoming ICE candidate with professional buffering
   */
  async handleIceCandidate(candidate) {
    try {
      if (!this.peerConnection) {
        console.warn('⚠️ No peer connection, ignoring ICE candidate');
        return;
      }

      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
        console.log('✅ ICE candidate added successfully');
      } else {
        console.log('⏳ Remote description not set, candidate will be processed after SDP exchange');
        // The browser will handle buffering automatically
      }
    } catch (error) {
      console.warn('⚠️ Failed to add ICE candidate (non-fatal):', error.message);
      // ICE candidate errors are often non-fatal
    }
  }

  /**
   * Professional error handling
   */
  handleError(type, error) {
    const errorInfo = {
      type,
      message: error.message,
      timestamp: new Date().toISOString(),
      connectionState: this.connectionState,
      iceConnectionState: this.iceConnectionState,
      signalingState: this.signalingState
    };

    console.error('🚨 WebRTC Error:', errorInfo);

    if (this.onError) {
      this.onError(errorInfo);
    }
  }

  /**
   * Get connection statistics for monitoring
   */
  async getConnectionStats() {
    if (!this.peerConnection) {
      return null;
    }

    try {
      const stats = await this.peerConnection.getStats();
      const report = {
        timestamp: Date.now(),
        connection: this.connectionState,
        iceConnection: this.iceConnectionState,
        signaling: this.signalingState
      };

      stats.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.mediaType === 'video') {
          report.inboundVideo = {
            bytesReceived: stat.bytesReceived,
            packetsReceived: stat.packetsReceived,
            packetsLost: stat.packetsLost,
            frameRate: stat.framesPerSecond,
            timestamp: stat.timestamp
          };
        }

        if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
          report.outboundVideo = {
            bytesSent: stat.bytesSent,
            packetsSent: stat.packetsSent,
            frameRate: stat.framesPerSecond,
            timestamp: stat.timestamp
          };
        }

        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          report.connectionPair = {
            localCandidateType: stat.localCandidateType,
            remoteCandidateType: stat.remoteCandidateType,
            currentRoundTripTime: stat.currentRoundTripTime,
            availableOutgoingBitrate: stat.availableOutgoingBitrate
          };
        }
      });

      return report;
    } catch (error) {
      console.error('❌ Failed to get connection stats:', error);
      return null;
    }
  }

  /**
   * Replace video track professionally
   */
  async replaceVideoTrack(newTrack) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      const sender = this.peerConnection.getSenders().find(s =>
        s.track && s.track.kind === 'video'
      );

      if (sender) {
        await sender.replaceTrack(newTrack);
        console.log('✅ Video track replaced successfully');
      } else {
        console.warn('⚠️ No video sender found to replace track');
      }
    } catch (error) {
      console.error('❌ Failed to replace video track:', error);
      throw error;
    }
  }

  // Replace audio track professionally
  async replaceAudioTrack(newTrack) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      const sender = this.peerConnection.getSenders().find(s =>
        s.track && s.track.kind === 'audio'
      );

      if (sender) {
        await sender.replaceTrack(newTrack);
        console.log('✅ Audio track replaced successfully');
      } else {
        console.warn('⚠️ No audio sender found to replace track');
      }
    } catch (error) {
      console.error('❌ Failed to replace audio track:', error);
      throw error;
    }
  }

  /**
   * Professional cleanup
   */
  cleanup() {
    console.log('🧹 Cleaning up Professional WebRTC Service...');

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Reset state
    this.remoteStream = null;
    this.socket = null;
    this.isInitialized = false;
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.signalingState = 'closed';
    this.connectionAttempts = 0;
    this.isReconnecting = false;
    this.iceRestartCount = 0;

    // Clear event handlers
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onIceCandidate = null;
    this.onError = null;
    this.onConnectionEstablished = null;
    this.onConnectionLost = null;

    console.log('✅ Professional WebRTC Service cleanup complete');
  }

  /**
   * Check WebRTC support
   */
  static isSupported() {
    const supported = !!(
      window.RTCPeerConnection &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );

    console.log('🔍 WebRTC support check:', supported);
    return supported;
  }

  /**
   * Get browser capabilities
   */
  static async getBrowserCapabilities() {
    const capabilities = {
      webrtc: ProfessionalWebRTCService.isSupported(),
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      webgl: !!window.WebGLRenderingContext,
      canvas: !!document.createElement('canvas').getContext
    };

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        capabilities.devices = {
          video: devices.filter(d => d.kind === 'videoinput').length,
          audio: devices.filter(d => d.kind === 'audioinput').length
        };
      } catch (error) {
        console.warn('Failed to enumerate devices:', error);
        capabilities.devices = { video: 0, audio: 0 };
      }
    }

    console.log('🔍 Browser capabilities:', capabilities);
    return capabilities;
  }

  // Getters for current state
  getConnectionState() { return this.connectionState; }
  getIceConnectionState() { return this.iceConnectionState; }
  getSignalingState() { return this.signalingState; }
  isConnected() { return this.connectionState === 'connected'; }
  hasLocalStream() { return !!this.localStream; }
  hasRemoteStream() { return !!this.remoteStream; }
}

export default ProfessionalWebRTCService;