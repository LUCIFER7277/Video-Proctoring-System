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
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };
};

// Additional WebRTC utilities
export const createPeerConnection = (onTrack, onIceCandidate, onConnectionStateChange) => {
  const config = getWebRTCConfig();
  const peerConnection = new RTCPeerConnection(config);

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