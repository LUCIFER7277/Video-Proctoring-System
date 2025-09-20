class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.socket = null;
    this.isInitialized = false;

    // Resource tracking for proper cleanup
    this.timers = new Set();
    this.isDisposed = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.reconnectDelay = 1000;
    this.isReconnecting = false;

    // State management for race condition prevention
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.isSettingRemoteAnswerPending = false;
    this.isPolite = false; // Set by the application based on role

    // ICE management
    this.iceGatheringTimeout = null;
    this.iceGatheringTimeoutMs = 30000; // 30 seconds
    this.iceRestartCount = 0;
    this.maxIceRestarts = 3;

    // Connection quality monitoring
    this.statsInterval = null;
    this.lastStatsTime = 0;
    this.connectionQuality = 'unknown';

    // WebRTC Configuration with secure defaults
    this.rtcConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-compat',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all', // Allow both STUN and TURN
      sdpSemantics: 'unified-plan'
    };

    // Event handlers
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onIceCandidate = null;
    this.onError = null;
    this.onConnectionQualityChange = null;
    this.onReconnecting = null;
    this.onReconnected = null;
  }

  /**
   * Initialize WebRTC service with socket and error handling
   */
  async initialize(socket) {
    try {
      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      if (!socket) {
        throw new Error('Socket connection is required');
      }

      // Validate WebRTC support
      if (!WebRTCService.isSupported()) {
        throw new Error('WebRTC is not supported in this browser');
      }

      this.socket = socket;

      // Load external configuration with error handling
      try {
        await this.loadExternalConfiguration();
      } catch (configError) {
        console.warn('Failed to load external WebRTC configuration, using defaults:', configError);
        // Continue with default configuration
      }

      this.isInitialized = true;
      console.log('✅ WebRTC Service initialized successfully');

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize WebRTC service:', error);
      this.handleError('initialization_failed', error);
      throw error;
    }
  }

  /**
   * Load external WebRTC configuration with proper error handling
   */
  async loadExternalConfiguration() {
    try {
      // Dynamic import with timeout
      const configPromise = import('../utils/webrtcConfig.js');
      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Configuration load timeout'));
        }, 5000);
        this.timers.add(timeoutId);
      });

      const configModule = await Promise.race([configPromise, timeoutPromise]);

      if (configModule && typeof configModule.getWebRTCConfig === 'function') {
        const updatedConfig = await configModule.getWebRTCConfig();

        // Validate and merge configuration securely
        if (this.validateConfiguration(updatedConfig)) {
          this.rtcConfiguration = { ...this.rtcConfiguration, ...updatedConfig };
          console.log('📡 External WebRTC configuration loaded');
        } else {
          console.warn('⚠️ Invalid external configuration, using defaults');
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to load external configuration:', error.message);
      // Don't throw - fallback to default configuration
    }
  }

  /**
   * Validate WebRTC configuration for security
   */
  validateConfiguration(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }

    // Validate ICE servers
    if (config.iceServers && Array.isArray(config.iceServers)) {
      for (const server of config.iceServers) {
        if (!server.urls) return false;

        // Basic URL validation
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        for (const url of urls) {
          if (typeof url !== 'string' || (!url.startsWith('stun:') && !url.startsWith('turn:'))) {
            return false;
          }
        }

        // Validate credentials if present
        if (server.username && typeof server.username !== 'string') return false;
        if (server.credential && typeof server.credential !== 'string') return false;
      }
    }

    return true;
  }

  /**
   * Add timeout with tracking for cleanup
   */
  addTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      this.timers.delete(timeoutId);
      callback();
    }, delay);
    this.timers.add(timeoutId);
    return timeoutId;
  }

  /**
   * Add interval with tracking for cleanup
   */
  addInterval(callback, interval) {
    const intervalId = setInterval(callback, interval);
    this.timers.add(intervalId);
    return intervalId;
  }

  /**
   * Create peer connection with comprehensive error handling and event management
   */
  async createPeerConnection() {
    try {
      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      // Clean up existing connection
      if (this.peerConnection) {
        this.closePeerConnection();
      }

      console.log('🔄 Creating peer connection...');

      this.peerConnection = new RTCPeerConnection(this.rtcConfiguration);

      // Set up event handlers with error handling
      this.setupPeerConnectionEventHandlers();

      // Start ICE gathering timeout
      this.startIceGatheringTimeout();

      // Start connection quality monitoring
      this.startQualityMonitoring();

      console.log('✅ Peer connection created successfully');
      return this.peerConnection;

    } catch (error) {
      console.error('❌ Failed to create peer connection:', error);
      this.handleError('peer_connection_failed', error);
      throw error;
    }
  }

  /**
   * Set up peer connection event handlers with error handling
   */
  setupPeerConnectionEventHandlers() {
    if (!this.peerConnection) return;

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      try {
        console.log('📺 Received remote stream');
        const [remoteStream] = event.streams;
        this.remoteStream = remoteStream;

        if (this.onRemoteStream) {
          this.onRemoteStream(remoteStream);
        }
      } catch (error) {
        console.error('❌ Error handling remote stream:', error);
        this.handleError('remote_stream_failed', error);
      }
    };

    // Handle ICE candidates with validation
    this.peerConnection.onicecandidate = (event) => {
      try {
        if (event.candidate) {
          // Validate ICE candidate
          if (this.validateIceCandidate(event.candidate)) {
            console.log('🧊 Sending ICE candidate:', event.candidate.type);

            if (this.socket && this.socket.connected) {
              this.socket.emit('ice-candidate', event.candidate);
            }

            if (this.onIceCandidate) {
              this.onIceCandidate(event.candidate);
            }
          } else {
            console.warn('⚠️ Invalid ICE candidate received, skipping');
          }
        } else {
          console.log('🧊 ICE gathering complete');
          this.clearIceGatheringTimeout();
        }
      } catch (error) {
        console.error('❌ Error handling ICE candidate:', error);
      }
    };

    // Handle connection state changes with recovery
    this.peerConnection.onconnectionstatechange = () => {
      try {
        const state = this.peerConnection.connectionState;
        console.log(`🔄 Connection state: ${state}`);

        this.handleConnectionStateChange(state);

        if (this.onConnectionStateChange) {
          this.onConnectionStateChange(state);
        }
      } catch (error) {
        console.error('❌ Error handling connection state change:', error);
      }
    };

    // Handle ICE connection state changes with restart capability
    this.peerConnection.oniceconnectionstatechange = () => {
      try {
        const state = this.peerConnection.iceConnectionState;
        console.log(`🧊 ICE connection state: ${state}`);

        this.handleIceConnectionStateChange(state);
      } catch (error) {
        console.error('❌ Error handling ICE connection state change:', error);
      }
    };

    // Handle signaling state changes
    this.peerConnection.onsignalingstatechange = () => {
      try {
        const state = this.peerConnection.signalingState;
        console.log(`📡 Signaling state: ${state}`);
      } catch (error) {
        console.error('❌ Error handling signaling state change:', error);
      }
    };

    // Handle negotiation needed events
    this.peerConnection.onnegotiationneeded = () => {
      try {
        console.log('🤝 Negotiation needed');
        // Handle negotiation with proper collision detection
        this.handleNegotiationNeeded();
      } catch (error) {
        console.error('❌ Error handling negotiation needed:', error);
      }
    };
  }

  /**
   * Validate ICE candidate for security
   */
  validateIceCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }

    // Basic validation
    if (!candidate.candidate || !candidate.sdpMid) {
      return false;
    }

    // Security validation - reject suspicious candidates
    const candidateStr = candidate.candidate;
    if (candidateStr.includes('0.0.0.0') || candidateStr.includes('127.0.0.1')) {
      return false;
    }

    return true;
  }

  /**
   * Handle connection state changes with recovery logic
   */
  handleConnectionStateChange(state) {
    switch (state) {
      case 'connected':
        console.log('✅ WebRTC connection established');
        this.connectionAttempts = 0;
        this.isReconnecting = false;
        if (this.onReconnected) {
          this.onReconnected();
        }
        break;

      case 'disconnected':
        console.log('⚠️ WebRTC connection disconnected');
        this.attemptReconnection();
        break;

      case 'failed':
        console.log('❌ WebRTC connection failed');
        this.handleConnectionFailure();
        break;

      case 'closed':
        console.log('🔒 WebRTC connection closed');
        break;
    }
  }

  /**
   * Handle ICE connection state changes with restart capability
   */
  handleIceConnectionStateChange(state) {
    switch (state) {
      case 'failed':
        if (this.iceRestartCount < this.maxIceRestarts) {
          console.log('🔄 ICE connection failed, attempting restart...');
          this.restartIce();
        } else {
          console.log('❌ Max ICE restart attempts reached');
          this.handleError('ice_failed', new Error('ICE connection failed'));
        }
        break;

      case 'disconnected':
        console.log('⚠️ ICE connection disconnected');
        // Wait a bit before restarting ICE for temporary disconnections
        this.addTimeout(() => {
          if (this.peerConnection && this.peerConnection.iceConnectionState === 'disconnected') {
            this.restartIce();
          }
        }, 5000);
        break;
    }
  }

  /**
   * Handle negotiation needed with collision detection
   */
  async handleNegotiationNeeded() {
    try {
      if (this.makingOffer || !this.peerConnection) return;

      this.makingOffer = true;
      await this.createOffer();
    } catch (error) {
      console.error('❌ Error in negotiation:', error);
      this.handleError('negotiation_failed', error);
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * Start ICE gathering timeout
   */
  startIceGatheringTimeout() {
    this.clearIceGatheringTimeout();

    this.iceGatheringTimeout = this.addTimeout(() => {
      if (this.peerConnection && this.peerConnection.iceGatheringState !== 'complete') {
        console.warn('⚠️ ICE gathering timeout, attempting restart');
        this.restartIce();
      }
    }, this.iceGatheringTimeoutMs);
  }

  /**
   * Clear ICE gathering timeout
   */
  clearIceGatheringTimeout() {
    if (this.iceGatheringTimeout) {
      clearTimeout(this.iceGatheringTimeout);
      this.timers.delete(this.iceGatheringTimeout);
      this.iceGatheringTimeout = null;
    }
  }

  /**
   * Restart ICE with proper handling
   */
  restartIce() {
    if (this.iceRestartCount >= this.maxIceRestarts) {
      console.log('❌ Max ICE restart attempts reached');
      return;
    }

    try {
      this.iceRestartCount++;
      console.log(`🔄 Restarting ICE (attempt ${this.iceRestartCount}/${this.maxIceRestarts})`);

      if (this.peerConnection) {
        this.peerConnection.restartIce();
        this.startIceGatheringTimeout();
      }
    } catch (error) {
      console.error('❌ ICE restart failed:', error);
      this.handleError('ice_restart_failed', error);
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  async attemptReconnection() {
    if (this.isReconnecting || this.connectionAttempts >= this.maxConnectionAttempts) {
      return;
    }

    this.isReconnecting = true;
    this.connectionAttempts++;

    if (this.onReconnecting) {
      this.onReconnecting(this.connectionAttempts);
    }

    const delay = this.reconnectDelay * Math.pow(2, this.connectionAttempts - 1);
    console.log(`🔄 Attempting reconnection ${this.connectionAttempts}/${this.maxConnectionAttempts} in ${delay}ms`);

    this.addTimeout(async () => {
      try {
        await this.createPeerConnection();
        // Add local stream if available
        if (this.localStream) {
          this.addLocalStream(this.localStream);
        }
      } catch (error) {
        console.error('❌ Reconnection attempt failed:', error);
        this.isReconnecting = false;
        if (this.connectionAttempts < this.maxConnectionAttempts) {
          this.attemptReconnection();
        } else {
          this.handleError('max_reconnection_attempts', error);
        }
      }
    }, delay);
  }

  /**
   * Handle connection failure
   */
  handleConnectionFailure() {
    console.log('❌ Handling connection failure');
    this.attemptReconnection();
  }

  /**
   * Start connection quality monitoring
   */
  startQualityMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.timers.delete(this.statsInterval);
    }

    this.statsInterval = this.addInterval(async () => {
      try {
        const stats = await this.getConnectionStats();
        if (stats) {
          this.analyzeConnectionQuality(stats);
        }
      } catch (error) {
        console.warn('⚠️ Error getting connection stats:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Analyze connection quality from stats
   */
  analyzeConnectionQuality(stats) {
    let quality = 'good';

    // Analyze video stats if available
    if (stats.inboundVideo) {
      const { packetsLost, packetsReceived } = stats.inboundVideo;
      if (packetsReceived > 0) {
        const lossRate = packetsLost / (packetsLost + packetsReceived);
        if (lossRate > 0.05) quality = 'poor';
        else if (lossRate > 0.02) quality = 'fair';
      }
    }

    // Check round trip time
    if (stats.connection && stats.connection.currentRoundTripTime) {
      const rtt = stats.connection.currentRoundTripTime;
      if (rtt > 0.3) quality = 'poor';
      else if (rtt > 0.15) quality = 'fair';
    }

    if (quality !== this.connectionQuality) {
      this.connectionQuality = quality;
      console.log(`📊 Connection quality: ${quality}`);
      if (this.onConnectionQualityChange) {
        this.onConnectionQualityChange(quality);
      }
    }
  }

  /**
   * Close peer connection properly
   */
  closePeerConnection() {
    if (this.peerConnection) {
      try {
        // Remove event handlers to prevent memory leaks
        this.peerConnection.ontrack = null;
        this.peerConnection.onicecandidate = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onsignalingstatechange = null;
        this.peerConnection.onnegotiationneeded = null;

        this.peerConnection.close();
        console.log('🔒 Peer connection closed');
      } catch (error) {
        console.warn('⚠️ Error closing peer connection:', error);
      }
    }
  }

  /**
   * Handle errors with categorization
   */
  handleError(type, error) {
    const errorInfo = {
      type,
      message: error.message,
      timestamp: new Date().toISOString(),
      connectionState: this.getConnectionState(),
      iceConnectionState: this.getIceConnectionState()
    };

    console.error('🚨 WebRTC Error:', errorInfo);

    if (this.onError) {
      this.onError(errorInfo);
    }
  }

  /**
   * Get user media with enhanced settings and comprehensive error handling
   */
  async getUserMedia(constraints = {}) {
    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    const defaultConstraints = {
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
        sampleRate: 44100
      }
    };

    const finalConstraints = { ...defaultConstraints, ...constraints };

    try {
      console.log('📹 Requesting user media with constraints:', finalConstraints);

      // Check device availability first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some(device => device.kind === 'videoinput');
      const hasAudio = devices.some(device => device.kind === 'audioinput');

      if (finalConstraints.video && !hasVideo) {
        console.warn('⚠️ No video input devices found');
        finalConstraints.video = false;
      }
      if (finalConstraints.audio && !hasAudio) {
        console.warn('⚠️ No audio input devices found');
        finalConstraints.audio = false;
      }

      const stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      this.localStream = stream;

      console.log('✅ Local stream obtained successfully');
      console.log(`📊 Stream tracks: ${stream.getVideoTracks().length} video, ${stream.getAudioTracks().length} audio`);

      return stream;

    } catch (error) {
      console.error('❌ Error getting user media:', error);

      // Try progressive fallbacks
      const fallbackAttempts = [
        {
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        },
        {
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true
        },
        {
          video: true,
          audio: true
        },
        {
          video: false,
          audio: true
        }
      ];

      for (let i = 0; i < fallbackAttempts.length; i++) {
        try {
          console.log(`🔄 Trying fallback attempt ${i + 1}:`, fallbackAttempts[i]);
          const stream = await navigator.mediaDevices.getUserMedia(fallbackAttempts[i]);
          this.localStream = stream;
          console.log('✅ Fallback stream obtained successfully');
          return stream;
        } catch (fallbackError) {
          console.warn(`⚠️ Fallback attempt ${i + 1} failed:`, fallbackError.message);
          if (i === fallbackAttempts.length - 1) {
            console.error('❌ All fallback attempts failed');
            this.handleError('media_access_failed', fallbackError);
            throw fallbackError;
          }
        }
      }
    }
  }

  /**
   * Add local stream to peer connection with error handling
   */
  addLocalStream(stream) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      if (!stream) {
        throw new Error('Stream is required');
      }

      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      stream.getTracks().forEach(track => {
        try {
          console.log(`➕ Adding ${track.kind} track to peer connection`);
          this.peerConnection.addTrack(track, stream);
        } catch (trackError) {
          console.error(`❌ Error adding ${track.kind} track:`, trackError);
          this.handleError('track_add_failed', trackError);
        }
      });

      console.log('✅ All tracks added to peer connection');
    } catch (error) {
      console.error('❌ Error adding local stream:', error);
      this.handleError('add_stream_failed', error);
      throw error;
    }
  }

  /**
   * Create offer with collision detection and state validation
   */
  async createOffer(options = {}) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      // Check signaling state
      if (this.peerConnection.signalingState !== 'stable' && this.peerConnection.signalingState !== 'have-local-offer') {
        console.warn(`⚠️ Creating offer in signaling state: ${this.peerConnection.signalingState}`);
      }

      console.log('📤 Creating offer...');

      const defaultOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      };

      const offerOptions = { ...defaultOptions, ...options };

      const offer = await this.peerConnection.createOffer(offerOptions);
      await this.peerConnection.setLocalDescription(offer);

      console.log('✅ Local description set (offer)');

      if (this.socket && this.socket.connected) {
        this.socket.emit('offer', offer);
      }

      return offer;
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      this.handleError('create_offer_failed', error);
      throw error;
    }
  }

  /**
   * Handle received offer with collision detection
   */
  async handleOffer(offer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      // Validate offer
      if (!offer || !offer.type || !offer.sdp) {
        throw new Error('Invalid offer received');
      }

      console.log('📥 Handling offer...');

      // Handle offer collision detection
      const offerCollision = (offer.type === 'offer') &&
                           (this.makingOffer || this.peerConnection.signalingState !== 'stable');

      this.ignoreOffer = !this.isPolite && offerCollision;

      if (this.ignoreOffer) {
        console.log('🚫 Ignoring offer due to collision');
        return;
      }

      this.isSettingRemoteAnswerPending = offer.type === 'answer';

      await this.peerConnection.setRemoteDescription(offer);

      this.isSettingRemoteAnswerPending = false;

      if (offer.type === 'offer') {
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        console.log('✅ Local description set (answer)');

        if (this.socket && this.socket.connected) {
          this.socket.emit('answer', answer);
        }

        return answer;
      }
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      this.handleError('handle_offer_failed', error);
      throw error;
    }
  }

  /**
   * Handle received answer with validation
   */
  async handleAnswer(answer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      // Validate answer
      if (!answer || !answer.type || !answer.sdp) {
        throw new Error('Invalid answer received');
      }

      if (answer.type !== 'answer') {
        throw new Error('Expected answer but received: ' + answer.type);
      }

      console.log('📥 Handling answer...');

      await this.peerConnection.setRemoteDescription(answer);
      console.log('✅ Remote description set (answer)');

    } catch (error) {
      console.error('❌ Error handling answer:', error);
      this.handleError('handle_answer_failed', error);
      throw error;
    }
  }

  /**
   * Handle received ICE candidate with validation
   */
  async handleIceCandidate(candidate) {
    try {
      if (!this.peerConnection) {
        console.warn('⚠️ No peer connection, ignoring ICE candidate');
        return;
      }

      if (this.isDisposed) {
        console.warn('⚠️ Service disposed, ignoring ICE candidate');
        return;
      }

      // Validate candidate
      if (!this.validateIceCandidate(candidate)) {
        console.warn('⚠️ Invalid ICE candidate received, ignoring');
        return;
      }

      console.log('🧊 Adding ICE candidate');

      // Only add candidate if remote description is set
      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
        console.log('✅ ICE candidate added successfully');
      } else {
        console.log('⏳ Remote description not set, candidate will be processed automatically');
      }

    } catch (error) {
      console.warn('⚠️ Error adding ICE candidate (non-fatal):', error.message);
      // Don't throw - ICE candidate errors are often non-fatal
    }
  }

  /**
   * Get comprehensive connection statistics
   */
  async getConnectionStats() {
    if (!this.peerConnection) {
      return null;
    }

    try {
      const stats = await this.peerConnection.getStats();
      const report = {
        timestamp: Date.now(),
        connectionState: this.getConnectionState(),
        iceConnectionState: this.getIceConnectionState(),
        signalingState: this.getSignalingState()
      };

      stats.forEach((stat) => {
        try {
          if (stat.type === 'inbound-rtp' && stat.mediaType === 'video') {
            report.inboundVideo = {
              bytesReceived: stat.bytesReceived || 0,
              packetsReceived: stat.packetsReceived || 0,
              packetsLost: stat.packetsLost || 0,
              frameRate: stat.framesPerSecond || 0,
              timestamp: stat.timestamp
            };
          }

          if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
            report.outboundVideo = {
              bytesSent: stat.bytesSent || 0,
              packetsSent: stat.packetsSent || 0,
              frameRate: stat.framesPerSecond || 0,
              timestamp: stat.timestamp
            };
          }

          if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
            report.connection = {
              localCandidateType: stat.localCandidateType,
              remoteCandidateType: stat.remoteCandidateType,
              state: stat.state,
              currentRoundTripTime: stat.currentRoundTripTime,
              availableOutgoingBitrate: stat.availableOutgoingBitrate
            };
          }

          if (stat.type === 'inbound-rtp' && stat.mediaType === 'audio') {
            report.inboundAudio = {
              bytesReceived: stat.bytesReceived || 0,
              packetsReceived: stat.packetsReceived || 0,
              packetsLost: stat.packetsLost || 0,
              audioLevel: stat.audioLevel
            };
          }
        } catch (statError) {
          console.warn('⚠️ Error processing individual stat:', statError);
        }
      });

      return report;
    } catch (error) {
      console.error('❌ Error getting connection stats:', error);
      return null;
    }
  }

  /**
   * Set politeness for offer collision handling
   */
  setPoliteness(isPolite) {
    this.isPolite = !!isPolite;
    console.log(`🤝 Politeness set to: ${this.isPolite}`);
  }

  /**
   * Check if WebRTC is supported with detailed feature detection
   */
  static isSupported() {
    const support = {
      rtcPeerConnection: !!window.RTCPeerConnection,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      enumerateDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
      webRTC: true
    };

    support.webRTC = support.rtcPeerConnection && support.getUserMedia;

    return support.webRTC;
  }

  /**
   * Get detailed browser support information
   */
  static getBrowserSupportInfo() {
    return {
      rtcPeerConnection: !!window.RTCPeerConnection,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      enumerateDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
      webRTC: WebRTCService.isSupported(),
      browser: this.getBrowserInfo()
    };
  }

  /**
   * Get browser information
   */
  static getBrowserInfo() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'chrome';
    if (userAgent.includes('Firefox')) return 'firefox';
    if (userAgent.includes('Safari')) return 'safari';
    if (userAgent.includes('Edge')) return 'edge';
    return 'unknown';
  }

  /**
   * Comprehensive cleanup with resource management
   */
  cleanup() {
    try {
      console.log('🧹 Cleaning up WebRTC service...');

      // Mark as disposed to prevent further operations
      this.isDisposed = true;

      // Stop quality monitoring
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.timers.delete(this.statsInterval);
        this.statsInterval = null;
      }

      // Clear all tracked timers
      this.timers.forEach(timerId => {
        try {
          clearTimeout(timerId);
          clearInterval(timerId);
        } catch (error) {
          console.warn('⚠️ Error clearing timer:', error);
        }
      });
      this.timers.clear();

      // Clear ICE gathering timeout
      this.clearIceGatheringTimeout();

      // Stop local stream tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          try {
            track.stop();
            console.log(`🛑 Stopped local ${track.kind} track`);
          } catch (error) {
            console.warn(`⚠️ Error stopping ${track.kind} track:`, error);
          }
        });
        this.localStream = null;
      }

      // Stop remote stream tracks if available
      if (this.remoteStream) {
        this.remoteStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.warn(`⚠️ Error stopping remote ${track.kind} track:`, error);
          }
        });
        this.remoteStream = null;
      }

      // Close peer connection properly
      this.closePeerConnection();

      // Reset state
      this.socket = null;
      this.isInitialized = false;
      this.connectionAttempts = 0;
      this.isReconnecting = false;
      this.iceRestartCount = 0;
      this.makingOffer = false;
      this.ignoreOffer = false;
      this.isSettingRemoteAnswerPending = false;
      this.connectionQuality = 'unknown';
      this.lastStatsTime = 0;

      // Clear all event handlers
      this.onRemoteStream = null;
      this.onConnectionStateChange = null;
      this.onIceCandidate = null;
      this.onError = null;
      this.onConnectionQualityChange = null;
      this.onReconnecting = null;
      this.onReconnected = null;

      console.log('✅ WebRTC service cleanup complete');

    } catch (error) {
      console.error('❌ Error during WebRTC service cleanup:', error);
    }
  }

  /**
   * Destructor-like method for complete cleanup
   */
  destroy() {
    this.cleanup();
  }

  /**
   * Status and information getters
   */
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

  isDisconnected() {
    const state = this.getConnectionState();
    return state === 'disconnected' || state === 'failed' || state === 'closed';
  }

  /**
   * Get comprehensive service status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isDisposed: this.isDisposed,
      connectionState: this.getConnectionState(),
      iceConnectionState: this.getIceConnectionState(),
      signalingState: this.getSignalingState(),
      isConnected: this.isConnected(),
      isReconnecting: this.isReconnecting,
      connectionAttempts: this.connectionAttempts,
      iceRestartCount: this.iceRestartCount,
      connectionQuality: this.connectionQuality,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
      localStreamTracks: this.localStream ? {
        video: this.localStream.getVideoTracks().length,
        audio: this.localStream.getAudioTracks().length
      } : { video: 0, audio: 0 },
      remoteStreamTracks: this.remoteStream ? {
        video: this.remoteStream.getVideoTracks().length,
        audio: this.remoteStream.getAudioTracks().length
      } : { video: 0, audio: 0 }
    };
  }

  /**
   * Get connection quality information
   */
  getConnectionQuality() {
    return {
      quality: this.connectionQuality,
      lastStatsTime: this.lastStatsTime,
      isMonitoring: !!this.statsInterval
    };
  }
}

export default WebRTCService;