import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ReportGenerator = () => {
  const [interviews, setInterviews] = useState([]);
  const [selectedInterview, setSelectedInterview] = useState('');
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [bulkReportData, setBulkReportData] = useState({
    startDate: '',
    endDate: ''
  });
  const [activeTab, setActiveTab] = useState('single');

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

  useEffect(() => {
    fetchInterviews();
    fetchReports();
    fetchStats();
  }, []);

  const fetchInterviews = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/interviews`);
      setInterviews(response.data.interviews || []);
    } catch (error) {
      console.error('Error fetching interviews:', error);
    }
  };

  const fetchReports = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/reports/list`);
      setReports(response.data.reports || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/reports/stats`);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const generateSingleReport = async () => {
    if (!selectedInterview) {
      alert('Please select an interview');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/reports/generate/${selectedInterview}`);

      if (response.data.success) {
        alert('Report generated successfully!');
        fetchReports(); // Refresh reports list

        // Auto-download the report
        const downloadUrl = `${API_BASE_URL}/reports/download/${response.data.filename}`;
        window.open(downloadUrl, '_blank');
      } else {
        alert('Failed to generate report: ' + response.data.message);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report');
    } finally {
      setLoading(false);
    }
  };

  const generateBulkReport = async () => {
    if (!bulkReportData.startDate || !bulkReportData.endDate) {
      alert('Please select both start and end dates');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/reports/bulk`, bulkReportData);

      if (response.data.success) {
        alert(`Bulk report generated successfully! (${response.data.totalInterviews} interviews)`);
        fetchReports(); // Refresh reports list

        // Auto-download the report
        const downloadUrl = `${API_BASE_URL}/reports/download/${response.data.filename}`;
        window.open(downloadUrl, '_blank');
      } else {
        alert('Failed to generate bulk report: ' + response.data.message);
      }
    } catch (error) {
      console.error('Error generating bulk report:', error);
      alert('Error generating bulk report');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = (filename) => {
    const downloadUrl = `${API_BASE_URL}/reports/download/${filename}`;
    window.open(downloadUrl, '_blank');
  };

  const deleteReport = async (filename) => {
    if (!confirm('Are you sure you want to delete this report?')) {
      return;
    }

    try {
      const response = await axios.delete(`${API_BASE_URL}/reports/${filename}`);

      if (response.data.success) {
        alert('Report deleted successfully');
        fetchReports(); // Refresh reports list
      } else {
        alert('Failed to delete report');
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      alert('Error deleting report');
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

        {/* Statistics Dashboard */}
        {stats && (
          <div className="stats-dashboard">
            <h3>Interview Statistics (Last {stats.periodDays} days)</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Total Interviews</h4>
                <span className="stat-number">{stats.totalInterviews}</span>
              </div>
              <div className="stat-card">
                <h4>Completed</h4>
                <span className="stat-number">{stats.completedInterviews}</span>
              </div>
              <div className="stat-card">
                <h4>In Progress</h4>
                <span className="stat-number">{stats.inProgressInterviews}</span>
              </div>
              <div className="stat-card">
                <h4>Avg Integrity Score</h4>
                <span className="stat-number">{stats.averageIntegrityScore.toFixed(1)}/100</span>
              </div>
              <div className="stat-card">
                <h4>Total Violations</h4>
                <span className="stat-number">{stats.totalViolations}</span>
              </div>
              <div className="stat-card">
                <h4>Avg Violations/Interview</h4>
                <span className="stat-number">{stats.averageViolationsPerInterview.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}

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
              disabled={loading || !selectedInterview}
              className="btn btn-primary"
            >
              {loading ? 'Generating...' : 'Generate PDF Report'}
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
              disabled={loading || !bulkReportData.startDate || !bulkReportData.endDate}
              className="btn btn-primary"
            >
              {loading ? 'Generating...' : 'Generate Bulk Report'}
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
                            className="btn btn-sm btn-success"
                          >
                            Download
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