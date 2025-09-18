import React, { useState, useEffect, useRef } from 'react';

const AlertsMonitor = ({
  violations = [],
  focusStatus = 'focused',
  systemStatus = {},
  serviceStats = {},
  onAlertAction = () => {}
}) => {
  const [alerts, setAlerts] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [alertHistory, setAlertHistory] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef(null);

  // Alert sound setup
  useEffect(() => {
    // Create audio context for alert sounds
    audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
  }, []);

  // Monitor violations and create alerts
  useEffect(() => {
    if (violations.length > alertHistory.length) {
      const newViolations = violations.slice(alertHistory.length);
      newViolations.forEach(violation => {
        createAlert(violation);
      });
      setAlertHistory(violations);
    }
  }, [violations, alertHistory.length]);

  // Monitor focus status changes
  useEffect(() => {
    if (focusStatus !== 'focused') {
      createAlert({
        type: 'focus_change',
        severity: focusStatus === 'no_face' ? 'critical' : 'warning',
        message: getFocusMessage(focusStatus),
        timestamp: new Date(),
        source: 'focus_detection'
      });
    }
  }, [focusStatus]);

  // Monitor system status
  useEffect(() => {
    Object.entries(systemStatus).forEach(([service, status]) => {
      if (!status) {
        createAlert({
          type: 'system_error',
          severity: 'critical',
          message: `${service.replace(/([A-Z])/g, ' $1').toLowerCase()} is offline`,
          timestamp: new Date(),
          source: 'system'
        });
      }
    });
  }, [systemStatus]);

  const createAlert = (alertData) => {
    const alert = {
      id: Date.now() + Math.random(),
      ...alertData,
      acknowledged: false,
      created: new Date()
    };

    setAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts

    // Play sound if enabled
    if (soundEnabled && alert.severity !== 'info') {
      playAlertSound(alert.severity);
    }

    // Auto-dismiss info alerts after 5 seconds
    if (alert.severity === 'info') {
      setTimeout(() => {
        acknowledgeAlert(alert.id);
      }, 5000);
    }

    // Call external alert handler
    onAlertAction('alert_created', alert);
  };

  const playAlertSound = (severity) => {
    if (!audioRef.current) return;

    try {
      const oscillator = audioRef.current.createOscillator();
      const gainNode = audioRef.current.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioRef.current.destination);

      // Different tones for different severities
      switch (severity) {
        case 'critical':
          oscillator.frequency.setValueAtTime(800, audioRef.current.currentTime);
          gainNode.gain.setValueAtTime(0.3, audioRef.current.currentTime);
          oscillator.start();
          oscillator.stop(audioRef.current.currentTime + 0.2);

          // Double beep for critical
          setTimeout(() => {
            const osc2 = audioRef.current.createOscillator();
            const gain2 = audioRef.current.createGain();
            osc2.connect(gain2);
            gain2.connect(audioRef.current.destination);
            osc2.frequency.setValueAtTime(800, audioRef.current.currentTime);
            gain2.gain.setValueAtTime(0.3, audioRef.current.currentTime);
            osc2.start();
            osc2.stop(audioRef.current.currentTime + 0.2);
          }, 300);
          break;

        case 'warning':
          oscillator.frequency.setValueAtTime(600, audioRef.current.currentTime);
          gainNode.gain.setValueAtTime(0.2, audioRef.current.currentTime);
          oscillator.start();
          oscillator.stop(audioRef.current.currentTime + 0.3);
          break;

        default:
          oscillator.frequency.setValueAtTime(400, audioRef.current.currentTime);
          gainNode.gain.setValueAtTime(0.1, audioRef.current.currentTime);
          oscillator.start();
          oscillator.stop(audioRef.current.currentTime + 0.1);
      }
    } catch (error) {
      console.error('Failed to play alert sound:', error);
    }
  };

  const acknowledgeAlert = (alertId) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
    onAlertAction('alert_acknowledged', alertId);
  };

  const acknowledgeAll = () => {
    setAlerts([]);
    onAlertAction('all_alerts_acknowledged');
  };

  const getFocusMessage = (status) => {
    switch (status) {
      case 'looking_away':
        return 'Candidate is looking away from screen';
      case 'no_face':
        return 'No face detected in video feed';
      case 'multiple_faces':
        return 'Multiple faces detected in frame';
      default:
        return 'Focus status changed';
    }
  };

  const getAlertIcon = (type, severity) => {
    if (severity === 'critical') return '🚨';
    if (severity === 'warning') return '⚠️';

    switch (type) {
      case 'unauthorized_item':
        return '📱';
      case 'focus_change':
        return '👁️';
      case 'system_error':
        return '⚙️';
      default:
        return 'ℹ️';
    }
  };

  const getAlertColor = (severity) => {
    switch (severity) {
      case 'critical':
        return '#e74c3c';
      case 'warning':
        return '#f39c12';
      case 'info':
        return '#3498db';
      default:
        return '#95a5a6';
    }
  };

  const getSystemHealthScore = () => {
    const total = Object.keys(systemStatus).length;
    const active = Object.values(systemStatus).filter(Boolean).length;
    return total > 0 ? Math.round((active / total) * 100) : 100;
  };

  const getThreatLevel = () => {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;

    if (criticalAlerts > 2) return { level: 'HIGH', color: '#e74c3c' };
    if (criticalAlerts > 0 || warningAlerts > 3) return { level: 'MEDIUM', color: '#f39c12' };
    if (warningAlerts > 0) return { level: 'LOW', color: '#f1c40f' };
    return { level: 'NORMAL', color: '#27ae60' };
  };

  const styles = {
    container: {
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: isMinimized ? '300px' : '400px',
      maxHeight: '80vh',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      zIndex: 1000,
      border: '2px solid #e74c3c',
      overflow: 'hidden'
    },
    header: {
      background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      color: 'white',
      padding: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      fontSize: '18px',
      fontWeight: 'bold',
      margin: 0
    },
    headerControls: {
      display: 'flex',
      gap: '8px'
    },
    button: {
      background: 'rgba(255,255,255,0.2)',
      border: 'none',
      color: 'white',
      padding: '4px 8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px'
    },
    content: {
      padding: '16px',
      maxHeight: isMinimized ? '0' : '60vh',
      overflow: 'hidden',
      transition: 'max-height 0.3s ease'
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      marginBottom: '16px'
    },
    statCard: {
      background: '#f8f9fa',
      padding: '12px',
      borderRadius: '8px',
      textAlign: 'center'
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 'bold',
      margin: '4px 0'
    },
    statLabel: {
      fontSize: '12px',
      color: '#7f8c8d'
    },
    threatLevel: {
      background: '#f8f9fa',
      padding: '12px',
      borderRadius: '8px',
      marginBottom: '16px',
      textAlign: 'center'
    },
    alertsList: {
      maxHeight: '300px',
      overflowY: 'auto'
    },
    alert: {
      background: '#fff',
      border: '1px solid #e1e8ed',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      animation: 'slideIn 0.3s ease'
    },
    alertIcon: {
      fontSize: '20px'
    },
    alertContent: {
      flex: 1
    },
    alertMessage: {
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '4px'
    },
    alertDetails: {
      fontSize: '12px',
      color: '#7f8c8d',
      marginBottom: '8px'
    },
    alertActions: {
      display: 'flex',
      gap: '8px'
    },
    actionButton: {
      background: '#007bff',
      color: 'white',
      border: 'none',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      cursor: 'pointer'
    },
    acknowledgeButton: {
      background: '#28a745',
      color: 'white',
      border: 'none',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      cursor: 'pointer'
    },
    noAlerts: {
      textAlign: 'center',
      color: '#27ae60',
      padding: '20px'
    },
    toggleSound: {
      background: soundEnabled ? '#27ae60' : '#e74c3c',
      color: 'white',
      border: 'none',
      padding: '4px 8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px'
    }
  };

  const healthScore = getSystemHealthScore();
  const threatLevel = getThreatLevel();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          🚨 Live Monitoring ({alerts.length})
        </h3>
        <div style={styles.headerControls}>
          <button
            style={styles.toggleSound}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title="Toggle alert sounds"
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            style={styles.button}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? '▼' : '▲'}
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {/* System Health Stats */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={{
              ...styles.statValue,
              color: healthScore > 75 ? '#27ae60' : healthScore > 50 ? '#f39c12' : '#e74c3c'
            }}>
              {healthScore}%
            </div>
            <div style={styles.statLabel}>System Health</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{serviceStats.violations || 0}</div>
            <div style={styles.statLabel}>Total Violations</div>
          </div>
        </div>

        {/* Threat Level */}
        <div style={styles.threatLevel}>
          <div style={{
            ...styles.statValue,
            color: threatLevel.color
          }}>
            {threatLevel.level}
          </div>
          <div style={styles.statLabel}>Threat Level</div>
        </div>

        {/* Active Alerts */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <h4 style={{ margin: 0 }}>Active Alerts</h4>
            {alerts.length > 0 && (
              <button
                style={styles.actionButton}
                onClick={acknowledgeAll}
              >
                Clear All
              </button>
            )}
          </div>

          <div style={styles.alertsList}>
            {alerts.length === 0 ? (
              <div style={styles.noAlerts}>
                ✅ No active alerts
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  style={{
                    ...styles.alert,
                    borderLeft: `4px solid ${getAlertColor(alert.severity)}`
                  }}
                >
                  <div style={styles.alertIcon}>
                    {getAlertIcon(alert.type, alert.severity)}
                  </div>
                  <div style={styles.alertContent}>
                    <div style={styles.alertMessage}>
                      {alert.message}
                    </div>
                    <div style={styles.alertDetails}>
                      {alert.created.toLocaleTimeString()} • {alert.source}
                      {alert.severity && ` • ${alert.severity.toUpperCase()}`}
                    </div>
                    <div style={styles.alertActions}>
                      <button
                        style={styles.acknowledgeButton}
                        onClick={() => acknowledgeAlert(alert.id)}
                      >
                        ✓ Acknowledge
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(100%);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>
    </div>
  );
};

export default AlertsMonitor;