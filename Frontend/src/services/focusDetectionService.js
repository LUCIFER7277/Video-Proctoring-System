import { FaceDetection } from '@mediapipe/face_detection';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

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
  }

  async initialize(videoElement, canvasElement) {
    try {
      this.canvas = canvasElement;

      // Only get context if canvas element exists
      if (canvasElement) {
        this.ctx = canvasElement.getContext('2d');
      } else {
        console.warn('Canvas element not provided for focus detection - visualization will be disabled');
        this.ctx = null;
      }

      this.faceDetection = new FaceDetection({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        }
      });

      this.faceDetection.setOptions({
        model: 'short',
        minDetectionConfidence: 0.5,
      });

      this.faceDetection.onResults(this.onResults.bind(this));

      this.camera = new Camera(videoElement, {
        onFrame: async () => {
          // Implement frame skipping for better performance
          const now = Date.now();
          this.frameSkipCounter++;

          // Only process every nth frame and respect minimum interval
          if (this.frameSkipCounter >= this.frameSkipRate &&
              now - this.lastProcessTime >= this.minProcessInterval) {
            this.frameSkipCounter = 0;
            this.lastProcessTime = now;
            await this.faceDetection.send({ image: videoElement });
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
    if (!this.canvas || !this.ctx) return;

    const currentTime = Date.now();

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
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
      } else {
        this.multipleFacesDetected = false;
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
    } else {
      this.isLookingAway = false;
    }
  }

  estimateGaze(landmarks, boundingBox) {
    // Simple gaze estimation based on face angle and eye position
    // This is a basic implementation for demonstration

    if (landmarks.length < 6) return false;

    // Get key facial points
    const rightEye = landmarks[0]; // Right eye corner
    const leftEye = landmarks[1];  // Left eye corner
    const nose = landmarks[2];     // Nose tip
    const mouth = landmarks[3];    // Mouth center

    // Calculate face center
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

    // If nose is offset by more than 30% of eye distance, consider looking away
    const offsetThreshold = eyeDistance * 0.3;

    return noseOffset > offsetThreshold;
  }

  drawFaceDetections(detections) {
    if (!this.ctx) return;

    detections.forEach((detection, index) => {
      const bbox = detection.boundingBox;
      const x = bbox.xCenter - bbox.width / 2;
      const y = bbox.yCenter - bbox.height / 2;

      // Draw bounding box
      this.ctx.strokeStyle = index === 0 ? '#00ff00' : '#ff0000'; // Green for primary, red for additional
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x * this.canvas.width, y * this.canvas.height,
                         bbox.width * this.canvas.width, bbox.height * this.canvas.height);

      // Draw confidence score
      this.ctx.fillStyle = index === 0 ? '#00ff00' : '#ff0000';
      this.ctx.font = '16px Arial';
      this.ctx.fillText(
        `Face ${index + 1}: ${(detection.score * 100).toFixed(1)}%`,
        x * this.canvas.width,
        y * this.canvas.height - 10
      );

      // Draw landmarks if available
      if (detection.landmarks) {
        this.ctx.fillStyle = '#ffff00';
        detection.landmarks.forEach(landmark => {
          this.ctx.beginPath();
          this.ctx.arc(
            landmark.x * this.canvas.width,
            landmark.y * this.canvas.height,
            3, 0, 2 * Math.PI
          );
          this.ctx.fill();
        });
      }
    });
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
    this.eventCallbacks.push(callback);
  }

  removeEventListener(callback) {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
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
    if (this.camera) {
      this.camera.stop();
    }
    if (this.faceDetection) {
      try {
        this.faceDetection.close();
      } catch (error) {
        console.warn('MediaPipe face detection already closed:', error.message);
      }
      this.faceDetection = null;
    }
    this.isInitialized = false;
    this.eventCallbacks = [];
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

  reset() {
    this.lastFaceDetectedTime = Date.now();
    this.lastLookingAwayTime = Date.now();
    this.isLookingAway = false;
    this.noFaceDetected = false;
    this.multipleFacesDetected = false;
  }
}

export default FocusDetectionService;