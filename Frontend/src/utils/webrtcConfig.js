// WebRTC Configuration utility
export const getWebRTCConfig = () => {
  // Get STUN servers from environment variables
  const stunServersEnv = import.meta.env.VITE_STUN_SERVERS;

  // Parse STUN servers from environment or use defaults
  let stunServers = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
    'stun:stun4.l.google.com:19302'
  ];

  if (stunServersEnv) {
    stunServers = stunServersEnv.split(',').map(server => server.trim());
  }

  // Add additional STUN servers for better connectivity
  const additionalStuns = [
    'stun:stun.relay.metered.ca:80',
    'stun:global.stun.twilio.com:3478',
    'stun:stun.cloudflare.com:3478'
  ];

  const allStunServers = [...stunServers, ...additionalStuns];

  const iceServers = allStunServers.map(server => ({
    urls: server.startsWith('stun:') ? server : `stun:${server}`
  }));

  // Add TURN servers if configured
  const turnUrl = import.meta.env.VITE_TURN_SERVER_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'balanced', // Changed from 'max-bundle' to 'balanced' to fix SDP error
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };
};

// Fallback WebRTC configuration for compatibility
export const getFallbackWebRTCConfig = () => {
  const stunServersEnv = import.meta.env.VITE_STUN_SERVERS;
  let stunServers = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302'
  ];

  if (stunServersEnv) {
    stunServers = stunServersEnv.split(',').map(server => server.trim()).slice(0, 3); // Use only first 3 for fallback
  }

  return {
    iceServers: stunServers.map(server => ({
      urls: server.startsWith('stun:') ? server : `stun:${server}`
    })),
    iceCandidatePoolSize: 5 // Reduced for compatibility
  };
};

// Additional WebRTC utilities
export const createPeerConnection = (onTrack, onIceCandidate, onConnectionStateChange) => {
  let config;
  let peerConnection;

  try {
    // Try with enhanced configuration first
    config = getWebRTCConfig();
    peerConnection = new RTCPeerConnection(config);
    console.log('Created peer connection with enhanced config');
  } catch (error) {
    console.warn('Enhanced config failed, using fallback:', error);
    // Fall back to basic configuration
    config = getFallbackWebRTCConfig();
    peerConnection = new RTCPeerConnection(config);
    console.log('Created peer connection with fallback config');
  }

  if (onTrack) {
    peerConnection.ontrack = onTrack;
  }

  if (onIceCandidate) {
    peerConnection.onicecandidate = onIceCandidate;
  }

  if (onConnectionStateChange) {
    peerConnection.onconnectionstatechange = onConnectionStateChange;
  }

  return peerConnection;
};

// Debug WebRTC configuration
export const logWebRTCConfig = () => {
  const config = getWebRTCConfig();
  console.log('WebRTC Configuration:', config);
  console.log('STUN Servers:', config.iceServers.filter(server => server.urls.includes('stun')));
  console.log('TURN Servers:', config.iceServers.filter(server => server.urls.includes('turn')));
  return config;
};