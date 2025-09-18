import RecordRTC from 'recordrtc';

class VideoRecordingService {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.isRecording = false;
    this.isPaused = false;
    this.recordingStartTime = null;
    this.recordingData = [];
    this.eventCallbacks = [];
    this.currentBlob = null;

    // Recording settings
    this.settings = {
      type: 'video',
      mimeType: 'video/webm;codecs=vp9',
      disableLogs: false,
      video: {
        width: 1920,
        height: 1080,
        frameRate: 30
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      timeSlice: 30000, // 30 seconds per chunk
      recorderType: RecordRTC.MediaStreamRecorder
    };

    // Storage settings
    this.storageSettings = {
      autoSave: true,
      saveInterval: 60000, // Save every minute
      maxChunkSize: 50 * 1024 * 1024, // 50MB per chunk
      compressionLevel: 0.8
    };

    this.saveTimer = null;
    this.recordingChunks = [];
  }

  async initialize(videoElement, audioEnabled = true) {
    try {
      console.log('Initializing video recording service...');

      // Get media stream with both video and audio
      const constraints = {
        video: {
          width: { ideal: this.settings.video.width },
          height: { ideal: this.settings.video.height },
          frameRate: { ideal: this.settings.video.frameRate },
          facingMode: 'user'
        },
        audio: audioEnabled ? this.settings.audio : false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Set video element source
      if (videoElement) {
        videoElement.srcObject = this.stream;
      }

      console.log('Video recording service initialized successfully');

      this.triggerEvent({
        type: 'recording_service_initialized',
        message: 'Video recording service ready',
        data: {
          hasVideo: this.stream.getVideoTracks().length > 0,
          hasAudio: this.stream.getAudioTracks().length > 0,
          videoSettings: this.stream.getVideoTracks()[0]?.getSettings(),
          audioSettings: this.stream.getAudioTracks()[0]?.getSettings()
        }
      });

      return this.stream;

    } catch (error) {
      console.error('Failed to initialize video recording service:', error);

      this.triggerEvent({
        type: 'recording_service_error',
        message: 'Failed to initialize recording service',
        data: { error: error.message }
      });

      throw error;
    }
  }

  async startRecording() {
    if (!this.stream) {
      throw new Error('Video recording service not initialized');
    }

    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    try {
      // Initialize RecordRTC with the stream
      this.recorder = new RecordRTC(this.stream, {
        ...this.settings,
        ondataavailable: (blob) => {
          this.handleDataAvailable(blob);
        }
      });

      // Start recording
      this.recorder.startRecording();
      this.isRecording = true;
      this.isPaused = false;
      this.recordingStartTime = new Date();
      this.recordingChunks = [];

      // Start auto-save timer
      if (this.storageSettings.autoSave) {
        this.startAutoSave();
      }

      console.log('Video recording started');

      this.triggerEvent({
        type: 'recording_started',
        message: 'Video recording started',
        data: {
          startTime: this.recordingStartTime.toISOString(),
          settings: this.settings
        }
      });

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to start recording',
        data: { error: error.message }
      });
      throw error;
    }
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.isRecording || !this.recorder) {
        resolve(null);
        return;
      }

      try {
        this.recorder.stopRecording(() => {
          const blob = this.recorder.getBlob();
          this.currentBlob = blob;
          this.isRecording = false;
          this.isPaused = false;

          // Stop auto-save timer
          this.stopAutoSave();

          const recordingData = {
            blob: blob,
            startTime: this.recordingStartTime,
            endTime: new Date(),
            duration: Date.now() - this.recordingStartTime.getTime(),
            size: blob.size,
            type: blob.type,
            chunks: this.recordingChunks.length
          };

          this.recordingData.push(recordingData);

          console.log('Video recording stopped');

          this.triggerEvent({
            type: 'recording_stopped',
            message: 'Video recording stopped',
            data: recordingData
          });

          resolve(recordingData);
        });

      } catch (error) {
        console.error('Failed to stop recording:', error);
        this.triggerEvent({
          type: 'recording_error',
          message: 'Failed to stop recording',
          data: { error: error.message }
        });
        reject(error);
      }
    });
  }

  pauseRecording() {
    if (!this.isRecording || this.isPaused) return;

    try {
      this.recorder.pauseRecording();
      this.isPaused = true;

      console.log('Video recording paused');

      this.triggerEvent({
        type: 'recording_paused',
        message: 'Video recording paused',
        data: { pausedAt: new Date().toISOString() }
      });

    } catch (error) {
      console.error('Failed to pause recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to pause recording',
        data: { error: error.message }
      });
    }
  }

  resumeRecording() {
    if (!this.isRecording || !this.isPaused) return;

    try {
      this.recorder.resumeRecording();
      this.isPaused = false;

      console.log('Video recording resumed');

      this.triggerEvent({
        type: 'recording_resumed',
        message: 'Video recording resumed',
        data: { resumedAt: new Date().toISOString() }
      });

    } catch (error) {
      console.error('Failed to resume recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to resume recording',
        data: { error: error.message }
      });
    }
  }

  handleDataAvailable(blob) {
    if (blob && blob.size > 0) {
      const chunk = {
        blob: blob,
        timestamp: new Date().toISOString(),
        size: blob.size,
        index: this.recordingChunks.length
      };

      this.recordingChunks.push(chunk);

      this.triggerEvent({
        type: 'recording_chunk_available',
        message: 'Recording chunk available',
        data: chunk
      });

      // Auto-save if enabled and chunk size threshold is met
      if (this.storageSettings.autoSave && blob.size >= this.storageSettings.maxChunkSize) {
        this.saveChunk(chunk);
      }
    }
  }

  async saveRecording(filename) {
    if (!this.currentBlob) {
      throw new Error('No recording available to save');
    }

    try {
      const url = URL.createObjectURL(this.currentBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `recording_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.triggerEvent({
        type: 'recording_saved',
        message: 'Recording saved successfully',
        data: {
          filename: a.download,
          size: this.currentBlob.size,
          type: this.currentBlob.type
        }
      });

      console.log('Recording saved:', a.download);

    } catch (error) {
      console.error('Failed to save recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to save recording',
        data: { error: error.message }
      });
      throw error;
    }
  }

  async saveChunk(chunk) {
    try {
      // In a real application, you would send this to a server
      // For now, we'll store it in IndexedDB or local storage

      const chunkData = {
        id: `chunk_${Date.now()}_${chunk.index}`,
        sessionId: this.getSessionId(),
        timestamp: chunk.timestamp,
        size: chunk.size,
        blob: chunk.blob
      };

      // Store in IndexedDB (simplified implementation)
      await this.storeChunkLocally(chunkData);

      this.triggerEvent({
        type: 'chunk_saved',
        message: 'Recording chunk saved',
        data: chunkData
      });

    } catch (error) {
      console.error('Failed to save chunk:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to save chunk',
        data: { error: error.message }
      });
    }
  }

  async storeChunkLocally(chunkData) {
    // Simple implementation using localStorage for small chunks
    // In production, use IndexedDB for larger files
    try {
      const key = `recording_chunk_${chunkData.id}`;
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onload = () => {
          try {
            localStorage.setItem(key, reader.result);
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(chunkData.blob);
      });
    } catch (error) {
      console.error('Failed to store chunk locally:', error);
      throw error;
    }
  }

  startAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(() => {
      if (this.isRecording && this.recordingChunks.length > 0) {
        // Save the latest chunk that hasn't been saved yet
        const unsavedChunks = this.recordingChunks.filter(chunk => !chunk.saved);
        if (unsavedChunks.length > 0) {
          unsavedChunks.forEach(chunk => {
            this.saveChunk(chunk);
            chunk.saved = true;
          });
        }
      }
    }, this.storageSettings.saveInterval);
  }

  stopAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      recordingStartTime: this.recordingStartTime,
      currentDuration: this.isRecording ? Date.now() - this.recordingStartTime?.getTime() : 0,
      chunksRecorded: this.recordingChunks.length,
      totalSize: this.recordingChunks.reduce((sum, chunk) => sum + chunk.size, 0),
      hasActiveRecording: this.currentBlob !== null
    };
  }

  getAllRecordings() {
    return this.recordingData.map(recording => ({
      startTime: recording.startTime,
      endTime: recording.endTime,
      duration: recording.duration,
      size: recording.size,
      type: recording.type,
      chunks: recording.chunks
    }));
  }

  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    console.log('Recording settings updated:', this.settings);
  }

  updateStorageSettings(newSettings) {
    Object.assign(this.storageSettings, newSettings);
    console.log('Storage settings updated:', this.storageSettings);
  }

  triggerEvent(event) {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in recording event callback:', error);
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

  getSessionId() {
    // Generate or retrieve session ID
    return `session_${Date.now()}`;
  }

  async cleanup() {
    try {
      // Stop recording if active
      if (this.isRecording) {
        await this.stopRecording();
      }

      // Stop auto-save
      this.stopAutoSave();

      // Stop media stream
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      // Clean up recorder
      if (this.recorder) {
        this.recorder.destroy();
        this.recorder = null;
      }

      this.isRecording = false;
      this.isPaused = false;
      this.eventCallbacks = [];

      console.log('Video recording service cleaned up');

    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Utility methods
  static getSupportedMimeTypes() {
    const possibleTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
      'video/mp4;codecs=h264'
    ];

    return possibleTypes.filter(type => MediaRecorder.isTypeSupported(type));
  }

  static checkBrowserSupport() {
    return {
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mediaRecorder: !!window.MediaRecorder,
      webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection),
      supportedTypes: VideoRecordingService.getSupportedMimeTypes()
    };
  }
}

export default VideoRecordingService;