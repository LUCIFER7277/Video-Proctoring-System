import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const ReportGenerator = () => {
  const [interviews, setInterviews] = useState([]);
  const [selectedInterview, setSelectedInterview] = useState('');
  const [loading, setLoading] = useState({
    interviews: false,
    reports: false,
    stats: false,
    generating: false,
    downloading: null
  });
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [bulkReportData, setBulkReportData] = useState({
    startDate: '',
    endDate: ''
  });
  const [activeTab, setActiveTab] = useState('single');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Refs for cleanup
  const abortController = useRef(new AbortController());

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api';

  // Cleanup function
  const cleanup = useCallback(() => {
    abortController.current.abort();
  }, []);

  useEffect(() => {
    fetchInterviews();
    fetchReports();
    fetchStats();

    return cleanup;
  }, [cleanup]);

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const fetchInterviews = async () => {
    try {
      setLoading(prev => ({ ...prev, interviews: true }));
      setError(null);

      const response = await axios.get(`${API_BASE_URL}/interviews`, {
        signal: abortController.current.signal,
        timeout: 10000
      });

      if (response.data?.success !== false) {
        setInterviews(response.data.interviews || response.data || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch interviews');
      }
    } catch (error) {
      if (error.name !== 'CanceledError') {
        console.error('Error fetching interviews:', error);
        setError('Failed to load interviews. Please try again.');
      }
    } finally {
      setLoading(prev => ({ ...prev, interviews: false }));
    }
  };

  const fetchReports = async () => {
    try {
      setLoading(prev => ({ ...prev, reports: true }));
      setError(null);

      const response = await axios.get(`${API_BASE_URL}/reports/list`, {
        signal: abortController.current.signal,
        timeout: 10000
      });

      if (response.data?.success !== false) {
        setReports(response.data.reports || response.data || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch reports');
      }
    } catch (error) {
      if (error.name !== 'CanceledError') {
        console.error('Error fetching reports:', error);
        setError('Failed to load reports. Please try again.');
      }
    } finally {
      setLoading(prev => ({ ...prev, reports: false }));
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(prev => ({ ...prev, stats: true }));
      setError(null);

      const response = await axios.get(`${API_BASE_URL}/reports/stats`, {
        signal: abortController.current.signal,
        timeout: 10000
      });

      if (response.data?.success !== false) {
        setStats(response.data.stats || response.data);
      } else {
        throw new Error(response.data.message || 'Failed to fetch statistics');
      }
    } catch (error) {
      if (error.name !== 'CanceledError') {
        console.error('Error fetching stats:', error);
        setError('Failed to load statistics. Please try again.');
      }
    } finally {
      setLoading(prev => ({ ...prev, stats: false }));
    }
  };

  const validateDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) {
      return 'Please select both start and end dates';
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start > end) {
      return 'Start date must be before end date';
    }

    if (start > now) {
      return 'Start date cannot be in the future';
    }

    if (end > now) {
      return 'End date cannot be in the future';
    }

    // Limit to 1 year range
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (end - start > oneYear) {
      return 'Date range cannot exceed one year';
    }

    return null;
  };

  const generateSingleReport = async () => {
    if (!selectedInterview) {
      setError('Please select an interview');
      return;
    }

    try {
      setLoading(prev => ({ ...prev, generating: true }));
      setError(null);
      setSuccess(null);

      const response = await axios.post(`${API_BASE_URL}/reports/generate/${selectedInterview}`, {}, {
        signal: abortController.current.signal,
        timeout: 60000 // 1 minute timeout for report generation
      });

      if (response.data.success) {
        setSuccess('Report generated successfully!');
        await fetchReports(); // Refresh reports list

        // Auto-download the report
        if (response.data.filename) {
          await downloadReport(response.data.filename);
        }
      } else {
        throw new Error(response.data.message || 'Failed to generate report');
      }
    } catch (error) {
      if (error.name !== 'CanceledError') {
        console.error('Error generating report:', error);
        if (error.code === 'ECONNABORTED') {
          setError('Report generation timeout. Please try again.');
        } else if (error.response?.status === 404) {
          setError('Interview not found. Please select a valid interview.');
        } else if (error.response?.status === 500) {
          setError('Server error while generating report. Please try again later.');
        } else {
          setError(error.message || 'Failed to generate report');
        }
      }
    } finally {
      setLoading(prev => ({ ...prev, generating: false }));
    }
  };

  const generateBulkReport = async () => {
    const validationError = validateDateRange(bulkReportData.startDate, bulkReportData.endDate);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(prev => ({ ...prev, generating: true }));
      setError(null);
      setSuccess(null);

      const response = await axios.post(`${API_BASE_URL}/reports/bulk`, bulkReportData, {
        signal: abortController.current.signal,
        timeout: 120000 // 2 minutes timeout for bulk report generation
      });

      if (response.data.success) {
        const totalInterviews = response.data.totalInterviews || 0;
        setSuccess(`Bulk report generated successfully! (${totalInterviews} interviews processed)`);
        await fetchReports(); // Refresh reports list

        // Auto-download the report
        if (response.data.filename) {
          await downloadReport(response.data.filename);
        }
      } else {
        throw new Error(response.data.message || 'Failed to generate bulk report');
      }
    } catch (error) {
      if (error.name !== 'CanceledError') {
        console.error('Error generating bulk report:', error);
        if (error.code === 'ECONNABORTED') {
          setError('Bulk report generation timeout. Please try a smaller date range.');
        } else if (error.response?.status === 400) {
          setError('Invalid date range. Please check your selection.');
        } else if (error.response?.status === 500) {
          setError('Server error while generating bulk report. Please try again later.');
        } else {
          setError(error.message || 'Failed to generate bulk report');
        }
      }
    } finally {
      setLoading(prev => ({ ...prev, generating: false }));
    }
  };

  const downloadReport = async (filename) => {
    if (!filename) {
      setError('Invalid filename for download');
      return;
    }

    // Validate filename for security
    if (!/^[a-zA-Z0-9_-]+\.pdf$/.test(filename)) {
      setError('Invalid file format. Only PDF files are allowed.');
      return;
    }

    try {
      setLoading(prev => ({ ...prev, downloading: filename }));
      setError(null);

      const response = await fetch(`${API_BASE_URL}/reports/download/${encodeURIComponent(filename)}`, {
        method: 'GET',
        signal: abortController.current.signal,
        // Remove Content-Type header to let browser determine
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Report file not found');
        } else if (response.status === 403) {
          throw new Error('Access denied to download report');
        } else {
          throw new Error(`Download failed: ${response.status}`);
        }
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/pdf')) {
        throw new Error('Invalid file type received');
      }

      // Create blob from response
      const blob = await response.blob();

      // Validate file size (max 50MB)
      if (blob.size > 50 * 1024 * 1024) {
        throw new Error('File too large to download');
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);

      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setSuccess(`Report "${filename}" downloaded successfully`);
      } finally {
        // Always cleanup URL object
        window.URL.revokeObjectURL(url);
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error downloading report:', error);
        setError(`Failed to download report: ${error.message}`);
      }
    } finally {
      setLoading(prev => ({ ...prev, downloading: null }));
    }
  };

  const deleteReport = async (filename) => {
    if (!filename) {
      setError('Invalid filename for deletion');
      return;
    }

    // Enhanced confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete the report "${filename}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError(null);

      const response = await axios.delete(`${API_BASE_URL}/reports/${encodeURIComponent(filename)}`, {
        signal: abortController.current.signal,
        timeout: 10000
      });

      if (response.data.success) {
        setSuccess(`Report "${filename}" deleted successfully`);
        await fetchReports(); // Refresh reports list
      } else {
        throw new Error(response.data.message || 'Failed to delete report');
      }
    } catch (error) {
      if (error.name !== 'CanceledError') {
        console.error('Error deleting report:', error);
        if (error.response?.status === 404) {
          setError('Report not found. It may have already been deleted.');
        } else if (error.response?.status === 403) {
          setError('Access denied. You do not have permission to delete this report.');
        } else {
          setError(error.message || 'Failed to delete report');
        }
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="report-generator">
      <div className="container">
        <h2>PDF Report Generator</h2>

        {/* Error and Success Messages */}
        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span className="alert-message">{error}</span>
            <button
              className="alert-close"
              onClick={() => setError(null)}
              aria-label="Close error message"
            >
              ✕
            </button>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span className="alert-icon">✅</span>
            <span className="alert-message">{success}</span>
            <button
              className="alert-close"
              onClick={() => setSuccess(null)}
              aria-label="Close success message"
            >
              ✕
            </button>
          </div>
        )}

        {/* Statistics Dashboard */}
        {loading.stats ? (
          <div className="stats-dashboard">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <span>Loading statistics...</span>
            </div>
          </div>
        ) : stats ? (
          <div className="stats-dashboard">
            <h3>Interview Statistics (Last {stats.periodDays || 30} days)</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Total Interviews</h4>
                <span className="stat-number">{stats.totalInterviews || 0}</span>
              </div>
              <div className="stat-card">
                <h4>Completed</h4>
                <span className="stat-number">{stats.completedInterviews || 0}</span>
              </div>
              <div className="stat-card">
                <h4>In Progress</h4>
                <span className="stat-number">{stats.inProgressInterviews || 0}</span>
              </div>
              <div className="stat-card">
                <h4>Avg Integrity Score</h4>
                <span className="stat-number">{(stats.averageIntegrityScore || 0).toFixed(1)}/100</span>
              </div>
              <div className="stat-card">
                <h4>Total Violations</h4>
                <span className="stat-number">{stats.totalViolations || 0}</span>
              </div>
              <div className="stat-card">
                <h4>Avg Violations/Interview</h4>
                <span className="stat-number">{(stats.averageViolationsPerInterview || 0).toFixed(1)}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={activeTab === 'single' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('single')}
          >
            Single Interview Report
          </button>
          <button
            className={activeTab === 'bulk' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('bulk')}
          >
            Bulk Report
          </button>
          <button
            className={activeTab === 'manage' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('manage')}
          >
            Manage Reports
          </button>
        </div>

        {/* Single Interview Report */}
        {activeTab === 'single' && (
          <div className="tab-content">
            <h3>Generate Single Interview Report</h3>
            <div className="form-group">
              <label htmlFor="interviewSelect">Select Interview:</label>
              <select
                id="interviewSelect"
                value={selectedInterview}
                onChange={(e) => setSelectedInterview(e.target.value)}
                className="form-control"
              >
                <option value="">-- Select an Interview --</option>
                {interviews.map((interview) => (
                  <option key={interview._id} value={interview._id}>
                    {interview.candidateName} - {interview.sessionId}
                    ({new Date(interview.startTime).toLocaleDateString()})
                    - Integrity: {interview.integrityScore}/100
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={generateSingleReport}
              disabled={loading.generating || !selectedInterview}
              className="btn btn-primary"
            >
              {loading.generating ? (
                <>
                  <span className="spinner small"></span>
                  Generating...
                </>
              ) : (
                'Generate PDF Report'
              )}
            </button>
          </div>
        )}

        {/* Bulk Report */}
        {activeTab === 'bulk' && (
          <div className="tab-content">
            <h3>Generate Bulk Report</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startDate">Start Date:</label>
                <input
                  type="date"
                  id="startDate"
                  value={bulkReportData.startDate}
                  onChange={(e) => setBulkReportData({
                    ...bulkReportData,
                    startDate: e.target.value
                  })}
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label htmlFor="endDate">End Date:</label>
                <input
                  type="date"
                  id="endDate"
                  value={bulkReportData.endDate}
                  onChange={(e) => setBulkReportData({
                    ...bulkReportData,
                    endDate: e.target.value
                  })}
                  className="form-control"
                />
              </div>
            </div>
            <button
              onClick={generateBulkReport}
              disabled={loading.generating || !bulkReportData.startDate || !bulkReportData.endDate}
              className="btn btn-primary"
            >
              {loading.generating ? (
                <>
                  <span className="spinner small"></span>
                  Generating...
                </>
              ) : (
                'Generate Bulk Report'
              )}
            </button>
          </div>
        )}

        {/* Manage Reports */}
        {activeTab === 'manage' && (
          <div className="tab-content">
            <h3>Generated Reports</h3>
            {reports.length === 0 ? (
              <p>No reports generated yet.</p>
            ) : (
              <div className="reports-table">
                <table>
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Size</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.filename}>
                        <td>{report.filename}</td>
                        <td>{formatFileSize(report.size)}</td>
                        <td>{new Date(report.createdAt).toLocaleString()}</td>
                        <td className="actions">
                          <button
                            onClick={() => downloadReport(report.filename)}
                            disabled={loading.downloading === report.filename}
                            className="btn btn-sm btn-success"
                          >
                            {loading.downloading === report.filename ? (
                              <>
                                <span className="spinner small"></span>
                                Downloading...
                              </>
                            ) : (
                              'Download'
                            )}
                          </button>
                          <button
                            onClick={() => deleteReport(report.filename)}
                            className="btn btn-sm btn-danger"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .report-generator {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .container h2 {
          text-align: center;
          color: #2C3E50;
          margin-bottom: 30px;
        }

        .stats-dashboard {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }

        .stats-dashboard h3 {
          color: #2C3E50;
          margin-bottom: 20px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }

        .stat-card {
          background: white;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          text-align: center;
        }

        .stat-card h4 {
          margin: 0 0 10px 0;
          color: #666;
          font-size: 14px;
        }

        .stat-number {
          font-size: 24px;
          font-weight: bold;
          color: #3498DB;
        }

        .tab-navigation {
          display: flex;
          margin-bottom: 20px;
          border-bottom: 2px solid #e9ecef;
        }

        .tab {
          padding: 12px 24px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: #666;
          border-bottom: 3px solid transparent;
          transition: all 0.3s ease;
        }

        .tab:hover {
          color: #3498DB;
        }

        .tab.active {
          color: #3498DB;
          border-bottom-color: #3498DB;
        }

        .tab-content {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .tab-content h3 {
          color: #2C3E50;
          margin-bottom: 20px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .form-control {
          width: 100%;
          padding: 12px;
          border: 2px solid #e9ecef;
          border-radius: 6px;
          font-size: 16px;
          transition: border-color 0.3s ease;
        }

        .form-control:focus {
          outline: none;
          border-color: #3498DB;
        }

        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-right: 10px;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #3498DB;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2980B9;
        }

        .btn-success {
          background: #27AE60;
          color: white;
        }

        .btn-success:hover {
          background: #229954;
        }

        .btn-danger {
          background: #E74C3C;
          color: white;
        }

        .btn-danger:hover {
          background: #C0392B;
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 14px;
        }

        .reports-table {
          overflow-x: auto;
        }

        .reports-table table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }

        .reports-table th,
        .reports-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e9ecef;
        }

        .reports-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: #2C3E50;
        }

        .actions {
          white-space: nowrap;
        }

        /* Alert Styles */
        .alert {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 14px;
          font-weight: 500;
        }

        .alert-error {
          background: #fee;
          border: 1px solid #fcc;
          color: #c33;
        }

        .alert-success {
          background: #efe;
          border: 1px solid #cfc;
          color: #3c3;
        }

        .alert-icon {
          margin-right: 8px;
          font-size: 16px;
        }

        .alert-message {
          flex: 1;
        }

        .alert-close {
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
          padding: 0;
          margin-left: 8px;
          opacity: 0.7;
        }

        .alert-close:hover {
          opacity: 1;
        }

        /* Loading Spinner Styles */
        .loading-spinner {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          color: #666;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 8px;
        }

        .spinner.small {
          width: 14px;
          height: 14px;
          border-width: 1px;
          margin-right: 6px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }

          .tab-navigation {
            flex-direction: column;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ReportGenerator;