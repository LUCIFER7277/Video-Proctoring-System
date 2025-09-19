// WebRTC Configuration utility
export const getWebRTCConfig = async () => {
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

  // Add Metered.ca TURN servers
  await addMeteredTurnServers(iceServers);

  // Add legacy TURN servers if configured
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

// Metered.ca TURN server integration
export const addMeteredTurnServers = async (iceServers) => {
  const meteredApiKey = import.meta.env.VITE_METERED_API_KEY;
  const meteredAppName = import.meta.env.VITE_METERED_APP_NAME;
  const meteredUsername = import.meta.env.VITE_METERED_USERNAME;
  const meteredPassword = import.meta.env.VITE_METERED_PASSWORD;

  // Option 1: Dynamic credentials (recommended for production)
  if (meteredApiKey && meteredAppName) {
    try {
      console.log('Fetching dynamic TURN credentials from Metered.ca...');
      const response = await fetch(
        `https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`
      );

      if (response.ok) {
        const turnServers = await response.json();
        iceServers.push(...turnServers);
        console.log('Added Metered.ca dynamic TURN servers:', turnServers.length);
        return;
      } else {
        console.warn('Failed to fetch Metered.ca credentials:', response.status);
      }
    } catch (error) {
      console.warn('Error fetching Metered.ca credentials:', error.message);
    }
  }

  // Option 2: Manual username/password credentials
  if (meteredUsername && meteredPassword) {
    console.log('Using Metered.ca manual credentials...');
    const manualTurnServers = [
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: meteredUsername,
        credential: meteredPassword
      },
      {
        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
        username: meteredUsername,
        credential: meteredPassword
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: meteredUsername,
        credential: meteredPassword
      },
      {
        urls: 'turn:global.relay.metered.ca:443?transport=tcp',
        username: meteredUsername,
        credential: meteredPassword
      }
    ];

    iceServers.push(...manualTurnServers);
    console.log('Added Metered.ca manual TURN servers:', manualTurnServers.length);
    return;
  }

  // Option 3: Static authentication (fallback)
  console.log('Using Metered.ca static TURN servers...');
  const staticTurnServers = [
    {
      urls: 'turn:staticauth.openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayprojectsecret'
    },
    {
      urls: 'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
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
  ];

  iceServers.push(...staticTurnServers);
  console.log('Added Metered.ca static TURN servers:', staticTurnServers.length);
};

// Get Metered.ca TURN credentials dynamically
export const getMeteredCredentials = async () => {
  const meteredApiKey = import.meta.env.VITE_METERED_API_KEY;
  const meteredAppName = import.meta.env.VITE_METERED_APP_NAME;

  if (!meteredApiKey || !meteredAppName) {
    throw new Error('Metered.ca API key or app name not configured');
  }

  try {
    const response = await fetch(
      `https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch credentials: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Metered.ca credentials:', error);
    throw error;
  }
};