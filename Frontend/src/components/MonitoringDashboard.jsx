import React, { useState, useEffect, useMemo } from 'react';

const MonitoringDashboard = ({
  violations = [],
  focusStatus = 'focused',
  systemStatus = {},
  serviceStats = {},
  eventLoggingService = null,
  sessionId = ''
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('15m');
  const [dashboardData, setDashboardData] = useState({
    timeline: [],
    focusHistory: [],
    violationTypes: {},
    hourlyStats: []
  });

  // Update dashboard data when new violations come in
  useEffect(() => {
    updateDashboardData();
  }, [violations, serviceStats]);

  const updateDashboardData = () => {
    const now = new Date();
    const timeRanges = {
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '3h': 3 * 60 * 60 * 1000
    };

    const rangeMs = timeRanges[selectedTimeRange];
    const startTime = new Date(now.getTime() - rangeMs);

    // Filter violations by time range
    const recentViolations = violations.filter(v =>
      new Date(v.timestamp) >= startTime
    );

    // Create timeline data
    const timeline = recentViolations.map(v => ({
      timestamp: new Date(v.timestamp),
      type: v.type,
      severity: v.severity,
      description: v.description
    }));

    // Count violation types
    const violationTypes = {};
    recentViolations.forEach(v => {
      violationTypes[v.type] = (violationTypes[v.type] || 0) + 1;
    });

    // Create hourly stats (simplified)
    const hourlyStats = [];
    for (let i = 0; i < Math.min(rangeMs / (60 * 60 * 1000), 24); i++) {
      const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
      const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000);

      const hourViolations = recentViolations.filter(v => {
        const vTime = new Date(v.timestamp);
        return vTime >= hourStart && vTime < hourEnd;
      });

      hourlyStats.unshift({
        hour: hourStart.getHours(),
        violations: hourViolations.length,
        focusIssues: hourViolations.filter(v =>
          ['looking_away', 'no_face', 'multiple_faces'].includes(v.type)
        ).length,
        objectIssues: hourViolations.filter(v => v.type === 'unauthorized_item').length
      });
    }

    setDashboardData({
      timeline,
      violationTypes,
      hourlyStats
    });
  };

  const calculateRiskScore = useMemo(() => {
    const weights = {
      critical: 10,
      warning: 5,
      info: 1
    };

    let totalScore = 0;
    violations.forEach(v => {
      totalScore += weights[v.severity] || 1;
    });

    // Normalize to 0-100 scale (100 being highest risk)
    const maxPossibleScore = violations.length * 10;
    return maxPossibleScore > 0 ? Math.min(Math.round((totalScore / maxPossibleScore) * 100), 100) : 0;
  }, [violations]);

  const getIntegrityStatus = () => {
    const riskScore = calculateRiskScore;
    if (riskScore < 20) return { status: 'EXCELLENT', color: '#27ae60', description: 'High integrity maintained' };
    if (riskScore < 40) return { status: 'GOOD', color: '#2ecc71', description: 'Minor concerns detected' };
    if (riskScore < 60) return { status: 'MODERATE', color: '#f39c12', description: 'Several violations detected' };
    if (riskScore < 80) return { status: 'POOR', color: '#e67e22', description: 'Multiple serious violations' };
    return { status: 'CRITICAL', color: '#e74c3c', description: 'Severe integrity issues' };
  };

  const getFocusScore = () => {
    const focusViolations = violations.filter(v =>
      ['looking_away', 'no_face', 'multiple_faces'].includes(v.type)
    ).length;
    const totalTime = Math.max(serviceStats.totalEvents || 1, 1);
    const focusScore = Math.max(0, 100 - (focusViolations / totalTime) * 100);
    return Math.round(focusScore);
  };

  const getTopViolations = () => {
    return Object.entries(dashboardData.violationTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  };

  const exportReport = () => {
    if (!eventLoggingService) return;

    const report = {
      sessionId,
      timestamp: new Date().toISOString(),
      summary: {
        totalViolations: violations.length,
        riskScore: calculateRiskScore,
        focusScore: getFocusScore(),
        integrityStatus: getIntegrityStatus(),
        duration: serviceStats.totalEvents || 0
      },
      violations: violations,
      stats: serviceStats,
      systemStatus
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `proctoring-report-${sessionId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const styles = {
    dashboard: {
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '20px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      padding: '24px',
      margin: '0'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '24px',
      borderBottom: '1px solid rgba(236, 240, 241, 0.3)',
      paddingBottom: '16px'
    },
    title: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#2d3748',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    controls: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center'
    },
    select: {
      padding: '10px 14px',
      borderRadius: '10px',
      border: '1px solid rgba(189, 195, 199, 0.5)',
      fontSize: '14px',
      background: 'rgba(255, 255, 255, 0.8)',
      outline: 'none'
    },
    button: {
      padding: '10px 18px',
      borderRadius: '10px',
      border: 'none',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      fontSize: '14px',
      cursor: 'pointer',
      fontWeight: '600',
      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
      transition: 'all 0.3s ease'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '24px'
    },
    card: {
      background: 'rgba(248, 249, 250, 0.8)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(233, 236, 239, 0.5)',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 16px rgba(0,0,0,0.05)'
    },
    cardTitle: {
      fontSize: '15px',
      fontWeight: '600',
      marginBottom: '12px',
      color: '#495057'
    },
    metric: {
      fontSize: '32px',
      fontWeight: 'bold',
      margin: '8px 0'
    },
    metricLabel: {
      fontSize: '14px',
      color: '#6c757d'
    },
    statusBadge: {
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 'bold',
      color: 'white',
      marginTop: '8px'
    },
    chartContainer: {
      background: 'rgba(248, 249, 250, 0.8)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '20px',
      border: '1px solid rgba(233, 236, 239, 0.5)',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 16px rgba(0,0,0,0.05)'
    },
    chart: {
      height: '200px',
      background: 'rgba(255, 255, 255, 0.9)',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid rgba(233, 236, 239, 0.5)',
      position: 'relative'
    },
    violationsList: {
      background: 'rgba(248, 249, 250, 0.8)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid rgba(233, 236, 239, 0.5)',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 16px rgba(0,0,0,0.05)'
    },
    violationItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid #e9ecef'
    },
    violationType: {
      fontWeight: 'bold',
      textTransform: 'capitalize',
      flex: 1
    },
    violationCount: {
      background: '#e74c3c',
      color: 'white',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold'
    },
    timelineContainer: {
      background: 'rgba(248, 249, 250, 0.8)',
      borderRadius: '16px',
      padding: '20px',
      maxHeight: '300px',
      overflowY: 'auto',
      border: '1px solid rgba(233, 236, 239, 0.5)',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 16px rgba(0,0,0,0.05)'
    },
    timelineItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 0',
      borderBottom: '1px solid #e9ecef'
    },
    timelineTime: {
      fontSize: '12px',
      color: '#6c757d',
      minWidth: '60px'
    },
    timelineIcon: {
      fontSize: '16px'
    },
    timelineContent: {
      flex: 1,
      fontSize: '14px'
    }
  };

  const integrityStatus = getIntegrityStatus();
  const focusScore = getFocusScore();
  const topViolations = getTopViolations();

  return (
    <div style={styles.dashboard}>
      <div style={styles.header}>
        <h2 style={styles.title}>📊 Monitoring Dashboard</h2>
        <div style={styles.controls}>
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            style={styles.select}
          >
            <option value="15m">Last 15 minutes</option>
            <option value="30m">Last 30 minutes</option>
            <option value="1h">Last hour</option>
            <option value="3h">Last 3 hours</option>
          </select>
          <button onClick={exportReport} style={styles.button}>
            📄 Export Report
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Integrity Score</div>
          <div style={{
            ...styles.metric,
            color: integrityStatus.color
          }}>
            {100 - calculateRiskScore}%
          </div>
          <div style={styles.metricLabel}>{integrityStatus.description}</div>
          <div style={{
            ...styles.statusBadge,
            backgroundColor: integrityStatus.color
          }}>
            {integrityStatus.status}
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Focus Score</div>
          <div style={{
            ...styles.metric,
            color: focusScore > 80 ? '#27ae60' : focusScore > 60 ? '#f39c12' : '#e74c3c'
          }}>
            {focusScore}%
          </div>
          <div style={styles.metricLabel}>Attention consistency</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Total Violations</div>
          <div style={{
            ...styles.metric,
            color: violations.length < 3 ? '#27ae60' : violations.length < 6 ? '#f39c12' : '#e74c3c'
          }}>
            {violations.length}
          </div>
          <div style={styles.metricLabel}>Across all categories</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>System Health</div>
          <div style={{
            ...styles.metric,
            color: Object.values(systemStatus).every(Boolean) ? '#27ae60' : '#e74c3c'
          }}>
            {Object.values(systemStatus).filter(Boolean).length}/{Object.keys(systemStatus).length}
          </div>
          <div style={styles.metricLabel}>Services operational</div>
        </div>
      </div>

      {/* Charts Section */}
      <div style={styles.chartContainer}>
        <h3 style={styles.cardTitle}>Activity Timeline</h3>
        <div style={styles.chart}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#6c757d',
            textAlign: 'center'
          }}>
            {dashboardData.timeline.length === 0 ? (
              <div>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
                <div>No violations in selected time range</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                <div>{dashboardData.timeline.length} events detected</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Top Violations */}
        <div style={styles.violationsList}>
          <h3 style={styles.cardTitle}>Top Violation Types</h3>
          {topViolations.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#27ae60', padding: '20px' }}>
              ✅ No violations detected
            </div>
          ) : (
            topViolations.map(({ type, count }) => (
              <div key={type} style={styles.violationItem}>
                <div style={styles.violationType}>
                  {type.replace(/_/g, ' ')}
                </div>
                <div style={styles.violationCount}>
                  {count}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent Activity Timeline */}
        <div style={styles.timelineContainer}>
          <h3 style={styles.cardTitle}>Recent Activity</h3>
          {dashboardData.timeline.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#27ae60', padding: '20px' }}>
              ✅ No recent activity
            </div>
          ) : (
            dashboardData.timeline.slice(-10).reverse().map((item, index) => (
              <div key={index} style={styles.timelineItem}>
                <div style={styles.timelineTime}>
                  {item.timestamp.toLocaleTimeString().slice(0, 5)}
                </div>
                <div style={styles.timelineIcon}>
                  {item.severity === 'critical' ? '🚨' :
                   item.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </div>
                <div style={styles.timelineContent}>
                  {item.description}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* System Status */}
      <div style={{ ...styles.card, marginTop: '20px' }}>
        <h3 style={styles.cardTitle}>System Status</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}>
          {Object.entries(systemStatus).map(([service, status]) => (
            <div key={service} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              background: status ? '#d4edda' : '#f8d7da',
              borderRadius: '6px',
              border: `1px solid ${status ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              <span style={{ textTransform: 'capitalize' }}>
                {service.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </span>
              <span style={{
                color: status ? '#155724' : '#721c24',
                fontWeight: 'bold'
              }}>
                {status ? '✅ Online' : '❌ Offline'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MonitoringDashboard;