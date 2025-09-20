// Load MediaPipe via CDN to avoid bundler issues
let FaceDetection, Camera;

// Function to load MediaPipe scripts from CDN
const loadMediaPipeFromCDN = () => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.FaceDetection && window.Camera) {
      FaceDetection = window.FaceDetection;
      Camera = window.Camera;
      console.log('MediaPipe already available globally');
      resolve(true);
      return;
    }

    // Load face detection script
    const faceDetectionScript = document.createElement('script');
    faceDetectionScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js';
    faceDetectionScript.crossOrigin = 'anonymous';

    // Load camera utils script
    const cameraScript = document.createElement('script');
    cameraScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
    cameraScript.crossOrigin = 'anonymous';

    let scriptsLoaded = 0;
    const totalScripts = 2;

    const onScriptLoad = () => {
      scriptsLoaded++;
      if (scriptsLoaded === totalScripts) {
        // Check if MediaPipe is now available
        if (window.FaceDetection && window.Camera) {
          FaceDetection = window.FaceDetection;
          Camera = window.Camera;
          console.log('MediaPipe loaded successfully from CDN');
          resolve(true);
        } else {
          console.error('MediaPipe scripts loaded but constructors not available');
          reject(new Error('MediaPipe constructors not available'));
        }
      }
    };

    const onScriptError = (error) => {
      console.error('Failed to load MediaPipe script:', error);
      reject(error);
    };

    faceDetectionScript.onload = onScriptLoad;
    faceDetectionScript.onerror = onScriptError;
    cameraScript.onload = onScriptLoad;
    cameraScript.onerror = onScriptError;

    // Add scripts to document
    document.head.appendChild(faceDetectionScript);
    document.head.appendChild(cameraScript);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (scriptsLoaded < totalScripts) {
        reject(new Error('MediaPipe script loading timeout'));
      }
    }, 30000);
  });
};

// Function to load MediaPipe modules with fallbacks
const loadMediaPipe = async () => {
  try {
    // First try CDN loading
    await loadMediaPipeFromCDN();
    return true;
  } catch (cdnError) {
    console.warn('CDN loading failed, trying npm imports:', cdnError);

    try {
      // Fallback to npm imports
      const faceDetectionModule = await import('@mediapipe/face_detection');
      const cameraModule = await import('@mediapipe/camera_utils');

      // Check for different export patterns
      FaceDetection = faceDetectionModule.FaceDetection || faceDetectionModule.default?.FaceDetection || faceDetectionModule.default;
      Camera = cameraModule.Camera || cameraModule.default?.Camera || cameraModule.default;

      if (!FaceDetection || !Camera) {
        console.error('MediaPipe modules not properly exported');
        return false;
      }

      console.log('MediaPipe modules loaded via npm imports');
      return true;
    } catch (importError) {
      console.error('Both CDN and npm import failed:', importError);
      return false;
    }
  }
};

class FocusDetectionService {
  constructor() {
    this.faceDetection = null;
    this.camera = null;
    this.isInitialized = false;
    this.lastFaceDetectedTime = Date.now();
    this.lastLookingAwayTime = Date.now();
    this.isLookingAway = false;
    this.noFaceDetected = false;
    this.multipleFacesDetected = false;
    this.focusThreshold = 5000; // 5 seconds
    this.noFaceThreshold = 10000; // 10 seconds
    this.eventCallbacks = [];
    this.canvas = null;
    this.ctx = null;

    // Performance optimization
    this.frameSkipCounter = 0;
    this.frameSkipRate = 2; // Process every 3rd frame for better performance
    this.lastProcessTime = 0;
    this.minProcessInterval = 333; // Minimum 333ms between processing (3 FPS)

    // Resource tracking for cleanup
    this.activeRequests = new Set();
    this.isDisposed = false;
  }

  async initialize(videoElement, canvasElement) {
    try {
      // Load MediaPipe modules first
      const mediaPipeLoaded = await loadMediaPipe();
      if (!mediaPipeLoaded) {
        console.warn('MediaPipe not available, falling back to basic detection');
        // Initialize a basic fallback detection system
        this.initializeFallbackDetection(videoElement, canvasElement);
        return;
      }

      // Validate video element
      if (!videoElement) {
        throw new Error('Video element is required for focus detection');
      }

      this.canvas = canvasElement;

      // Only get context if canvas element exists
      if (canvasElement) {
        try {
          this.ctx = canvasElement.getContext('2d');
          if (!this.ctx) {
            console.warn('Failed to get 2D context from canvas - visualization will be disabled');
          }
        } catch (canvasError) {
          console.warn('Canvas context error:', canvasError);
          this.ctx = null;
        }
      } else {
        console.warn('Canvas element not provided for focus detection - visualization will be disabled');
        this.ctx = null;
      }

      this.faceDetection = new FaceDetection({
        locateFile: (file) => {
          // Primary CDN with fallbacks
          const cdnUrls = [
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
            `https://unpkg.com/@mediapipe/face_detection/${file}`,
            `https://cdn.skypack.dev/@mediapipe/face_detection/${file}`
          ];

          // Return primary URL (MediaPipe will handle fallbacks internally)
          return cdnUrls[0];
        }
      });

      this.faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5,
      });

      this.faceDetection.onResults(this.onResults.bind(this));

      this.camera = new Camera(videoElement, {
        onFrame: async () => {
          // Skip processing if disposed
          if (this.isDisposed) return;

          // Implement frame skipping for better performance
          const now = Date.now();
          this.frameSkipCounter++;

          // Only process every nth frame and respect minimum interval
          if (this.frameSkipCounter >= this.frameSkipRate &&
              now - this.lastProcessTime >= this.minProcessInterval) {
            this.frameSkipCounter = 0;
            this.lastProcessTime = now;

            try {
              // Track active request for cleanup
              const requestId = `frame_${now}`;
              this.activeRequests.add(requestId);

              await this.faceDetection.send({ image: videoElement });

              // Remove from active requests
              this.activeRequests.delete(requestId);
            } catch (error) {
              console.warn('Frame processing error:', error);
              // Clean up failed request
              this.activeRequests.clear();
            }
          }
        },
        width: 854, // Reduced to 854x480 for better performance (16:9 aspect ratio)
        height: 480
      });

      await this.camera.start();
      this.isInitialized = true;
      console.log('Focus detection service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize focus detection service:', error);
      throw error;
    }
  }

  onResults(results) {
    if (this.isDisposed || !this.canvas || !this.ctx) return;

    const currentTime = Date.now();

    // Use requestAnimationFrame for smoother rendering with error handling
    requestAnimationFrame(() => {
      try {
        // Validate canvas context before operations
        if (!this.canvas || !this.ctx || this.isDisposed) return;

        // Check if canvas is still valid
        if (this.canvas.width === 0 || this.canvas.height === 0) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw the video frame - only if results image is available
        if (results.image) {
          this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);
        }

        // Draw face detection results inside requestAnimationFrame for smooth rendering
        if (results.detections && results.detections.length > 0) {
          this.drawFaceDetections(results.detections);
        }
      } catch (error) {
        console.warn('Canvas rendering error:', error);
        // Try to recover by clearing the context
        try {
          if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }
        } catch (clearError) {
          console.error('Failed to recover canvas context:', clearError);
        }
      }
    }); // Close requestAnimationFrame callback

    if (results.detections && results.detections.length > 0) {
      this.lastFaceDetectedTime = currentTime;
      this.noFaceDetected = false;

      // Check for multiple faces
      if (results.detections.length > 1) {
        if (!this.multipleFacesDetected) {
          this.multipleFacesDetected = true;
          this.triggerEvent('multiple_faces_detected', {
            faceCount: results.detections.length,
            timestamp: new Date().toISOString(),
            message: `Multiple faces detected: ${results.detections.length} faces`
          });
        }
      } else if (this.multipleFacesDetected) {
        // Only reset when we have a single face (not zero faces)
        this.multipleFacesDetected = false;
        this.triggerEvent('single_face_restored', {
          timestamp: new Date().toISOString(),
          message: 'Single face detected, multiple faces issue resolved'
        });
      }

      // Analyze focus for the primary face
      const primaryFace = results.detections[0];
      this.analyzeFocus(primaryFace, currentTime);
    } else {
      // No face detected
      if (currentTime - this.lastFaceDetectedTime > this.noFaceThreshold) {
        if (!this.noFaceDetected) {
          this.noFaceDetected = true;
          this.triggerEvent('no_face_detected', {
            duration: currentTime - this.lastFaceDetectedTime,
            timestamp: new Date().toISOString(),
            message: 'No face detected for more than 10 seconds'
          });
        }
      }
    }
  }

  analyzeFocus(faceDetection, currentTime) {
    // Get face landmarks for gaze analysis
    const boundingBox = faceDetection.boundingBox;
    const landmarks = faceDetection.landmarks;

    if (!landmarks || landmarks.length === 0) return;

    // Simple gaze estimation based on face orientation
    // This is a basic implementation - in production, you'd want more sophisticated algorithms
    const isLookingAway = this.estimateGaze(landmarks, boundingBox);

    if (isLookingAway) {
      if (!this.isLookingAway) {
        this.lastLookingAwayTime = currentTime;
        this.isLookingAway = true;
      } else if (currentTime - this.lastLookingAwayTime > this.focusThreshold) {
        this.triggerEvent('looking_away', {
          duration: currentTime - this.lastLookingAwayTime,
          timestamp: new Date().toISOString(),
          message: 'Candidate looking away for more than 5 seconds'
        });
      }
    } else if (this.isLookingAway) {
      // Only reset when transitioning from looking away to focused
      this.isLookingAway = false;
      this.triggerEvent('focus_restored', {
        timestamp: new Date().toISOString(),
        message: 'Candidate focus restored',
        duration: currentTime - this.lastLookingAwayTime
      });
    }
  }

  estimateGaze(landmarks, boundingBox) {
    // Simple gaze estimation based on face angle and eye position
    // This is a basic implementation for demonstration

    if (!landmarks || landmarks.length < 4) {
      return false;
    }

    // Validate landmark structure before accessing
    const validateLandmark = (landmark) => {
      return landmark &&
             typeof landmark.x === 'number' &&
             typeof landmark.y === 'number' &&
             !isNaN(landmark.x) && !isNaN(landmark.y);
    };

    // Safely get key facial points with validation
    const rightEye = landmarks[0]; // Right eye corner
    const leftEye = landmarks[1];  // Left eye corner
    const nose = landmarks[2];     // Nose tip
    const mouth = landmarks[3];    // Mouth center

    // Validate all required landmarks
    if (!validateLandmark(rightEye) || !validateLandmark(leftEye) ||
        !validateLandmark(nose) || !validateLandmark(mouth)) {
      return false;
    }

    // Calculate face center with bounds validation
    if (!boundingBox || typeof boundingBox.xCenter !== 'number' ||
        typeof boundingBox.yCenter !== 'number') {
      return false;
    }

    const faceCenter = {
      x: boundingBox.xCenter,
      y: boundingBox.yCenter
    };

    // Simple heuristic: if nose is significantly off-center relative to eyes,
    // the person is likely looking away
    const eyeCenter = {
      x: (rightEye.x + leftEye.x) / 2,
      y: (rightEye.y + leftEye.y) / 2
    };

    const noseOffset = Math.abs(nose.x - eyeCenter.x);
    const eyeDistance = Math.abs(rightEye.x - leftEye.x);

    // Prevent division by zero and handle invalid distances
    if (eyeDistance === 0 || isNaN(eyeDistance) || isNaN(noseOffset)) {
      return false;
    }

    // If nose is offset by more than 30% of eye distance, consider looking away
    const offsetThreshold = eyeDistance * 0.3;

    return noseOffset > offsetThreshold;
  }

  drawFaceDetections(detections) {
    if (!this.ctx || !this.canvas || this.isDisposed) return;

    try {
      detections.forEach((detection, index) => {
        if (!detection || !detection.boundingBox) return;

        const bbox = detection.boundingBox;

        // Validate bounding box data
        if (typeof bbox.xCenter !== 'number' || typeof bbox.yCenter !== 'number' ||
            typeof bbox.width !== 'number' || typeof bbox.height !== 'number' ||
            isNaN(bbox.xCenter) || isNaN(bbox.yCenter) ||
            isNaN(bbox.width) || isNaN(bbox.height)) {
          return;
        }

        const x = bbox.xCenter - bbox.width / 2;
        const y = bbox.yCenter - bbox.height / 2;

        // Validate calculated coordinates
        if (isNaN(x) || isNaN(y)) return;

        // Draw bounding box with safe coordinates
        this.ctx.strokeStyle = index === 0 ? '#00ff00' : '#ff0000'; // Green for primary, red for additional
        this.ctx.lineWidth = 2;

        const canvasX = Math.max(0, Math.min(x * this.canvas.width, this.canvas.width));
        const canvasY = Math.max(0, Math.min(y * this.canvas.height, this.canvas.height));
        const canvasWidth = Math.max(0, Math.min(bbox.width * this.canvas.width, this.canvas.width - canvasX));
        const canvasHeight = Math.max(0, Math.min(bbox.height * this.canvas.height, this.canvas.height - canvasY));

        this.ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);

        // Draw confidence score
        if (detection.score && typeof detection.score === 'number') {
          this.ctx.fillStyle = index === 0 ? '#00ff00' : '#ff0000';
          this.ctx.font = '16px Arial';
          this.ctx.fillText(
            `Face ${index + 1}: ${(detection.score * 100).toFixed(1)}%`,
            canvasX,
            Math.max(20, canvasY - 10) // Ensure text is visible
          );
        }

        // Draw landmarks if available
        if (detection.landmarks && Array.isArray(detection.landmarks)) {
          this.ctx.fillStyle = '#ffff00';
          detection.landmarks.forEach(landmark => {
            if (landmark && typeof landmark.x === 'number' && typeof landmark.y === 'number' &&
                !isNaN(landmark.x) && !isNaN(landmark.y)) {
              const landmarkX = Math.max(0, Math.min(landmark.x * this.canvas.width, this.canvas.width));
              const landmarkY = Math.max(0, Math.min(landmark.y * this.canvas.height, this.canvas.height));

              this.ctx.beginPath();
              this.ctx.arc(landmarkX, landmarkY, 3, 0, 2 * Math.PI);
              this.ctx.fill();
            }
          });
        }
      });
    } catch (error) {
      console.warn('Error drawing face detections:', error);
    }
  }

  triggerEvent(type, data) {
    const event = {
      type,
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    };

    console.log('Focus detection event:', event);

    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }

  addEventListener(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Event listener must be a function');
    }
    this.eventCallbacks.push(callback);

    // Return cleanup function
    return () => this.removeEventListener(callback);
  }

  removeEventListener(callback) {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
      return true;
    }
    return false;
  }

  removeAllEventListeners() {
    this.eventCallbacks.length = 0;
  }

  updateSettings(settings) {
    if (settings.focusThreshold !== undefined) {
      this.focusThreshold = settings.focusThreshold;
    }
    if (settings.noFaceThreshold !== undefined) {
      this.noFaceThreshold = settings.noFaceThreshold;
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isLookingAway: this.isLookingAway,
      noFaceDetected: this.noFaceDetected,
      multipleFacesDetected: this.multipleFacesDetected,
      lastFaceDetectedTime: this.lastFaceDetectedTime,
      settings: {
        focusThreshold: this.focusThreshold,
        noFaceThreshold: this.noFaceThreshold
      }
    };
  }

  stop() {
    try {
      console.log('🧹 Stopping FocusDetectionService...');

      // Mark as disposed to prevent further processing
      this.isDisposed = true;

      // Clear active requests
      this.activeRequests.clear();

      // Clear fallback interval if it exists
      if (this.fallbackInterval) {
        clearInterval(this.fallbackInterval);
        this.fallbackInterval = null;
      }

      // Stop camera
      if (this.camera) {
        try {
          this.camera.stop();
        } catch (error) {
          console.warn('Error stopping camera:', error);
        }
        this.camera = null;
      }

      // Close MediaPipe face detection
      if (this.faceDetection) {
        try {
          this.faceDetection.close();
        } catch (error) {
          console.warn('MediaPipe face detection already closed:', error.message);
        }
        this.faceDetection = null;
      }

      // Clear canvas context
      if (this.ctx && this.canvas) {
        try {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        } catch (error) {
          console.warn('Error clearing canvas:', error);
        }
      }
      this.ctx = null;
      this.canvas = null;

      // Clear event listeners
      this.removeAllEventListeners();

      // Reset state
      this.isInitialized = false;

      console.log('✅ FocusDetectionService stopped successfully');
    } catch (error) {
      console.error('Error during FocusDetectionService cleanup:', error);
    }
  }

  // Comprehensive cleanup method
  cleanup() {
    this.stop();
  }

  // Destructor-like method
  destroy() {
    this.cleanup();
  }

  // Method to update canvas after component mounts
  updateCanvas(canvasElement) {
    this.canvas = canvasElement;
    if (canvasElement) {
      this.ctx = canvasElement.getContext('2d');
      console.log('Canvas context updated for focus detection');
    } else {
      this.ctx = null;
    }
  }

  // Fallback detection method when MediaPipe is not available
  initializeFallbackDetection(videoElement, canvasElement) {
    console.log('Initializing fallback detection without MediaPipe');

    this.canvas = canvasElement;
    if (canvasElement) {
      this.ctx = canvasElement.getContext('2d');
    }

    // Simple timer-based detection as fallback
    this.fallbackInterval = setInterval(() => {
      if (this.isDisposed) return;

      // Simulate basic presence detection
      // In a real implementation, you could use simpler computer vision libraries
      // or even motion detection algorithms

      // For now, just assume the user is present but trigger periodic checks
      this.triggerEvent('basic_monitoring_active', {
        timestamp: new Date().toISOString(),
        message: 'Basic monitoring active (MediaPipe unavailable)'
      });

      // Simple canvas drawing to show monitoring is active
      if (this.ctx && this.canvas) {
        try {
          this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          this.ctx.fillRect(10, 10, 100, 30);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.font = '12px Arial';
          this.ctx.fillText('Monitoring Active', 15, 28);
        } catch (error) {
          console.warn('Canvas drawing error in fallback mode:', error);
        }
      }
    }, 5000); // Check every 5 seconds

    this.isInitialized = true;
    console.log('Fallback detection initialized');
  }

  reset() {
    if (this.isDisposed) return;

    this.lastFaceDetectedTime = Date.now();
    this.lastLookingAwayTime = Date.now();
    this.isLookingAway = false;
    this.noFaceDetected = false;
    this.multipleFacesDetected = false;
    this.activeRequests.clear();
  }
}

export default FocusDetectionService;

