import { v4 as uuidv4 } from 'uuid';

class EventLoggingService {
  constructor() {
    this.events = [];
    this.sessionId = uuidv4();
    this.candidateId = null;
    this.interviewId = null;
    this.startTime = new Date().toISOString();
    this.eventCallbacks = [];
    this.storageKey = 'proctoring_events';
    this.maxEventsInMemory = 1000;
    this.autoSaveInterval = 10000; // Auto-save every 10 seconds
    this.autoSaveTimer = null;

    // Event severity levels
    this.severityLevels = {
      'info': 1,
      'warning': 2,
      'critical': 3,
      'violation': 4
    };

    // Initialize auto-save
    this.startAutoSave();
  }

  initialize(candidateId, interviewId) {
    this.candidateId = candidateId;
    this.interviewId = interviewId;
    this.sessionId = uuidv4();
    this.startTime = new Date().toISOString();

    // Log session start
    this.logEvent({
      type: 'session_started',
      severity: 'info',
      message: 'Proctoring session started',
      data: {
        candidateId,
        interviewId,
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        timestamp: this.startTime
      }
    });

    console.log('Event logging service initialized for session:', this.sessionId);
  }

  logEvent(eventData) {
    const event = this.createEvent(eventData);
    this.events.push(event);

    // Maintain memory limit
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(-this.maxEventsInMemory);
    }

    // Trigger callbacks
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event logging callback:', error);
      }
    });

    // Log to console based on severity
    this.logToConsole(event);

    return event;
  }

  createEvent(eventData) {
    const timestamp = new Date().toISOString();
    const eventId = uuidv4();

    return {
      id: eventId,
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      interviewId: this.interviewId,
      timestamp,
      type: eventData.type || 'unknown',
      severity: eventData.severity || 'info',
      message: eventData.message || '',
      data: eventData.data || {},
      source: eventData.source || 'system',
      duration: eventData.duration || null,
      screenshot: eventData.screenshot || null,
      videoTimestamp: eventData.videoTimestamp || null
    };
  }

  logToConsole(event) {
    const logLevel = this.severityLevels[event.severity] || 1;
    const message = `[${event.severity.toUpperCase()}] ${event.type}: ${event.message}`;

    switch (logLevel) {
      case 1: // info
        console.log(message, event);
        break;
      case 2: // warning
        console.warn(message, event);
        break;
      case 3: // critical
      case 4: // violation
        console.error(message, event);
        break;
    }
  }

  // Specific logging methods for different event types
  logFocusEvent(eventData) {
    return this.logEvent({
      ...eventData,
      source: 'focus_detection',
      severity: eventData.severity || 'warning'
    });
  }

  logObjectDetectionEvent(eventData) {
    const severity = this.getObjectDetectionSeverity(eventData.priority);
    return this.logEvent({
      ...eventData,
      source: 'object_detection',
      severity
    });
  }

  logSystemEvent(eventData) {
    return this.logEvent({
      ...eventData,
      source: 'system',
      severity: eventData.severity || 'info'
    });
  }

  logUserAction(eventData) {
    return this.logEvent({
      ...eventData,
      source: 'user',
      severity: 'info'
    });
  }

  logViolation(eventData) {
    return this.logEvent({
      ...eventData,
      severity: 'violation'
    });
  }

  getObjectDetectionSeverity(priority) {
    switch (priority) {
      case 'high':
        return 'violation';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'info';
    }
  }

  // Query and filter methods
  getEvents(filters = {}) {
    let filteredEvents = [...this.events];

    if (filters.type) {
      filteredEvents = filteredEvents.filter(event => event.type === filters.type);
    }

    if (filters.severity) {
      filteredEvents = filteredEvents.filter(event => event.severity === filters.severity);
    }

    if (filters.source) {
      filteredEvents = filteredEvents.filter(event => event.source === filters.source);
    }

    if (filters.startTime) {
      filteredEvents = filteredEvents.filter(event => event.timestamp >= filters.startTime);
    }

    if (filters.endTime) {
      filteredEvents = filteredEvents.filter(event => event.timestamp <= filters.endTime);
    }

    if (filters.limit) {
      filteredEvents = filteredEvents.slice(-filters.limit);
    }

    return filteredEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  getViolations() {
    return this.getEvents({ severity: 'violation' });
  }

  getCriticalEvents() {
    return this.getEvents({ severity: 'critical' });
  }

  getWarnings() {
    return this.getEvents({ severity: 'warning' });
  }

  getRecentEvents(minutes = 5) {
    const startTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    return this.getEvents({ startTime });
  }

  // Statistics and reporting
  getEventSummary() {
    const summary = {
      total: this.events.length,
      byType: {},
      bySeverity: {},
      bySource: {},
      timeRange: {
        start: this.startTime,
        end: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : this.startTime
      }
    };

    this.events.forEach(event => {
      // Count by type
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;

      // Count by severity
      summary.bySeverity[event.severity] = (summary.bySeverity[event.severity] || 0) + 1;

      // Count by source
      summary.bySource[event.source] = (summary.bySource[event.source] || 0) + 1;
    });

    return summary;
  }

  getViolationReport() {
    const violations = this.getViolations();
    const report = {
      totalViolations: violations.length,
      violationTypes: {},
      timeline: [],
      severity: 'clean'
    };

    violations.forEach(violation => {
      // Count by type
      report.violationTypes[violation.type] = (report.violationTypes[violation.type] || 0) + 1;

      // Add to timeline
      report.timeline.push({
        timestamp: violation.timestamp,
        type: violation.type,
        message: violation.message
      });
    });

    // Determine overall severity
    if (violations.length > 10) {
      report.severity = 'severe';
    } else if (violations.length > 5) {
      report.severity = 'moderate';
    } else if (violations.length > 0) {
      report.severity = 'mild';
    }

    return report;
  }

  // Storage methods
  saveToLocalStorage() {
    try {
      const data = {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        interviewId: this.interviewId,
        startTime: this.startTime,
        events: this.events,
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(this.storageKey, JSON.stringify(data));
      console.log('Events saved to local storage');
    } catch (error) {
      console.error('Failed to save events to local storage:', error);
    }
  }

  loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.events = parsed.events || [];
        console.log('Events loaded from local storage:', this.events.length);
        return true;
      }
    } catch (error) {
      console.error('Failed to load events from local storage:', error);
    }
    return false;
  }

  exportEvents(format = 'json') {
    const data = {
      sessionInfo: {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        interviewId: this.interviewId,
        startTime: this.startTime,
        exportTime: new Date().toISOString()
      },
      summary: this.getEventSummary(),
      violationReport: this.getViolationReport(),
      events: this.events
    };

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(this.events);
      default:
        return data;
    }
  }

  convertToCSV(events) {
    if (events.length === 0) return '';

    const headers = ['timestamp', 'type', 'severity', 'message', 'source', 'duration'];
    const csvRows = [headers.join(',')];

    events.forEach(event => {
      const row = [
        event.timestamp,
        event.type,
        event.severity,
        `"${event.message.replace(/"/g, '""')}"`,
        event.source,
        event.duration || ''
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Auto-save functionality
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.saveToLocalStorage();
    }, this.autoSaveInterval);
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // Event listeners
  addEventListener(callback) {
    this.eventCallbacks.push(callback);
  }

  removeEventListener(callback) {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  // Session management
  endSession() {
    this.logEvent({
      type: 'session_ended',
      severity: 'info',
      message: 'Proctoring session ended',
      data: {
        duration: Date.now() - new Date(this.startTime).getTime(),
        totalEvents: this.events.length,
        violations: this.getViolations().length
      }
    });

    this.saveToLocalStorage();
    this.stopAutoSave();
  }

  clearEvents() {
    this.events = [];
    localStorage.removeItem(this.storageKey);
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      interviewId: this.interviewId,
      startTime: this.startTime,
      eventCount: this.events.length,
      violationCount: this.getViolations().length,
      autoSaveEnabled: this.autoSaveTimer !== null
    };
  }
}

// Create and export singleton instance
const eventLoggingService = new EventLoggingService();
export default eventLoggingService;