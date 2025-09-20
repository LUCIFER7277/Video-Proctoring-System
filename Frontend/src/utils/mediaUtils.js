/**
 * Professional Media Utilities
 * Enhanced media handling for video proctoring system
 */

/**
 * Get optimal media constraints based on device capabilities
 */
export const getOptimalMediaConstraints = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const audioDevices = devices.filter(device => device.kind === 'audioinput');

    const constraints = {
      video: false,
      audio: false
    };

    if (videoDevices.length > 0) {
      constraints.video = {
        width: { ideal: 1280, max: 1920, min: 640 },
        height: { ideal: 720, max: 1080, min: 480 },
        frameRate: { ideal: 30, max: 30, min: 15 },
        facingMode: 'user'
      };
    }

    if (audioDevices.length > 0) {
      constraints.audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 }
      };
    }

    return constraints;
  } catch (error) {
    console.error('Failed to get device capabilities:', error);
    return {
      video: true,
      audio: true
    };
  }
};

/**
 * Test media devices and return capabilities
 */
export const testMediaDevices = async () => {
  const results = {
    video: { available: false, error: null, quality: 'none' },
    audio: { available: false, error: null, quality: 'none' },
    overall: 'failed'
  };

  try {
    // Test video
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = videoStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();

      results.video.available = true;
      results.video.quality = getVideoQuality(settings);

      videoStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      results.video.error = error.message;
    }

    // Test audio
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = audioStream.getAudioTracks()[0];

      results.audio.available = true;
      results.audio.quality = 'good'; // Audio quality is typically consistent

      audioStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      results.audio.error = error.message;
    }

    // Determine overall quality
    if (results.video.available && results.audio.available) {
      results.overall = 'excellent';
    } else if (results.video.available || results.audio.available) {
      results.overall = 'partial';
    } else {
      results.overall = 'failed';
    }

  } catch (error) {
    console.error('Media device test failed:', error);
  }

  return results;
};

/**
 * Determine video quality based on settings
 */
const getVideoQuality = (settings) => {
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
 * Get fallback constraints for compatibility
 */
export const getFallbackConstraints = () => [
  // High quality
  {
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  },
  // Medium quality
  {
    video: {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 15, max: 30 }
    },
    audio: true
  },
  // Basic constraints
  {
    video: true,
    audio: true
  },
  // Audio only
  {
    audio: true
  }
];

/**
 * Handle media errors with user-friendly messages
 */
export const getMediaErrorMessage = (error) => {
  switch (error.name) {
    case 'NotAllowedError':
      return 'Camera and microphone access denied. Please allow permissions and refresh the page.';
    case 'NotFoundError':
      return 'No camera or microphone found. Please connect devices and refresh the page.';
    case 'NotReadableError':
      return 'Camera or microphone is being used by another application. Please close other apps and try again.';
    case 'OverconstrainedError':
      return 'Camera settings not supported. Trying alternative settings...';
    case 'AbortError':
      return 'Media request was aborted. Please try again.';
    case 'SecurityError':
      return 'Media access blocked due to security restrictions.';
    default:
      return `Media access error: ${error.message}`;
  }
};

/**
 * Check browser compatibility for WebRTC
 */
export const checkBrowserCompatibility = () => {
  const issues = [];
  const features = {};

  // Check required APIs
  features.getUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  features.rtcPeerConnection = !!window.RTCPeerConnection;
  features.mediaRecorder = !!window.MediaRecorder;
  features.webgl = !!window.WebGLRenderingContext;
  features.canvas = !!document.createElement('canvas').getContext;

  if (!features.getUserMedia) issues.push('getUserMedia not supported');
  if (!features.rtcPeerConnection) issues.push('RTCPeerConnection not supported');
  if (!features.mediaRecorder) issues.push('MediaRecorder not supported');
  if (!features.webgl) issues.push('WebGL not supported');
  if (!features.canvas) issues.push('Canvas not supported');

  // Check browser versions
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome/')) {
    const version = parseInt(userAgent.match(/Chrome\/(\d+)/)?.[1] || '0');
    if (version < 80) issues.push('Chrome version too old (minimum: 80)');
  } else if (userAgent.includes('Firefox/')) {
    const version = parseInt(userAgent.match(/Firefox\/(\d+)/)?.[1] || '0');
    if (version < 75) issues.push('Firefox version too old (minimum: 75)');
  } else if (userAgent.includes('Safari/')) {
    const version = parseInt(userAgent.match(/Version\/(\d+)/)?.[1] || '0');
    if (version < 13) issues.push('Safari version too old (minimum: 13)');
  } else if (userAgent.includes('Edge/')) {
    const version = parseInt(userAgent.match(/Edge\/(\d+)/)?.[1] || '0');
    if (version < 80) issues.push('Edge version too old (minimum: 80)');
  }

  return {
    compatible: issues.length === 0,
    issues,
    features,
    browser: getBrowserInfo(userAgent)
  };
};

/**
 * Get browser information
 */
const getBrowserInfo = (userAgent) => {
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
 * Monitor stream health
 */
export const monitorStreamHealth = (stream, callback) => {
  if (!stream) return null;

  const interval = setInterval(() => {
    const tracks = stream.getTracks();
    const health = {
      active: stream.active,
      tracks: tracks.map(track => ({
        kind: track.kind,
        readyState: track.readyState,
        enabled: track.enabled,
        muted: track.muted
      }))
    };

    callback(health);
  }, 1000);

  return interval;
};

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);
}

// Auto-cleanup on visibility change (page hidden)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Clean up streams when page is hidden to free resources
      for (const stream of activeStreams) {
        cleanupStream(stream);
      }
    }
  });
}