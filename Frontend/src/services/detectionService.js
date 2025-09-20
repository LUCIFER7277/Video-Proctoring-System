import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

class DetectionService {
  constructor() {
    this.blazefaceModel = null;
    this.objectModel = null;
    this.isInitialized = false;
    this.lastFaceDetection = Date.now();
    this.lookingAwayStartTime = null;
    this.noFaceStartTime = null;
    this.violationCallbacks = [];
    this.lastObjectDetection = Date.now();
    this.frameCount = 0;
    this.lastCanvasWidth = 0;
    this.lastCanvasHeight = 0;

    // Timing thresholds (in milliseconds)
    this.LOOKING_AWAY_THRESHOLD = 5000; // 5 seconds
    this.NO_FACE_THRESHOLD = 10000; // 10 seconds

    // Object detection confidence threshold
    this.OBJECT_CONFIDENCE_THRESHOLD = 0.5;

    // Unauthorized items to detect
    this.UNAUTHORIZED_ITEMS = [
      'cell phone',
      'book',
      'laptop',
      'tv',
      'keyboard',
      'mouse',
      'remote',
      'tablet'
    ];
  }

  // Initialize AI models
  async initialize() {
    try {
      console.log('Loading AI models...');

      // Set TensorFlow backend
      await tf.ready();
      console.log('TensorFlow.js ready');

      // Load face detection model
      console.log('Loading BlazeFace model...');
      this.blazefaceModel = await blazeface.load();
      console.log('✅ BlazeFace model loaded successfully');

      // Load object detection model
      console.log('Loading COCO-SSD model...');
      this.objectModel = await cocoSsd.load();
      console.log('✅ COCO-SSD model loaded successfully');

      this.isInitialized = true;
      console.log('🚀 AI Detection Service fully initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize detection models:', error);
      return false;
    }
  }

  // Add violation callback
  addViolationCallback(callback) {
    this.violationCallbacks.push(callback);
  }

  // Remove violation callback
  removeViolationCallback(callback) {
    this.violationCallbacks = this.violationCallbacks.filter(cb => cb !== callback);
  }

  // Trigger violation
  triggerViolation(violation) {
    console.log('🚨 Violation detected:', violation.type);
    this.violationCallbacks.forEach(callback => callback(violation));
  }

  // Helper method to determine violation type and severity for objects
  getViolationTypeAndSeverity(objectClass) {
    let type = 'device_detected';
    let severity = 'medium';

    if (objectClass === 'cell phone') {
      type = 'phone_detected';
      severity = 'high';
    } else if (objectClass === 'book') {
      type = 'book_detected';
      severity = 'high';
    } else if (['laptop', 'tv', 'tablet'].includes(objectClass)) {
      type = 'device_detected';
      severity = 'high';
    }

    return { type, severity };
  }

  // Real face detection and focus monitoring
  async detectFocus(videoElement, canvasElement) {
    if (!this.isInitialized || !this.blazefaceModel) {
      console.warn('Face detection not initialized');
      return null;
    }

    try {
      // Get face predictions
      const predictions = await this.blazefaceModel.estimateFaces(videoElement, false);
      const currentTime = Date.now();

      // Clear canvas and draw video
      const ctx = canvasElement.getContext('2d');
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

      let focusStatus = 'focused';
      let violation = null;

      if (predictions.length === 0) {
        // NO FACE DETECTED
        if (!this.noFaceStartTime) {
          this.noFaceStartTime = currentTime;
          console.log('⚠️ No face detected - starting timer');
        } else if (currentTime - this.noFaceStartTime > this.NO_FACE_THRESHOLD) {
          focusStatus = 'no_face';
          violation = {
            type: 'no_face_detected',
            description: `No face detected for more than ${this.NO_FACE_THRESHOLD / 1000} seconds`,
            confidence: 0.9,
            timestamp: new Date(),
            severity: 'high',
            duration: Math.round((currentTime - this.noFaceStartTime) / 1000)
          };
        }

        // Reset looking away timer since no face is detected
        this.lookingAwayStartTime = null;

        // Draw warning on canvas
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('NO FACE DETECTED', 50, 50);

      } else if (predictions.length > 1) {
        // MULTIPLE FACES DETECTED
        focusStatus = 'multiple_faces';
        violation = {
          type: 'multiple_faces',
          description: `${predictions.length} faces detected in frame`,
          confidence: 0.95,
          timestamp: new Date(),
          severity: 'high'
        };

        this.noFaceStartTime = null;
        this.lookingAwayStartTime = null;

        // Draw warning on canvas
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${predictions.length} FACES DETECTED`, 50, 50);

      } else {
        // SINGLE FACE DETECTED - Check focus direction
        const face = predictions[0];
        this.lastFaceDetection = currentTime;
        this.noFaceStartTime = null;

        // Draw face bounding box
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        const faceBox = {
          x: face.topLeft[0],
          y: face.topLeft[1],
          width: face.bottomRight[0] - face.topLeft[0],
          height: face.bottomRight[1] - face.topLeft[1]
        };
        ctx.strokeRect(faceBox.x, faceBox.y, faceBox.width, faceBox.height);

        // Calculate face center
        const faceCenterX = (face.topLeft[0] + face.bottomRight[0]) / 2;
        const faceCenterY = (face.topLeft[1] + face.bottomRight[1]) / 2;

        // Calculate screen center
        const screenCenterX = canvasElement.width / 2;
        const screenCenterY = canvasElement.height / 2;

        // Calculate distance from center (focus detection)
        const distanceFromCenterX = Math.abs(faceCenterX - screenCenterX);
        const distanceFromCenterY = Math.abs(faceCenterY - screenCenterY);

        // Focus thresholds (percentage of screen size)
        const thresholdX = canvasElement.width * 0.25; // 25% of width
        const thresholdY = canvasElement.height * 0.2; // 20% of height

        // Check if looking away
        if (distanceFromCenterX > thresholdX || distanceFromCenterY > thresholdY) {
          // LOOKING AWAY
          if (!this.lookingAwayStartTime) {
            this.lookingAwayStartTime = currentTime;
            console.log('⚠️ Looking away detected - starting timer');
          } else if (currentTime - this.lookingAwayStartTime > this.LOOKING_AWAY_THRESHOLD) {
            focusStatus = 'looking_away';
            violation = {
              type: 'looking_away',
              description: `Candidate looking away from screen for more than ${this.LOOKING_AWAY_THRESHOLD / 1000} seconds`,
              confidence: 0.8,
              timestamp: new Date(),
              severity: 'medium',
              duration: Math.round((currentTime - this.lookingAwayStartTime) / 1000)
            };
          }

          // Draw warning indicators
          ctx.strokeStyle = '#ff9500';
          ctx.lineWidth = 3;
          ctx.strokeRect(faceBox.x, faceBox.y, faceBox.width, faceBox.height);

          ctx.fillStyle = '#ff9500';
          ctx.font = 'bold 16px Arial';
          ctx.fillText('LOOKING AWAY', faceBox.x, faceBox.y - 10);

        } else {
          // FOCUSED - Reset timer
          this.lookingAwayStartTime = null;

          // Draw focus indicator
          ctx.fillStyle = '#00ff00';
          ctx.font = 'bold 16px Arial';
          ctx.fillText('FOCUSED', faceBox.x, faceBox.y - 10);

          // Draw center point for reference
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(faceCenterX, faceCenterY, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Trigger violation if detected
      if (violation) {
        this.triggerViolation(violation);
      }

      return {
        focusStatus,
        faceCount: predictions.length,
        faces: predictions,
        violation
      };

    } catch (error) {
      if (error.name === 'NotReadableError') {
        console.error('Camera access error during face detection:', error.message);
      } else if (error.message && error.message.includes('tensor')) {
        console.error('TensorFlow error during face detection:', error.message);
        this.cleanupTensors();
      } else {
        console.error('Face detection error:', error);
      }
      return null;
    }
  }

  // Real object detection for unauthorized items
  async detectObjects(videoElement, canvasElement) {
    if (!this.isInitialized || !this.objectModel) {
      console.warn('Object detection not initialized');
      return null;
    }

    try {
      // Run object detection
      const predictions = await this.objectModel.detect(videoElement);

      // Filter for unauthorized items
      const unauthorizedItems = predictions.filter(prediction =>
        this.UNAUTHORIZED_ITEMS.includes(prediction.class) &&
        prediction.score > this.OBJECT_CONFIDENCE_THRESHOLD
      );

      // Draw detections on canvas
      const ctx = canvasElement.getContext('2d');

      unauthorizedItems.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;

        // Determine violation type and severity using helper method
        const { type: violationType, severity } = this.getViolationTypeAndSeverity(prediction.class);

        // Draw red bounding box
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        // Draw label with confidence
        const label = `${prediction.class.toUpperCase()} (${Math.round(prediction.score * 100)}%)`;
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 14px Arial';

        // Background for text
        const textMetrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(x, y - 25, textMetrics.width + 10, 20);

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + 5, y - 8);

        console.log(`🚨 Unauthorized item detected: ${prediction.class} (${Math.round(prediction.score * 100)}%)`);
      });

      // Generate violations for detected items
      const violations = unauthorizedItems.map(item => {
        const { type, severity } = this.getViolationTypeAndSeverity(item.class);

        return {
          type,
          description: `${item.class} detected in frame`,
          confidence: item.score,
          timestamp: new Date(),
          severity,
          metadata: {
            objectClass: item.class,
            boundingBox: item.bbox,
            confidence: item.score
          }
        };
      });

      // Trigger violations
      violations.forEach(violation => this.triggerViolation(violation));

      return {
        objects: unauthorizedItems,
        violations
      };

    } catch (error) {
      if (error.name === 'NotReadableError') {
        console.error('Camera access error during object detection:', error.message);
      } else if (error.message && error.message.includes('tensor')) {
        console.error('TensorFlow error during object detection:', error.message);
        this.cleanupTensors();
      } else {
        console.error('Object detection error:', error);
      }
      return null;
    }
  }

  // Enhanced eye closure detection using facial landmarks
  async detectEyeClosure(videoElement) {
    if (!this.blazefaceModel) return null;

    try {
      const predictions = await this.blazefaceModel.estimateFaces(videoElement, true);

      if (predictions.length > 0) {
        const face = predictions[0];

        // Check if landmarks are available and have sufficient data
        if (face.landmarks && face.landmarks.length >= 12) {
          // Validate landmark structure before processing
          const validateLandmark = (landmark) => {
            return landmark && Array.isArray(landmark) && landmark.length >= 2 &&
                   typeof landmark[0] === 'number' && typeof landmark[1] === 'number';
          };

          // Calculate eye aspect ratio for drowsiness detection
          const leftEye = face.landmarks.slice(0, 6);
          const rightEye = face.landmarks.slice(6, 12);

          // Validate all required landmarks
          const requiredLeftEyePoints = [leftEye[1], leftEye[5], leftEye[0], leftEye[3]];
          const requiredRightEyePoints = [rightEye[1], rightEye[5], rightEye[0], rightEye[3]];

          const allLandmarksValid = requiredLeftEyePoints.every(validateLandmark) &&
                                  requiredRightEyePoints.every(validateLandmark);

          if (!allLandmarksValid) {
            return null;
          }

          // Simple eye aspect ratio calculation with safe division
          const leftEyeHeight = Math.abs(leftEye[1][1] - leftEye[5][1]);
          const leftEyeWidth = Math.abs(leftEye[0][0] - leftEye[3][0]);
          const leftEAR = leftEyeWidth > 0 ? leftEyeHeight / leftEyeWidth : 0;

          const rightEyeHeight = Math.abs(rightEye[1][1] - rightEye[5][1]);
          const rightEyeWidth = Math.abs(rightEye[0][0] - rightEye[3][0]);
          const rightEAR = rightEyeWidth > 0 ? rightEyeHeight / rightEyeWidth : 0;

          // Only calculate average if both values are valid
          if (leftEAR === 0 || rightEAR === 0) {
            return null;
          }

          const avgEAR = (leftEAR + rightEAR) / 2;

          // Threshold for closed eyes (adjust based on testing)
          if (avgEAR < 0.15) {
            return {
              type: 'eye_closure',
              description: 'Prolonged eye closure detected (possible drowsiness)',
              confidence: 0.7,
              timestamp: new Date(),
              severity: 'medium'
            };
          }
        }
      }

      return null;
    } catch (error) {
      if (error.name === 'NotReadableError') {
        console.error('Camera access error during eye closure detection:', error.message);
      } else if (error.message && error.message.includes('tensor')) {
        console.error('TensorFlow error during eye closure detection:', error.message);
        this.cleanupTensors();
      } else {
        console.error('Eye closure detection error:', error);
      }
      return null;
    }
  }

  // Capture screenshot for evidence
  captureScreenshot(canvasElement) {
    try {
      return canvasElement.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      console.error('Screenshot capture error:', error);
      return null;
    }
  }

  // Main detection processing loop
  async processFrame(videoElement, canvasElement) {
    if (!this.isInitialized) {
      console.warn('Detection service not initialized');
      return null;
    }

    try {
      // Set canvas dimensions to match video (only when changed for performance)
      if (videoElement.videoWidth && videoElement.videoHeight) {
        if (this.lastCanvasWidth !== videoElement.videoWidth ||
            this.lastCanvasHeight !== videoElement.videoHeight) {
          canvasElement.width = videoElement.videoWidth;
          canvasElement.height = videoElement.videoHeight;
          this.lastCanvasWidth = videoElement.videoWidth;
          this.lastCanvasHeight = videoElement.videoHeight;
        }
      }

      // Run focus detection every frame
      const focusResult = await this.detectFocus(videoElement, canvasElement);

      // Run object detection less frequently (every 60 frames ≈ 2 seconds at 30fps) for performance
      let objectResult = null;

      if (this.frameCount % 60 === 0) {
        objectResult = await this.detectObjects(videoElement, canvasElement);
      }

      // Run eye closure detection
      const eyeClosureResult = await this.detectEyeClosure(videoElement);
      if (eyeClosureResult) {
        this.triggerViolation(eyeClosureResult);
      }

      // Increment frame count for timing
      this.frameCount++;

      // Periodic tensor cleanup (every 30 frames to prevent memory buildup)
      if (this.frameCount % 30 === 0) {
        this.cleanupTensors();
      }

      return {
        focus: focusResult,
        objects: objectResult,
        eyeClosure: eyeClosureResult,
        timestamp: new Date()
      };

    } catch (error) {
      if (error.name === 'NotReadableError') {
        console.error('Camera access error during frame processing:', error.message);
      } else if (error.message && error.message.includes('tensor')) {
        console.error('TensorFlow error during frame processing:', error.message);
      } else if (error.name === 'SecurityError') {
        console.error('Security error during frame processing (canvas access):', error.message);
      } else {
        console.error('Frame processing error:', error);
      }
      // Clean up on error to prevent memory leaks
      this.cleanupTensors();
      return null;
    }
  }

  // Clean up tensors to prevent memory leaks
  cleanupTensors() {
    try {
      // Get current memory info
      const memInfo = tf.memory();

      // If memory usage is getting high, force garbage collection
      if (memInfo.numTensors > 50) {
        tf.dispose();
      }
    } catch (error) {
      console.warn('Error in tensor cleanup:', error);
    }
  }

  // Get detection status
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      models: {
        blazeface: !!this.blazefaceModel,
        cocoSsd: !!this.objectModel
      },
      frameCount: this.frameCount,
      memoryInfo: tf.memory()
    };
  }
}

export default DetectionService;