import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

class ObjectDetectionService {
  constructor() {
    this.model = null;
    this.isInitialized = false;
    this.eventCallbacks = [];
    this.detectionInterval = null;
    this.canvas = null;
    this.ctx = null;
    this.videoElement = null;

    // Performance optimization
    this.isProcessing = false;
    this.lastDetectionTime = 0;
    this.minDetectionInterval = 3000; // Increased to 3 seconds for better performance

    // Unauthorized items to detect
    this.unauthorizedItems = {
      'cell phone': { priority: 'high', message: 'Mobile phone detected' },
      'laptop': { priority: 'high', message: 'Laptop detected' },
      'book': { priority: 'medium', message: 'Book detected' },
      'paper': { priority: 'medium', message: 'Paper/notes detected' },
      'tablet': { priority: 'high', message: 'Tablet detected' },
      'keyboard': { priority: 'medium', message: 'External keyboard detected' },
      'mouse': { priority: 'low', message: 'External mouse detected' },
      'monitor': { priority: 'high', message: 'Additional monitor detected' },
      'tv': { priority: 'high', message: 'TV/large screen detected' },
      'person': { priority: 'high', message: 'Additional person detected' }
    };

    // Detection history to avoid spam
    this.detectionHistory = new Map();
    this.detectionCooldown = 3000; // 3 seconds cooldown between same item detections
    this.confidenceThreshold = 0.6;
    this.maxHistorySize = 100; // Limit history size to prevent memory leaks

    // Resource tracking
    this.isDisposed = false;
    this.lastCanvasWidth = 0;
    this.lastCanvasHeight = 0;
  }

  async initialize(videoElement, canvasElement) {
    try {
      console.log('Initializing object detection service...');

      // Validate video element
      if (!videoElement) {
        throw new Error('Video element is required for object detection');
      }

      // Set up TensorFlow.js backend
      await tf.ready();
      console.log('TensorFlow.js backend:', tf.getBackend());

      // Load COCO-SSD model
      this.model = await cocoSsd.load({
        base: 'mobilenet_v2'
      });

      this.videoElement = videoElement;
      this.canvas = canvasElement;

      // Only get context if canvas element exists
      if (canvasElement) {
        try {
          this.ctx = canvasElement.getContext('2d');
          if (!this.ctx) {
            console.warn('Failed to get 2D context from canvas - visualization will be disabled');
          } else {
            this.lastCanvasWidth = canvasElement.width;
            this.lastCanvasHeight = canvasElement.height;
          }
        } catch (canvasError) {
          console.warn('Canvas context error:', canvasError);
          this.ctx = null;
        }
      } else {
        console.warn('Canvas element not provided - visualization will be disabled');
        this.ctx = null;
      }

      this.isInitialized = true;
      console.log('Object detection service initialized successfully');

      // Start detection loop
      this.startDetection();

    } catch (error) {
      console.error('Failed to initialize object detection service:', error);
      throw error;
    }
  }

  startDetection() {
    if (!this.isInitialized || this.detectionInterval) return;

    this.detectionInterval = setInterval(async () => {
      // Skip if already processing or within minimum interval
      const now = Date.now();
      if (!this.isProcessing && now - this.lastDetectionTime >= this.minDetectionInterval) {
        await this.detectObjects();
      }
    }, this.minDetectionInterval); // Use the minimum interval setting

    console.log('Object detection started');
  }

  async detectObjects() {
    if (!this.model || !this.videoElement || this.isProcessing || this.isDisposed) return;

    try {
      this.isProcessing = true;
      this.lastDetectionTime = Date.now();

      // Run object detection on video frame
      const predictions = await this.model.detect(this.videoElement);

      // Separate person detections from other items
      const personDetections = predictions.filter(prediction =>
        prediction.class.toLowerCase() === 'person' && prediction.score >= 0.7 // Higher threshold for people
      );

      // Only flag if there are 2 or more people (additional person detected)
      const unauthorizedPersons = personDetections.length > 1 ?
        personDetections.slice(1).map(detection => ({
          ...detection,
          class: 'person',
          isMultiplePerson: true
        })) : [];

      // Filter for other unauthorized items (excluding person)
      const otherUnauthorizedDetections = predictions.filter(prediction => {
        const itemType = prediction.class.toLowerCase();
        return itemType !== 'person' &&
               this.unauthorizedItems.hasOwnProperty(itemType) &&
               prediction.score >= this.confidenceThreshold;
      });

      // Combine unauthorized detections
      const allUnauthorizedDetections = [...unauthorizedPersons, ...otherUnauthorizedDetections];

      // Process detections
      this.processDetections(allUnauthorizedDetections);

      // Draw detections on canvas (only if canvas available)
      if (this.canvas && this.ctx) {
        this.drawDetections(predictions);
      }

      // Clean up tensors to prevent memory leaks
      this.cleanupTensors();

    } catch (error) {
      console.error('Error during object detection:', error);
      // Clean up on error
      this.cleanupTensors();
    } finally {
      this.isProcessing = false;
    }
  }

  processDetections(detections) {
    const currentTime = Date.now();

    // Limit history size to prevent memory leaks
    if (this.detectionHistory.size > this.maxHistorySize) {
      const oldestEntries = Array.from(this.detectionHistory.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.detectionHistory.size - this.maxHistorySize);

      oldestEntries.forEach(([key]) => {
        this.detectionHistory.delete(key);
      });
    }

    detections.forEach(detection => {
      const itemType = detection.class.toLowerCase();
      const lastDetectionTime = this.detectionHistory.get(itemType) || 0;

      // Check if enough time has passed since last detection of this item
      if (currentTime - lastDetectionTime > this.detectionCooldown) {
        this.detectionHistory.set(itemType, currentTime);

        // Handle multiple person detection
        if (detection.isMultiplePerson) {
          const event = {
            type: 'unauthorized_item_detected',
            itemType: 'person',
            confidence: detection.score,
            priority: 'high',
            message: 'Additional person detected',
            boundingBox: detection.bbox,
            timestamp: new Date().toISOString(),
            coordinates: {
              x: detection.bbox[0],
              y: detection.bbox[1],
              width: detection.bbox[2],
              height: detection.bbox[3]
            }
          };
          this.triggerEvent(event);
        } else {
          // Handle other unauthorized items
          const itemConfig = this.unauthorizedItems[itemType];
          if (itemConfig) {
            const event = {
              type: 'unauthorized_item_detected',
              itemType: itemType,
              confidence: detection.score,
              priority: itemConfig.priority,
              message: itemConfig.message,
              boundingBox: detection.bbox,
              timestamp: new Date().toISOString(),
              coordinates: {
                x: detection.bbox[0],
                y: detection.bbox[1],
                width: detection.bbox[2],
                height: detection.bbox[3]
              }
            };
            this.triggerEvent(event);
          }
        }
      }
    });
  }

  drawDetections(predictions) {
    if (!this.ctx || !this.canvas || this.isDisposed) return;

    // Use requestAnimationFrame for smoother rendering with error handling
    requestAnimationFrame(() => {
      try {
        // Validate canvas context before operations
        if (!this.canvas || !this.ctx || this.isDisposed) return;

        // Check if canvas dimensions have changed
        if (this.canvas.width !== this.lastCanvasWidth ||
            this.canvas.height !== this.lastCanvasHeight) {
          this.lastCanvasWidth = this.canvas.width;
          this.lastCanvasHeight = this.canvas.height;
        }

        // Check if canvas is still valid
        if (this.canvas.width === 0 || this.canvas.height === 0) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw video frame - only if video is playing to avoid lag
        if (this.videoElement && this.videoElement.readyState >= 2) {
          this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
        }

        // Draw detection boxes
        predictions.forEach(prediction => {
          if (!prediction || !prediction.bbox || !Array.isArray(prediction.bbox)) return;

          const [x, y, width, height] = prediction.bbox;

          // Validate coordinates
          if (typeof x !== 'number' || typeof y !== 'number' ||
              typeof width !== 'number' || typeof height !== 'number' ||
              isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
            return;
          }

          const itemType = prediction.class ? prediction.class.toLowerCase() : '';
          const isUnauthorized = this.unauthorizedItems.hasOwnProperty(itemType);

          // Set colors based on item type
          if (isUnauthorized && this.unauthorizedItems[itemType]) {
            const priority = this.unauthorizedItems[itemType].priority;
            switch (priority) {
              case 'high':
                this.ctx.strokeStyle = '#ff0000'; // Red for high priority
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                break;
              case 'medium':
                this.ctx.strokeStyle = '#ff8800'; // Orange for medium priority
                this.ctx.fillStyle = 'rgba(255, 136, 0, 0.2)';
                break;
              case 'low':
                this.ctx.strokeStyle = '#ffff00'; // Yellow for low priority
                this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
                break;
              default:
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            }
          } else {
            this.ctx.strokeStyle = '#00ff00'; // Green for authorized items
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
          }

          // Constrain coordinates to canvas bounds
          const boundedX = Math.max(0, Math.min(x, this.canvas.width));
          const boundedY = Math.max(0, Math.min(y, this.canvas.height));
          const boundedWidth = Math.max(0, Math.min(width, this.canvas.width - boundedX));
          const boundedHeight = Math.max(0, Math.min(height, this.canvas.height - boundedY));

          // Draw bounding box
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(boundedX, boundedY, boundedWidth, boundedHeight);
          this.ctx.fillRect(boundedX, boundedY, boundedWidth, boundedHeight);

          // Draw label
          if (prediction.class && typeof prediction.score === 'number') {
            const label = `${prediction.class} (${(prediction.score * 100).toFixed(1)}%)`;
            this.ctx.fillStyle = isUnauthorized ? '#ffffff' : '#000000';
            this.ctx.font = '14px Arial';
            const textY = boundedY > 20 ? boundedY - 5 : boundedY + 15;
            this.ctx.fillText(label, boundedX, textY);
          }

          // Draw warning icon for unauthorized items
          if (isUnauthorized) {
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = '20px Arial';
            const iconX = Math.min(boundedX + boundedWidth - 25, this.canvas.width - 25);
            const iconY = Math.min(boundedY + 25, this.canvas.height - 5);
            this.ctx.fillText('⚠️', iconX, iconY);
          }
        });
      } catch (error) {
        console.warn('Canvas rendering error:', error);
        // Try to recover by clearing the context
        try {
          if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }
        } catch (clearError) {
          console.error('Failed to recover canvas context:', clearError);
        }
      }
    }); // Close requestAnimationFrame callback
  }

  triggerEvent(event) {
    console.log('Object detection event:', event);

    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
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
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings must be an object');
    }

    if (settings.confidenceThreshold !== undefined) {
      if (typeof settings.confidenceThreshold !== 'number' ||
          isNaN(settings.confidenceThreshold)) {
        throw new Error('confidenceThreshold must be a number');
      }
      this.confidenceThreshold = Math.max(0.1, Math.min(1.0, settings.confidenceThreshold));
    }

    if (settings.detectionCooldown !== undefined) {
      if (typeof settings.detectionCooldown !== 'number' ||
          isNaN(settings.detectionCooldown) ||
          settings.detectionCooldown < 0) {
        throw new Error('detectionCooldown must be a positive number');
      }
      this.detectionCooldown = Math.max(1000, settings.detectionCooldown);
    }

    if (settings.unauthorizedItems !== undefined) {
      if (typeof settings.unauthorizedItems !== 'object' ||
          Array.isArray(settings.unauthorizedItems)) {
        throw new Error('unauthorizedItems must be an object');
      }

      // Validate unauthorized items structure
      for (const [key, value] of Object.entries(settings.unauthorizedItems)) {
        if (typeof key !== 'string') {
          throw new Error('Unauthorized item keys must be strings');
        }
        if (!value || typeof value !== 'object') {
          throw new Error('Unauthorized item values must be objects');
        }
        if (value.priority && !['low', 'medium', 'high'].includes(value.priority)) {
          throw new Error('Priority must be one of: low, medium, high');
        }
        if (value.message && typeof value.message !== 'string') {
          throw new Error('Message must be a string');
        }
      }

      // Safe assignment with validation
      Object.assign(this.unauthorizedItems, settings.unauthorizedItems);
    }

    if (settings.maxHistorySize !== undefined) {
      if (typeof settings.maxHistorySize !== 'number' ||
          isNaN(settings.maxHistorySize) ||
          settings.maxHistorySize < 10) {
        throw new Error('maxHistorySize must be a number >= 10');
      }
      this.maxHistorySize = settings.maxHistorySize;
    }
  }

  // Method to update canvas after component mounts
  updateCanvas(canvasElement) {
    this.canvas = canvasElement;
    if (canvasElement) {
      this.ctx = canvasElement.getContext('2d');
      console.log('Canvas context updated for object detection');
    } else {
      this.ctx = null;
    }
  }

  addUnauthorizedItem(itemClass, config) {
    this.unauthorizedItems[itemClass.toLowerCase()] = {
      priority: config.priority || 'medium',
      message: config.message || `${itemClass} detected`
    };
  }

  removeUnauthorizedItem(itemClass) {
    delete this.unauthorizedItems[itemClass.toLowerCase()];
  }

  getDetectionHistory() {
    const history = [];
    this.detectionHistory.forEach((timestamp, itemType) => {
      history.push({
        itemType,
        lastDetected: new Date(timestamp).toISOString(),
        timeSinceDetection: Date.now() - timestamp,
        timestamp // Add timestamp for sorting
      });
    });
    return history.sort((a, b) => b.timestamp - a.timestamp);
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isDetecting: this.detectionInterval !== null,
      modelLoaded: this.model !== null,
      unauthorizedItemsCount: Object.keys(this.unauthorizedItems).length,
      detectionHistoryCount: this.detectionHistory.size,
      settings: {
        confidenceThreshold: this.confidenceThreshold,
        detectionCooldown: this.detectionCooldown
      }
    };
  }

  stop() {
    try {
      console.log('🧹 Stopping ObjectDetectionService...');

      // Mark as disposed to prevent further processing
      this.isDisposed = true;

      // Stop detection interval
      if (this.detectionInterval) {
        clearInterval(this.detectionInterval);
        this.detectionInterval = null;
      }

      // Dispose of TensorFlow model
      if (this.model) {
        try {
          if (typeof this.model.dispose === 'function') {
            this.model.dispose();
          }
        } catch (error) {
          console.warn('Error disposing TensorFlow model:', error);
        }
        this.model = null;
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
      this.videoElement = null;

      // Clear event listeners
      this.removeAllEventListeners();

      // Reset state
      this.isInitialized = false;
      this.isProcessing = false;

      console.log('✅ ObjectDetectionService stopped successfully');
    } catch (error) {
      console.error('Error during ObjectDetectionService cleanup:', error);
    }
  }

  // Comprehensive cleanup method
  cleanup() {
    this.stop();
  }

  // Destructor-like method
  destroy() {
    this.cleanup();
    this.detectionHistory.clear();
  }

  reset() {
    if (this.isDisposed) return;

    this.detectionHistory.clear();
    if (this.ctx && this.canvas) {
      try {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      } catch (error) {
        console.warn('Error clearing canvas in reset:', error);
      }
    }
  }

  // Manual detection trigger for testing
  async detectNow() {
    if (this.isInitialized) {
      await this.detectObjects();
    }
  }

  // Get list of all detectable classes
  getDetectableClasses() {
    // COCO dataset classes
    return [
      'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
      'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
      'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
      'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
      'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
      'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
      'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
      'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
      'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
      'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
      'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
      'toothbrush'
    ];
  }
}

export default ObjectDetectionService;