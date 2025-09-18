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
  }

  async initialize(videoElement, canvasElement) {
    try {
      console.log('Initializing object detection service...');

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
        this.ctx = canvasElement.getContext('2d');
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
    if (!this.model || !this.videoElement || !this.canvas || this.isProcessing) return;

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

      // Draw detections on canvas
      this.drawDetections(predictions);

    } catch (error) {
      console.error('Error during object detection:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  processDetections(detections) {
    const currentTime = Date.now();

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
    if (!this.ctx || !this.canvas) return;

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      // Clear canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw video frame - only if video is playing to avoid lag
      if (this.videoElement && this.videoElement.readyState >= 2) {
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
      }

    // Draw detection boxes
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      const itemType = prediction.class.toLowerCase();
      const isUnauthorized = this.unauthorizedItems.hasOwnProperty(itemType);

      // Set colors based on item type
      if (isUnauthorized) {
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
        }
      } else {
        this.ctx.strokeStyle = '#00ff00'; // Green for authorized items
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
      }

      // Draw bounding box
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, width, height);
      this.ctx.fillRect(x, y, width, height);

      // Draw label
      const label = `${prediction.class} (${(prediction.score * 100).toFixed(1)}%)`;
      this.ctx.fillStyle = isUnauthorized ? '#ffffff' : '#000000';
      this.ctx.font = '14px Arial';
      this.ctx.fillText(label, x, y > 20 ? y - 5 : y + 15);

      // Draw warning icon for unauthorized items
      if (isUnauthorized) {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.font = '20px Arial';
        this.ctx.fillText('⚠️', x + width - 25, y + 25);
      }
    });
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
    if (settings.confidenceThreshold !== undefined) {
      this.confidenceThreshold = Math.max(0.1, Math.min(1.0, settings.confidenceThreshold));
    }
    if (settings.detectionCooldown !== undefined) {
      this.detectionCooldown = Math.max(1000, settings.detectionCooldown);
    }
    if (settings.unauthorizedItems !== undefined) {
      // Allow customization of unauthorized items
      Object.assign(this.unauthorizedItems, settings.unauthorizedItems);
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
        timeSinceDetection: Date.now() - timestamp
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
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    this.isInitialized = false;
    this.eventCallbacks = [];
    console.log('Object detection stopped');
  }

  reset() {
    this.detectionHistory.clear();
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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