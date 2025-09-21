import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const ReportView = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState(null);
  const [violationSummary, setViolationSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportUrl, setReportUrl] = useState('');
  const [generating, setGenerating] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api';

  useEffect(() => {
    loadReportData();
  }, [sessionId]);

  const loadReportData = async () => {
    try {
      setLoading(true);

      // Validate session ID format
      if (!sessionId || sessionId.length < 10) {
        setError('Invalid session ID format. Please check the URL.');
        return;
      }

      // Get interview data
      const interviewResponse = await axios.get(`${API_BASE_URL}/interviews/${sessionId}`);

      if (interviewResponse.data.success) {
        // Backend returns data: { interview, violations, violationSummary }
        const responseData = interviewResponse.data.data;
        setInterview(responseData.interview);
        setViolationSummary(responseData.violationSummary);
      } else {
        setError('Interview not found');
      }

    } catch (error) {
      console.error('Error loading report data:', error);

      // Provide more specific error messages
      if (error.response?.status === 404) {
        setError('Interview session not found. Please check if the session ID is correct.');
      } else if (error.response?.status === 400) {
        setError('Invalid session ID format. Please check the URL.');
      } else if (error.message.includes('Network Error')) {
        setError('Connection failed. Please check your internet connection and try again.');
      } else {
        setError('Failed to load report data. Please check if the session exists and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!interview) return;

    try {
      setGenerating(true);

      // Use sessionId for report generation (backend will find by sessionId)
      console.log('Generating report for sessionId:', sessionId);

      const response = await axios.post(`${API_BASE_URL}/reports/generate/${sessionId}`);

      if (response.data.success) {
        setReportUrl(response.data.downloadUrl);

        // Auto-download the report using proper blob download
        if (response.data.filename) {
          await downloadReportFile(response.data.filename);
        }
      } else {
        setError('Failed to generate report: ' + response.data.message);
      }

    } catch (error) {
      console.error('Error generating report:', error);
      console.error('Full error response:', error.response?.data);

      // Provide more specific error messages for report generation
      if (error.response?.status === 404) {
        setError('Interview not found. Cannot generate report for non-existent interview.');
      } else if (error.response?.status === 500) {
        const serverError = error.response?.data?.error || 'Unknown server error';
        setError(`Server error while generating report: ${serverError}`);
      } else if (error.message.includes('Network Error')) {
        setError('Connection failed while generating report. Please check your internet connection.');
      } else {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        setError(`Failed to generate report: ${errorMsg}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const downloadReportFile = async (filename) => {
    try {
      // Create a proper download request
      const response = await fetch(`${API_BASE_URL}/reports/download/${filename}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/pdf',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      // Create blob from response
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

    } catch (error) {
      console.error('Error downloading report:', error);
      setError('Failed to download report');
    }
  };

  const downloadReport = async () => {
    if (!reportUrl) return;

    try {
      // Extract filename from reportUrl (e.g., /api/reports/download/filename.pdf)
      const filename = reportUrl.split('/').pop();
      await downloadReportFile(filename);
    } catch (error) {
      console.error('Error downloading report:', error);
      setError('Failed to download report');
    }
  };

  const getIntegrityColor = (score) => {
    if (score >= 90) return '#27ae60';
    if (score >= 80) return '#2ecc71';
    if (score >= 70) return '#f39c12';
    if (score >= 60) return '#e67e22';
    return '#e74c3c';
  };

  const getIntegrityStatus = (score) => {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 80) return 'GOOD';
    if (score >= 70) return 'MODERATE';
    if (score >= 60) return 'FAIR';
    return 'POOR';
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
      maxWidth: '1000px',
      margin: '0 auto'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '30px',
      borderBottom: '2px solid #f8f9fa',
      paddingBottom: '20px'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#2c3e50',
      margin: 0
    },
    backButton: {
      background: '#6c757d',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '6px',
      fontSize: '16px',
      cursor: 'pointer',
      transition: 'background 0.3s ease'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '30px'
    },
    summaryCard: {
      background: '#f8f9fa',
      borderRadius: '8px',
      padding: '20px',
      border: '1px solid #e9ecef'
    },
    cardTitle: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#495057'
    },
    metric: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '5px'
    },
    metricLabel: {
      fontSize: '14px',
      color: '#6c757d'
    },
    section: {
      marginBottom: '30px'
    },
    sectionTitle: {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '15px',
      borderBottom: '1px solid #e9ecef',
      paddingBottom: '10px'
    },
    detailRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid #f8f9fa'
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
    generateButton: {
      background: '#3498db',
      color: 'white',
      border: 'none',
      padding: '14px 28px',
      borderRadius: '6px',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      marginRight: '10px',
      transition: 'background 0.3s ease'
    },
    downloadButton: {
      background: '#27ae60',
      color: 'white',
      border: 'none',
      padding: '14px 28px',
      borderRadius: '6px',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'background 0.3s ease'
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
    statusBadge: {
      display: 'inline-block',
      padding: '6px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 'bold',
      color: 'white',
      textTransform: 'uppercase'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>📊</div>
            <div>Loading report data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.error}>
            <strong>Error:</strong> {error}
          </div>
          <button
            style={styles.backButton}
            onClick={() => navigate('/')}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.error}>
            Interview data not found for session: {sessionId}
          </div>
          <button
            style={styles.backButton}
            onClick={() => navigate('/')}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Interview Report</h1>
          <button
            style={styles.backButton}
            onClick={() => navigate('/')}
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Summary Metrics */}
        <div style={styles.grid}>
          <div style={styles.summaryCard}>
            <div style={styles.cardTitle}>Integrity Score</div>
            <div style={{
              ...styles.metric,
              color: getIntegrityColor(interview.integrityScore || 0)
            }}>
              {interview.integrityScore || 0}/100
            </div>
            <div style={styles.metricLabel}>
              <span style={{
                ...styles.statusBadge,
                backgroundColor: getIntegrityColor(interview.integrityScore || 0)
              }}>
                {getIntegrityStatus(interview.integrityScore || 0)}
              </span>
            </div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.cardTitle}>Total Violations</div>
            <div style={{
              ...styles.metric,
              color: (interview.violationCount || 0) < 3 ? '#27ae60' : (interview.violationCount || 0) < 6 ? '#f39c12' : '#e74c3c'
            }}>
              {interview.violationCount || 0}
            </div>
            <div style={styles.metricLabel}>Across all categories</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.cardTitle}>Focus Lost Count</div>
            <div style={{
              ...styles.metric,
              color: (interview.focusLostCount || 0) < 3 ? '#27ae60' : (interview.focusLostCount || 0) < 6 ? '#f39c12' : '#e74c3c'
            }}>
              {interview.focusLostCount || 0}
            </div>
            <div style={styles.metricLabel}>Attention lapses</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.cardTitle}>Duration</div>
            <div style={{ ...styles.metric, color: '#3498db' }}>
              {interview.duration || 'N/A'}
            </div>
            <div style={styles.metricLabel}>
              {interview.duration ? 'minutes' : 'In progress'}
            </div>
          </div>
        </div>

        {/* Interview Details */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Interview Details</h2>
          <div style={styles.detailRow}>
            <span><strong>Candidate Name:</strong></span>
            <span>{interview.candidateName}</span>
          </div>
          <div style={styles.detailRow}>
            <span><strong>Email:</strong></span>
            <span>{interview.candidateEmail}</span>
          </div>
          <div style={styles.detailRow}>
            <span><strong>Interviewer:</strong></span>
            <span>{interview.interviewerName}</span>
          </div>
          <div style={styles.detailRow}>
            <span><strong>Session ID:</strong></span>
            <span>{interview.sessionId}</span>
          </div>
          <div style={styles.detailRow}>
            <span><strong>Start Time:</strong></span>
            <span>{new Date(interview.startTime).toLocaleString()}</span>
          </div>
          {interview.endTime && (
            <div style={styles.detailRow}>
              <span><strong>End Time:</strong></span>
              <span>{new Date(interview.endTime).toLocaleString()}</span>
            </div>
          )}
          <div style={styles.detailRow}>
            <span><strong>Status:</strong></span>
            <span style={{ textTransform: 'capitalize' }}>{interview.status}</span>
          </div>
        </div>

        {/* Violation Summary */}
        {violationSummary && violationSummary.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Violation Summary</h2>
            {violationSummary.map((violation, index) => (
              <div key={index} style={styles.violationItem}>
                <div style={styles.violationType}>
                  {violation._id.replace(/_/g, ' ')}
                </div>
                <div style={styles.violationCount}>
                  {violation.count}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <button
            style={styles.generateButton}
            onClick={generateReport}
            disabled={generating}
          >
            {generating ? 'Generating...' : '📄 Generate PDF Report'}
          </button>

          {reportUrl && (
            <button
              style={styles.downloadButton}
              onClick={downloadReport}
            >
              ⬇️ Download Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportView;