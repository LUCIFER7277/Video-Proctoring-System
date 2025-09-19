/**
 * Professional Connection Test Utility
 * Comprehensive testing for WebRTC connectivity
 */

import ProfessionalWebRTCService from '../services/professionalWebRTCService';

/**
 * Test WebRTC connectivity with comprehensive reporting
 */
export const testWebRTCConnectivity = async () => {
  const results = {
    timestamp: new Date().toISOString(),
    browser: getBrowserInfo(),
    overall: 'unknown',
    tests: {
      media: { status: 'pending', details: null },
      webrtc: { status: 'pending', details: null },
      network: { status: 'pending', details: null },
      turn: { status: 'pending', details: null }
    },
    recommendations: []
  };

  try {
    console.log('🧪 Starting comprehensive WebRTC connectivity test...');

    // Test 1: Media Devices
    results.tests.media = await testMediaDevices();

    // Test 2: WebRTC Support
    results.tests.webrtc = await testWebRTCSupport();

    // Test 3: Network Connectivity
    results.tests.network = await testNetworkConnectivity();

    // Test 4: TURN Server Connectivity
    results.tests.turn = await testTurnServers();

    // Generate overall assessment
    results.overall = calculateOverallStatus(results.tests);
    results.recommendations = generateRecommendations(results.tests);

    console.log('✅ WebRTC connectivity test completed:', results.overall);
    return results;

  } catch (error) {
    console.error('❌ Connectivity test failed:', error);
    results.overall = 'failed';
    results.error = error.message;
    return results;
  }
};

/**
 * Test media device access and capabilities
 */
const testMediaDevices = async () => {
  try {
    const test = {
      status: 'testing',
      details: {
        video: { available: false, quality: 'none', error: null },
        audio: { available: false, quality: 'none', error: null },
        devices: { video: 0, audio: 0 }
      }
    };

    // Check device enumeration
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      test.details.devices.video = devices.filter(d => d.kind === 'videoinput').length;
      test.details.devices.audio = devices.filter(d => d.kind === 'audioinput').length;
    } catch (error) {
      console.warn('Device enumeration failed:', error);
    }

    // Test video access
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();

      test.details.video.available = true;
      test.details.video.quality = determineVideoQuality(settings);

      videoStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      test.details.video.error = error.name;
    }

    // Test audio access
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      test.details.audio.available = true;
      test.details.audio.quality = 'good';

      audioStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      test.details.audio.error = error.name;
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
      error: error.message
    };
  }
};

/**
 * Test WebRTC API support
 */
const testWebRTCSupport = async () => {
  try {
    const test = {
      status: 'testing',
      details: {
        rtcPeerConnection: !!window.RTCPeerConnection,
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        mediaRecorder: !!window.MediaRecorder,
        webrtcAdapterJS: false
      }
    };

    // Test basic WebRTC functionality
    if (test.details.rtcPeerConnection) {
      try {
        const pc = new RTCPeerConnection();
        pc.close();
        test.details.basicFunctionality = true;
      } catch (error) {
        test.details.basicFunctionality = false;
        test.details.basicError = error.message;
      }
    }

    // Check for adapter.js
    test.details.webrtcAdapterJS = !!(window.adapter && window.adapter.browserDetails);

    // Determine status
    const requiredFeatures = [
      test.details.rtcPeerConnection,
      test.details.getUserMedia
    ];

    test.status = requiredFeatures.every(feature => feature) ? 'passed' : 'failed';

    return test;
  } catch (error) {
    return {
      status: 'failed',
      error: error.message
    };
  }
};

/**
 * Test network connectivity to STUN/TURN servers
 */
const testNetworkConnectivity = async () => {
  try {
    const test = {
      status: 'testing',
      details: {
        stunServers: [],
        iceGathering: 'unknown',
        connectivity: 'unknown'
      }
    };

    // Test ICE gathering
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    });

    const candidates = [];

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        test.details.iceGathering = candidates.length > 0 ? 'partial' : 'failed';
        test.details.candidatesFound = candidates.length;
        test.status = candidates.length > 0 ? 'passed' : 'failed';
        resolve(test);
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidates.push({
            type: event.candidate.type,
            protocol: event.candidate.protocol,
            address: event.candidate.address
          });
        } else {
          // ICE gathering complete
          clearTimeout(timeout);
          pc.close();

          test.details.iceGathering = 'complete';
          test.details.candidatesFound = candidates.length;
          test.details.candidateTypes = [...new Set(candidates.map(c => c.type))];

          test.status = candidates.length > 0 ? 'passed' : 'failed';
          resolve(test);
        }
      };

      // Create a data channel to trigger ICE gathering
      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });

  } catch (error) {
    return {
      status: 'failed',
      error: error.message
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