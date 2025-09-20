/**
 * Professional Connection Test Utility
 * Comprehensive testing for WebRTC connectivity with proper resource management
 */

import ProfessionalWebRTCService from '../services/professionalWebRTCService';

/**
 * Connection Test Manager Class for proper resource tracking and cleanup
 */
class ConnectionTestManager {
  constructor() {
    this.activePeerConnections = new Set();
    this.activeTimeouts = new Set();
    this.activeStreams = new Set();
    this.isDisposed = false;
    this.abortController = new AbortController();
  }

  /**
   * Create a tracked PeerConnection that will be properly cleaned up
   */
  createTrackedPeerConnection(config) {
    if (this.isDisposed) {
      throw new Error('Test manager has been disposed');
    }

    const pc = new RTCPeerConnection(config);
    this.activePeerConnections.add(pc);

    // Auto-cleanup on state change to closed
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'closed') {
        this.activePeerConnections.delete(pc);
      }
    });

    return pc;
  }

  /**
   * Create a tracked timeout that will be properly cleaned up
   */
  createTrackedTimeout(callback, delay) {
    if (this.isDisposed) {
      return null;
    }

    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(timeoutId);
      if (!this.isDisposed) {
        callback();
      }
    }, delay);

    this.activeTimeouts.add(timeoutId);
    return timeoutId;
  }

  /**
   * Clear a tracked timeout
   */
  clearTrackedTimeout(timeoutId) {
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(timeoutId);
    }
  }

  /**
   * Track a media stream for cleanup
   */
  trackStream(stream) {
    if (!this.isDisposed && stream) {
      this.activeStreams.add(stream);
    }
    return stream;
  }

  /**
   * Check if test should be aborted
   */
  isAborted() {
    return this.abortController.signal.aborted || this.isDisposed;
  }

  /**
   * Abort all running tests
   */
  abort() {
    this.abortController.abort();
    this.cleanup();
  }

  /**
   * Clean up all tracked resources
   */
  cleanup() {
    this.isDisposed = true;

    // Close all peer connections
    this.activePeerConnections.forEach(pc => {
      try {
        if (pc.connectionState !== 'closed') {
          pc.close();
        }
      } catch (error) {
        console.warn('Error closing peer connection:', error);
      }
    });
    this.activePeerConnections.clear();

    // Clear all timeouts
    this.activeTimeouts.forEach(timeoutId => {
      try {
        clearTimeout(timeoutId);
      } catch (error) {
        console.warn('Error clearing timeout:', error);
      }
    });
    this.activeTimeouts.clear();

    // Stop all streams
    this.activeStreams.forEach(stream => {
      try {
        stream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (error) {
        console.warn('Error stopping stream:', error);
      }
    });
    this.activeStreams.clear();
  }
}

/**
 * Get TURN server configuration from environment or fallback
 */
const getTurnServerConfig = () => {
  // Check for environment variables first (secure approach)
  if (typeof process !== 'undefined' && process.env) {
    const turnUrl = process.env.REACT_APP_TURN_URL;
    const turnUsername = process.env.REACT_APP_TURN_USERNAME;
    const turnCredential = process.env.REACT_APP_TURN_CREDENTIAL;

    if (turnUrl && turnUsername && turnCredential) {
      return [{
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential
      }];
    }
  }

  // Fallback to public test servers (with warning)
  console.warn('⚠️ Using public TURN servers for testing. Configure environment variables for production.');
  return [
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
};

/**
 * Test WebRTC connectivity with comprehensive reporting and resource management
 */
export const testWebRTCConnectivity = async (options = {}) => {
  const testManager = new ConnectionTestManager();

  const results = {
    timestamp: new Date().toISOString(),
    browser: getBrowserInfo(),
    overall: 'unknown',
    tests: {
      browser: { status: 'pending', details: null },
      media: { status: 'pending', details: null },
      webrtc: { status: 'pending', details: null },
      network: { status: 'pending', details: null },
      turn: { status: 'pending', details: null }
    },
    recommendations: [],
    testId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };

  try {
    console.log('🧪 Starting comprehensive WebRTC connectivity test...');

    // Validate browser compatibility first
    results.tests.browser = await testBrowserCompatibility();

    if (results.tests.browser.status === 'failed') {
      throw new Error('Browser not compatible with WebRTC requirements');
    }

    // Test 1: Media Devices
    if (!testManager.isAborted()) {
      results.tests.media = await testMediaDevices(testManager);
    }

    // Test 2: WebRTC Support
    if (!testManager.isAborted()) {
      results.tests.webrtc = await testWebRTCSupport(testManager);
    }

    // Test 3: Network Connectivity
    if (!testManager.isAborted()) {
      results.tests.network = await testNetworkConnectivity(testManager);
    }

    // Test 4: TURN Server Connectivity
    if (!testManager.isAborted()) {
      results.tests.turn = await testTurnServers(testManager);
    }

    // Generate overall assessment
    results.overall = calculateOverallStatus(results.tests);
    results.recommendations = generateRecommendations(results.tests);

    console.log('✅ WebRTC connectivity test completed:', results.overall);
    return results;

  } catch (error) {
    console.error('❌ Connectivity test failed:', error);
    results.overall = 'failed';
    results.error = {
      message: error.message,
      code: error.name || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString()
    };
    return results;
  } finally {
    // Always cleanup resources
    try {
      testManager.cleanup();
    } catch (cleanupError) {
      console.warn('⚠️ Error during test cleanup:', cleanupError);
    }
  }
};

/**
 * Test browser compatibility and minimum requirements
 */
const testBrowserCompatibility = async () => {
  try {
    const test = {
      status: 'testing',
      details: {
        browser: getBrowserInfo(),
        isSupported: false,
        requiredFeatures: {},
        missingFeatures: [],
        warnings: []
      }
    };

    // Check required features
    const requiredFeatures = {
      RTCPeerConnection: !!window.RTCPeerConnection,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      enumerateDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
      mediaRecorder: !!window.MediaRecorder,
      webRTCStats: !!(window.RTCPeerConnection && RTCPeerConnection.prototype.getStats)
    };

    test.details.requiredFeatures = requiredFeatures;

    // Check for missing features
    Object.entries(requiredFeatures).forEach(([feature, supported]) => {
      if (!supported) {
        test.details.missingFeatures.push(feature);
      }
    });

    // Browser-specific checks
    const browserInfo = test.details.browser;
    if (browserInfo.name === 'Chrome' && parseInt(browserInfo.version) < 80) {
      test.details.warnings.push('Chrome version 80+ recommended for full WebRTC support');
    } else if (browserInfo.name === 'Firefox' && parseInt(browserInfo.version) < 75) {
      test.details.warnings.push('Firefox version 75+ recommended for full WebRTC support');
    } else if (browserInfo.name === 'Safari' && parseInt(browserInfo.version) < 13) {
      test.details.warnings.push('Safari version 13+ recommended for full WebRTC support');
    }

    // Check for secure context (HTTPS requirement)
    if (!window.isSecureContext) {
      test.details.warnings.push('HTTPS required for getUserMedia in production');
    }

    // Determine support status
    const criticalFeatures = ['RTCPeerConnection', 'getUserMedia'];
    const hasCriticalFeatures = criticalFeatures.every(feature => requiredFeatures[feature]);

    test.details.isSupported = hasCriticalFeatures;
    test.status = hasCriticalFeatures ? 'passed' : 'failed';

    return test;
  } catch (error) {
    return {
      status: 'failed',
      error: {
        message: error.message,
        code: 'BROWSER_CHECK_FAILED'
      }
    };
  }
};

/**
 * Test media device access and capabilities with proper resource management
 */
const testMediaDevices = async (testManager) => {
  try {
    const test = {
      status: 'testing',
      details: {
        video: { available: false, quality: 'none', error: null, settings: null },
        audio: { available: false, quality: 'none', error: null, settings: null },
        devices: { video: 0, audio: 0, total: 0 },
        permissions: { video: 'unknown', audio: 'unknown' }
      }
    };

    if (testManager.isAborted()) {
      throw new Error('Test aborted');
    }

    // Check device enumeration with timeout
    try {
      const enumeratePromise = navigator.mediaDevices.enumerateDevices();
      const timeoutPromise = new Promise((_, reject) => {
        testManager.createTrackedTimeout(() => {
          reject(new Error('Device enumeration timeout'));
        }, 5000);
      });

      const devices = await Promise.race([enumeratePromise, timeoutPromise]);

      test.details.devices.video = devices.filter(d => d.kind === 'videoinput').length;
      test.details.devices.audio = devices.filter(d => d.kind === 'audioinput').length;
      test.details.devices.total = devices.length;

      console.log(`📱 Found ${test.details.devices.video} video and ${test.details.devices.audio} audio devices`);
    } catch (error) {
      console.warn('⚠️ Device enumeration failed:', error);
      test.details.devices.error = error.message;
    }

    if (testManager.isAborted()) {
      throw new Error('Test aborted');
    }

    // Test video access with comprehensive error handling
    try {
      const videoConstraints = {
        video: {
          width: { ideal: 640, max: 1280, min: 320 },
          height: { ideal: 480, max: 720, min: 240 },
          frameRate: { ideal: 30, max: 30, min: 15 }
        }
      };

      const videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      testManager.trackStream(videoStream);

      const videoTrack = videoStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};

        test.details.video.available = true;
        test.details.video.quality = determineVideoQuality(settings);
        test.details.video.settings = settings;
        test.details.video.capabilities = capabilities;
        test.details.permissions.video = 'granted';

        console.log(`📹 Video test passed: ${settings.width}x${settings.height} at ${settings.frameRate}fps`);
      }

      // Clean up immediately
      videoStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (stopError) {
          console.warn('⚠️ Error stopping video track:', stopError);
        }
      });

    } catch (error) {
      console.warn('⚠️ Video access failed:', error);
      test.details.video.error = {
        name: error.name,
        message: error.message,
        code: getMediaErrorCode(error)
      };
      test.details.permissions.video = getPermissionStatus(error);
    }

    if (testManager.isAborted()) {
      throw new Error('Test aborted');
    }

    // Test audio access with comprehensive error handling
    try {
      const audioConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 }
        }
      };

      const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      testManager.trackStream(audioStream);

      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        const capabilities = audioTrack.getCapabilities ? audioTrack.getCapabilities() : {};

        test.details.audio.available = true;
        test.details.audio.quality = determineAudioQuality(settings);
        test.details.audio.settings = settings;
        test.details.audio.capabilities = capabilities;
        test.details.permissions.audio = 'granted';

        console.log(`🎤 Audio test passed: ${settings.sampleRate}Hz, EC:${settings.echoCancellation}`);
      }

      // Clean up immediately
      audioStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (stopError) {
          console.warn('⚠️ Error stopping audio track:', stopError);
        }
      });

    } catch (error) {
      console.warn('⚠️ Audio access failed:', error);
      test.details.audio.error = {
        name: error.name,
        message: error.message,
        code: getMediaErrorCode(error)
      };
      test.details.permissions.audio = getPermissionStatus(error);
    }

    // Determine test status
    if (test.details.video.available && test.details.audio.available) {
      test.status = 'passed';
    } else if (test.details.video.available || test.details.audio.available) {
      test.status = 'partial';
    } else {
      test.status = 'failed';
    }

    return test;

  } catch (error) {
    return {
      status: 'failed',
      error: {
        message: error.message,
        code: 'MEDIA_TEST_FAILED',
        timestamp: new Date().toISOString()
      }
    };
  }
};

/**
 * Get media error code for better error categorization
 */
const getMediaErrorCode = (error) => {
  switch (error.name) {
    case 'NotAllowedError':
      return 'PERMISSION_DENIED';
    case 'NotFoundError':
      return 'DEVICE_NOT_FOUND';
    case 'NotReadableError':
      return 'DEVICE_IN_USE';
    case 'OverconstrainedError':
      return 'CONSTRAINTS_NOT_SATISFIED';
    case 'SecurityError':
      return 'SECURITY_ERROR';
    case 'TypeError':
      return 'INVALID_CONSTRAINTS';
    default:
      return 'UNKNOWN_MEDIA_ERROR';
  }
};

/**
 * Get permission status from error
 */
const getPermissionStatus = (error) => {
  switch (error.name) {
    case 'NotAllowedError':
      return 'denied';
    case 'NotFoundError':
      return 'no_device';
    case 'NotReadableError':
      return 'device_busy';
    default:
      return 'unknown';
  }
};

/**
 * Determine audio quality based on settings
 */
const determineAudioQuality = (settings) => {
  const { sampleRate = 0, echoCancellation = false, noiseSuppression = false } = settings;

  if (sampleRate >= 44100 && echoCancellation && noiseSuppression) {
    return 'excellent';
  } else if (sampleRate >= 22050 && (echoCancellation || noiseSuppression)) {
    return 'good';
  } else if (sampleRate >= 16000) {
    return 'fair';
  } else {
    return 'poor';
  }
};

/**
 * Test WebRTC API support with comprehensive validation
 */
const testWebRTCSupport = async (testManager) => {
  try {
    const test = {
      status: 'testing',
      details: {
        rtcPeerConnection: !!window.RTCPeerConnection,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        mediaRecorder: !!window.MediaRecorder,
        webrtcAdapterJS: false,
        basicFunctionality: false,
        dataChannels: false,
        statistics: false
      }
    };

    if (testManager.isAborted()) {
      throw new Error('Test aborted');
    }

    // Test basic WebRTC functionality with proper cleanup
    if (test.details.rtcPeerConnection) {
      try {
        const pc = testManager.createTrackedPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Test data channel creation
        try {
          const dataChannel = pc.createDataChannel('test', { ordered: true });
          test.details.dataChannels = true;
          dataChannel.close();
        } catch (dcError) {
          console.warn('⚠️ Data channel test failed:', dcError);
          test.details.dataChannelError = dcError.message;
        }

        // Test statistics API
        try {
          await pc.getStats();
          test.details.statistics = true;
        } catch (statsError) {
          console.warn('⚠️ Statistics API test failed:', statsError);
          test.details.statisticsError = statsError.message;
        }

        pc.close();
        test.details.basicFunctionality = true;
        console.log('✅ WebRTC basic functionality test passed');

      } catch (error) {
        test.details.basicFunctionality = false;
        test.details.basicError = {
          message: error.message,
          code: 'WEBRTC_BASIC_FAILED'
        };
        console.warn('⚠️ WebRTC basic functionality test failed:', error);
      }
    }

    // Check for adapter.js
    test.details.webrtcAdapterJS = !!(window.adapter && window.adapter.browserDetails);

    // Additional WebRTC feature detection
    test.details.features = {
      insertableStreams: !!window.RTCRtpScriptTransform,
      simulcast: true, // Most modern browsers support this
      svc: false, // Scalable Video Coding - limited support
      av1: false, // Check AV1 codec support
      vp9: false  // Check VP9 codec support
    };

    // Determine status
    const requiredFeatures = [
      test.details.rtcPeerConnection,
      test.details.getUserMedia,
      test.details.basicFunctionality
    ];

    const optionalFeatures = [
      test.details.dataChannels,
      test.details.statistics
    ];

    if (requiredFeatures.every(feature => feature)) {
      test.status = optionalFeatures.some(feature => feature) ? 'passed' : 'partial';
    } else {
      test.status = 'failed';
    }

    return test;

  } catch (error) {
    return {
      status: 'failed',
      error: {
        message: error.message,
        code: 'WEBRTC_TEST_FAILED',
        timestamp: new Date().toISOString()
      }
    };
  }
};

/**
 * Test network connectivity to STUN servers with proper resource management
 */
const testNetworkConnectivity = async (testManager) => {
  try {
    const test = {
      status: 'testing',
      details: {
        stunServers: [],
        iceGathering: 'unknown',
        connectivity: 'unknown',
        candidatesFound: 0,
        candidateTypes: [],
        networkType: 'unknown'
      }
    };

    if (testManager.isAborted()) {
      throw new Error('Test aborted');
    }

    const pc = testManager.createTrackedPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    const candidates = [];

    return new Promise((resolve) => {
      const timeoutId = testManager.createTrackedTimeout(() => {
        if (!testManager.isAborted()) {
          test.details.iceGathering = candidates.length > 0 ? 'partial' : 'timeout';
          test.details.candidatesFound = candidates.length;
          test.details.candidateTypes = [...new Set(candidates.map(c => c.type))];
          test.status = candidates.length > 0 ? 'passed' : 'failed';

          console.log(`🌐 Network test completed: ${candidates.length} candidates found`);
          resolve(test);
        }
      }, 8000); // Increased timeout for better reliability

      pc.onicecandidate = (event) => {
        try {
          if (testManager.isAborted()) {
            return;
          }

          if (event.candidate) {
            const candidateInfo = {
              type: event.candidate.type,
              protocol: event.candidate.protocol,
              address: event.candidate.address,
              port: event.candidate.port,
              priority: event.candidate.priority
            };

            candidates.push(candidateInfo);
            console.log(`🧊 ICE candidate: ${candidateInfo.type} (${candidateInfo.protocol})`);

          } else {
            // ICE gathering complete
            testManager.clearTrackedTimeout(timeoutId);

            test.details.iceGathering = 'complete';
            test.details.candidatesFound = candidates.length;
            test.details.candidateTypes = [...new Set(candidates.map(c => c.type))];

            // Analyze network type based on candidates
            if (candidates.some(c => c.type === 'srflx')) {
              test.details.networkType = 'nat';
            } else if (candidates.some(c => c.type === 'host')) {
              test.details.networkType = 'direct';
            } else {
              test.details.networkType = 'restricted';
            }

            test.status = candidates.length > 0 ? 'passed' : 'failed';
            console.log(`✅ ICE gathering complete: ${candidates.length} candidates`);
            resolve(test);
          }
        } catch (candidateError) {
          console.warn('⚠️ Error processing ICE candidate:', candidateError);
        }
      };

      pc.onicegatheringstatechange = () => {
        console.log(`🔄 ICE gathering state: ${pc.iceGatheringState}`);
      };

      // Create a data channel to trigger ICE gathering
      try {
        pc.createDataChannel('connectivity-test');
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(error => {
            console.warn('⚠️ Error creating offer for network test:', error);
            testManager.clearTrackedTimeout(timeoutId);
            test.status = 'failed';
            test.error = { message: error.message, code: 'OFFER_FAILED' };
            resolve(test);
          });
      } catch (error) {
        console.warn('⚠️ Error setting up network test:', error);
        testManager.clearTrackedTimeout(timeoutId);
        test.status = 'failed';
        test.error = { message: error.message, code: 'SETUP_FAILED' };
        resolve(test);
      }
    });

  } catch (error) {
    return {
      status: 'failed',
      error: {
        message: error.message,
        code: 'NETWORK_TEST_FAILED',
        timestamp: new Date().toISOString()
      }
    };
  }
};

/**
 * Test TURN server connectivity
 */
const testTurnServers = async () => {
  try {
    const test = {
      status: 'testing',
      details: {
        servers: [],
        connectivity: 'unknown'
      }
    };

    const turnServers = [
      {
        urls: 'turn:staticauth.openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret'
      }
    ];

    for (const server of turnServers) {
      const serverTest = await testSingleTurnServer(server);
      test.details.servers.push(serverTest);
    }

    // Determine overall TURN connectivity
    const workingServers = test.details.servers.filter(s => s.status === 'working');
    test.status = workingServers.length > 0 ? 'passed' : 'failed';
    test.details.connectivity = workingServers.length > 0 ? 'available' : 'unavailable';

    return test;
  } catch (error) {
    return {
      status: 'failed',
      error: error.message
    };
  }
};

/**
 * Test a single TURN server
 */
const testSingleTurnServer = async (server) => {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [server] });
    const result = {
      urls: server.urls,
      status: 'unknown',
      responseTime: null
    };

    const startTime = Date.now();
    const timeout = setTimeout(() => {
      pc.close();
      result.status = 'timeout';
      resolve(result);
    }, 3000);

    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.type === 'relay') {
        clearTimeout(timeout);
        pc.close();
        result.status = 'working';
        result.responseTime = Date.now() - startTime;
        resolve(result);
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        pc.close();
        if (result.status === 'unknown') {
          result.status = 'no_relay_candidates';
        }
        resolve(result);
      }
    };

    // Trigger ICE gathering
    pc.createDataChannel('test');
    pc.createOffer().then(offer => pc.setLocalDescription(offer));
  });
};

/**
 * Determine video quality based on settings
 */
const determineVideoQuality = (settings) => {
  const { width = 0, height = 0, frameRate = 0 } = settings;

  if (width >= 1280 && height >= 720 && frameRate >= 25) {
    return 'excellent';
  } else if (width >= 640 && height >= 480 && frameRate >= 15) {
    return 'good';
  } else if (width >= 320 && height >= 240) {
    return 'fair';
  } else {
    return 'poor';
  }
};

/**
 * Calculate overall status from test results
 */
const calculateOverallStatus = (tests) => {
  const statuses = Object.values(tests).map(test => test.status);

  if (statuses.includes('failed')) {
    return 'poor';
  } else if (statuses.includes('partial')) {
    return 'fair';
  } else if (statuses.every(status => status === 'passed')) {
    return 'excellent';
  } else {
    return 'unknown';
  }
};

/**
 * Generate recommendations based on test results
 */
const generateRecommendations = (tests) => {
  const recommendations = [];

  // Media recommendations
  if (tests.media.status === 'failed') {
    recommendations.push({
      type: 'critical',
      message: 'Media devices not accessible. Please check camera/microphone permissions.',
      action: 'Allow camera and microphone access in browser settings'
    });
  } else if (tests.media.status === 'partial') {
    if (!tests.media.details.video.available) {
      recommendations.push({
        type: 'warning',
        message: 'Camera not available. Video functionality will be limited.',
        action: 'Connect a camera device and refresh'
      });
    }
    if (!tests.media.details.audio.available) {
      recommendations.push({
        type: 'warning',
        message: 'Microphone not available. Audio functionality will be limited.',
        action: 'Connect a microphone device and refresh'
      });
    }
  }

  // WebRTC recommendations
  if (tests.webrtc.status === 'failed') {
    recommendations.push({
      type: 'critical',
      message: 'WebRTC not supported in this browser.',
      action: 'Use a modern browser (Chrome 80+, Firefox 75+, Safari 13+)'
    });
  }

  // Network recommendations
  if (tests.network.status === 'failed') {
    recommendations.push({
      type: 'warning',
      message: 'Network connectivity issues detected.',
      action: 'Check internet connection and firewall settings'
    });
  }

  // TURN recommendations
  if (tests.turn.status === 'failed') {
    recommendations.push({
      type: 'info',
      message: 'TURN servers not accessible. Connection may fail behind strict firewalls.',
      action: 'Contact IT support if connection issues persist'
    });
  }

  return recommendations;
};

/**
 * Get browser information
 */
const getBrowserInfo = () => {
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Chrome/')) {
    return {
      name: 'Chrome',
      version: userAgent.match(/Chrome\/(\d+)/)?.[1] || 'unknown'
    };
  } else if (userAgent.includes('Firefox/')) {
    return {
      name: 'Firefox',
      version: userAgent.match(/Firefox\/(\d+)/)?.[1] || 'unknown'
    };
  } else if (userAgent.includes('Safari/')) {
    return {
      name: 'Safari',
      version: userAgent.match(/Version\/(\d+)/)?.[1] || 'unknown'
    };
  } else if (userAgent.includes('Edge/')) {
    return {
      name: 'Edge',
      version: userAgent.match(/Edge\/(\d+)/)?.[1] || 'unknown'
    };
  } else {
    return {
      name: 'Unknown',
      version: 'unknown'
    };
  }
};

/**
 * Quick connectivity test for real-time monitoring
 */
export const quickConnectivityTest = async () => {
  try {
    const start = Date.now();

    // Test basic WebRTC functionality
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        resolve({
          status: 'timeout',
          responseTime: Date.now() - start
        });
      }, 2000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          clearTimeout(timeout);
          pc.close();
          resolve({
            status: 'success',
            responseTime: Date.now() - start,
            candidateType: event.candidate.type
          });
        }
      };

      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });

  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
};