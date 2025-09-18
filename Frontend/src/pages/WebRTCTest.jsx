import React, { useState, useEffect } from 'react';
import { generateWebRTCReport } from '../utils/webrtcTest';

const WebRTCTest = () => {
  const [testReport, setTestReport] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    setTesting(true);
    setError(null);

    try {
      const report = await generateWebRTCReport();
      setTestReport(report);
    } catch (error) {
      console.error('Test failed:', error);
      setError(error.message);
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (success) => {
    return success ? '✅' : '❌';
  };

  const getStatusColor = (success) => {
    return success ? '#27ae60' : '#e74c3c';
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    },
    card: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      padding: '30px',
      maxWidth: '800px',
      margin: '0 auto'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '20px',
      textAlign: 'center'
    },
    subtitle: {
      fontSize: '16px',
      color: '#7f8c8d',
      marginBottom: '30px',
      textAlign: 'center'
    },
    testGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '30px'
    },
    testCard: {
      background: '#f8f9fa',
      borderRadius: '8px',
      padding: '20px',
      border: '1px solid #e9ecef'
    },
    testTitle: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    testDetails: {
      fontSize: '14px',
      color: '#6c757d'
    },
    browserInfo: {
      background: '#e3f2fd',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '20px'
    },
    recommendations: {
      background: '#fff3cd',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '20px'
    },
    loading: {
      textAlign: 'center',
      padding: '40px',
      color: '#7f8c8d'
    },
    error: {
      background: '#f8d7da',
      color: '#721c24',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '20px'
    },
    button: {
      background: '#3498db',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '6px',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'background 0.3s ease'
    },
    detailsList: {
      fontSize: '12px',
      marginTop: '8px',
      paddingLeft: '20px'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🔗 WebRTC Connectivity Test</h1>
        <p style={styles.subtitle}>
          Testing your browser's WebRTC capabilities for video proctoring
        </p>

        {error && (
          <div style={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {testing && (
          <div style={styles.loading}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🧪</div>
            <div>Running WebRTC tests...</div>
            <div style={{ fontSize: '14px', marginTop: '5px' }}>
              This may take a few seconds
            </div>
          </div>
        )}

        {testReport && (
          <>
            {/* Browser Information */}
            <div style={styles.browserInfo}>
              <h3 style={{ margin: '0 0 10px 0' }}>🌐 Browser Information</h3>
              <div style={styles.testDetails}>
                <strong>{testReport.browserInfo.browser}</strong> version{' '}
                <strong>{testReport.browserInfo.version}</strong> on{' '}
                <strong>{testReport.browserInfo.platform}</strong>
                <br />
                Online: {testReport.browserInfo.onLine ? '✅' : '❌'} |
                Cookies: {testReport.browserInfo.cookieEnabled ? '✅' : '❌'}
              </div>
            </div>

            {/* Test Results */}
            <div style={styles.testGrid}>
              <div style={styles.testCard}>
                <div style={styles.testTitle}>
                  {getStatusIcon(testReport.testResults.webrtcSupport)}
                  <span style={{ color: getStatusColor(testReport.testResults.webrtcSupport) }}>
                    WebRTC Support
                  </span>
                </div>
                <div style={styles.testDetails}>
                  Browser APIs available for video calling
                  <div style={styles.detailsList}>
                    • RTCPeerConnection: {testReport.testResults.details.webrtc?.RTCPeerConnection ? '✅' : '❌'}
                    <br />
                    • getUserMedia: {testReport.testResults.details.webrtc?.getUserMedia ? '✅' : '❌'}
                    <br />
                    • RTCDataChannel: {testReport.testResults.details.webrtc?.RTCDataChannel ? '✅' : '❌'}
                  </div>
                </div>
              </div>

              <div style={styles.testCard}>
                <div style={styles.testTitle}>
                  {getStatusIcon(testReport.testResults.mediaAccess)}
                  <span style={{ color: getStatusColor(testReport.testResults.mediaAccess) }}>
                    Media Access
                  </span>
                </div>
                <div style={styles.testDetails}>
                  Camera and microphone permissions
                  {testReport.testResults.details.media?.videoTracks !== undefined && (
                    <div style={styles.detailsList}>
                      • Video tracks: {testReport.testResults.details.media.videoTracks}
                      <br />
                      • Audio tracks: {testReport.testResults.details.media.audioTracks}
                    </div>
                  )}
                  {testReport.testResults.details.media?.error && (
                    <div style={{ color: '#e74c3c', marginTop: '5px' }}>
                      Error: {testReport.testResults.details.media.error}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.testCard}>
                <div style={styles.testTitle}>
                  {getStatusIcon(testReport.testResults.stunConnectivity)}
                  <span style={{ color: getStatusColor(testReport.testResults.stunConnectivity) }}>
                    STUN Connectivity
                  </span>
                </div>
                <div style={styles.testDetails}>
                  Network connectivity for WebRTC
                  {testReport.testResults.details.stun && (
                    <div style={styles.detailsList}>
                      {testReport.testResults.details.stun.map((stun, index) => (
                        <div key={index}>
                          {stun.success ? '✅' : '❌'} {stun.server.replace('stun:', '')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.testCard}>
                <div style={styles.testTitle}>
                  {getStatusIcon(testReport.testResults.peerConnection)}
                  <span style={{ color: getStatusColor(testReport.testResults.peerConnection) }}>
                    Peer Connection
                  </span>
                </div>
                <div style={styles.testDetails}>
                  Ability to establish direct connections
                  {testReport.testResults.details.peerConnection?.signalingState && (
                    <div style={styles.detailsList}>
                      • Signaling: {testReport.testResults.details.peerConnection.signalingState}
                      <br />
                      • Data channels: {testReport.testResults.details.peerConnection.dataChannelSupport ? '✅' : '❌'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations */}
            {testReport.recommendations && testReport.recommendations.length > 0 && (
              <div style={styles.recommendations}>
                <h3 style={{ margin: '0 0 10px 0' }}>💡 Recommendations</h3>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {testReport.recommendations.map((rec, index) => (
                    <li key={index} style={{ marginBottom: '5px' }}>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Overall Status */}
            <div style={{
              textAlign: 'center',
              padding: '20px',
              background: testReport.testResults.webrtcSupport &&
                         testReport.testResults.mediaAccess &&
                         testReport.testResults.stunConnectivity ?
                         '#d4edda' : '#f8d7da',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>
                {testReport.testResults.webrtcSupport &&
                 testReport.testResults.mediaAccess &&
                 testReport.testResults.stunConnectivity ? '🎉' : '⚠️'}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                {testReport.testResults.webrtcSupport &&
                 testReport.testResults.mediaAccess &&
                 testReport.testResults.stunConnectivity
                  ? 'WebRTC is working correctly!'
                  : 'WebRTC may have issues'}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                style={styles.button}
                onClick={runTests}
                disabled={testing}
              >
                🔄 Run Tests Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WebRTCTest;