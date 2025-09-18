// WebRTC Connection Test Utility

class WebRTCTester {
  constructor() {
    this.testResults = {
      webrtcSupport: false,
      mediaAccess: false,
      stunConnectivity: false,
      peerConnection: false,
      details: {}
    };
  }

  // Run comprehensive WebRTC tests
  async runTests() {
    console.log('🧪 Starting WebRTC connectivity tests...');

    try {
      // Test 1: WebRTC Support
      await this.testWebRTCSupport();

      // Test 2: Media Access
      await this.testMediaAccess();

      // Test 3: STUN Server Connectivity
      await this.testSTUNConnectivity();

      // Test 4: Peer Connection Creation
      await this.testPeerConnection();

      console.log('✅ WebRTC tests completed:', this.testResults);
      return this.testResults;

    } catch (error) {
      console.error('❌ WebRTC test failed:', error);
      this.testResults.error = error.message;
      return this.testResults;
    }
  }

  // Test WebRTC API support
  async testWebRTCSupport() {
    console.log('🔍 Testing WebRTC API support...');

    this.testResults.details.webrtc = {
      RTCPeerConnection: !!window.RTCPeerConnection,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      RTCDataChannel: !!window.RTCDataChannel
    };

    this.testResults.webrtcSupport =
      this.testResults.details.webrtc.RTCPeerConnection &&
      this.testResults.details.webrtc.getUserMedia;

    console.log(this.testResults.webrtcSupport ? '✅' : '❌', 'WebRTC Support:', this.testResults.details.webrtc);
  }

  // Test camera and microphone access
  async testMediaAccess() {
    console.log('🎥 Testing media access...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      this.testResults.details.media = {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        constraints: {
          video: stream.getVideoTracks()[0]?.getSettings() || {},
          audio: stream.getAudioTracks()[0]?.getSettings() || {}
        }
      };

      this.testResults.mediaAccess = true;

      // Clean up
      stream.getTracks().forEach(track => track.stop());

      console.log('✅ Media Access:', this.testResults.details.media);

    } catch (error) {
      console.log('❌ Media Access Failed:', error.message);
      this.testResults.details.media = { error: error.message };
      this.testResults.mediaAccess = false;
    }
  }

  // Test STUN server connectivity
  async testSTUNConnectivity() {
    console.log('🌐 Testing STUN server connectivity...');

    const stunServers = [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302'
    ];

    const results = [];

    for (const stunServer of stunServers) {
      try {
        const result = await this.testSingleSTUN(stunServer);
        results.push({ server: stunServer, success: true, ...result });
      } catch (error) {
        results.push({ server: stunServer, success: false, error: error.message });
      }
    }

    this.testResults.details.stun = results;
    this.testResults.stunConnectivity = results.some(r => r.success);

    console.log(this.testResults.stunConnectivity ? '✅' : '❌', 'STUN Connectivity:', results);
  }

  // Test single STUN server
  async testSingleSTUN(stunUrl) {
    return new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: stunUrl }]
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.close();
          reject(new Error('STUN test timeout'));
        }
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          pc.close();
          resolve({
            candidateType: event.candidate.type,
            address: event.candidate.address,
            port: event.candidate.port
          });
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete' && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          pc.close();
          reject(new Error('No candidates found'));
        }
      };

      // Create a dummy data channel to trigger ICE gathering
      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });
  }

  // Test peer connection creation and basic functionality
  async testPeerConnection() {
    console.log('🔗 Testing peer connection...');

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      // Test data channel
      const dataChannel = pc.createDataChannel('test', {
        ordered: true
      });

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.testResults.details.peerConnection = {
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        dataChannelSupport: !!dataChannel
      };

      this.testResults.peerConnection = true;

      pc.close();

      console.log('✅ Peer Connection:', this.testResults.details.peerConnection);

    } catch (error) {
      console.log('❌ Peer Connection Failed:', error.message);
      this.testResults.details.peerConnection = { error: error.message };
      this.testResults.peerConnection = false;
    }
  }

  // Get browser and system information
  getBrowserInfo() {
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';

    if (userAgent.includes('Chrome/')) {
      browser = 'Chrome';
      version = userAgent.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Firefox/')) {
      browser = 'Firefox';
      version = userAgent.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Safari/')) {
      browser = 'Safari';
      version = userAgent.match(/Version\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Edge/')) {
      browser = 'Edge';
      version = userAgent.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
    }

    return {
      browser,
      version,
      userAgent,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    };
  }

  // Generate test report
  generateReport() {
    const browserInfo = this.getBrowserInfo();

    return {
      timestamp: new Date().toISOString(),
      browserInfo,
      testResults: this.testResults,
      recommendations: this.getRecommendations()
    };
  }

  // Get recommendations based on test results
  getRecommendations() {
    const recommendations = [];

    if (!this.testResults.webrtcSupport) {
      recommendations.push('Update your browser to the latest version that supports WebRTC');
    }

    if (!this.testResults.mediaAccess) {
      recommendations.push('Allow camera and microphone permissions for this website');
      recommendations.push('Check if other applications are using your camera/microphone');
    }

    if (!this.testResults.stunConnectivity) {
      recommendations.push('Check your firewall settings - STUN servers may be blocked');
      recommendations.push('Try connecting from a different network');
    }

    if (!this.testResults.peerConnection) {
      recommendations.push('WebRTC peer connections are not working - contact support');
    }

    if (recommendations.length === 0) {
      recommendations.push('All tests passed! WebRTC should work properly.');
    }

    return recommendations;
  }
}

// Export utility functions
export const runWebRTCTests = async () => {
  const tester = new WebRTCTester();
  return await tester.runTests();
};

export const generateWebRTCReport = async () => {
  const tester = new WebRTCTester();
  await tester.runTests();
  return tester.generateReport();
};

export default WebRTCTester;