const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : '/api';

// Get auth token
function getToken() {
  return localStorage.getItem('token');
}

// Get user info
function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

// Set auth data
function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

// Clear auth data
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Check if logged in
function isLoggedIn() {
  return !!getToken();
}

// Check if user has permission
function hasPermission(permission) {
  const user = getUser();
  if (!user || user.role !== 'admin') return false;
  return user.permissions && user.permissions[permission] === true;
}

// ============================================
// ENHANCED API CALL HELPER (NOW HANDLES BLOCKING)
// ============================================
async function apiCall(endpoint, options = {}) {
  const token = getToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    ...options
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();

    // ✅ NEW: Handle 403 responses specially (blocking)
    if (response.status === 403 && data.blocked) {
      // Return the blocking info to the caller
      return {
        blocked: true,
        reason: data.reason,
        recommendations: data.recommendations || [],
        currentScore: data.currentScore,
        currentRisk: data.currentRisk,
        error: data.error || 'Action blocked'
      };
    }

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth APIs
const authAPI = {
  login: (email, password) =>
    apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  register: (userData) =>
    apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    })
};

// ============================================
// ENHANCED TASK APIs (NOW HANDLES BLOCKING)
// ============================================
const taskAPI = {
  getAll: () => apiCall('/tasks'),

  /**
   * Create a new task
   * Returns: 
   * - Success: { task: {...}, message: "...", warning?: "...", recommendations?: [...] }
   * - Blocked: { blocked: true, reason: "...", recommendations: [...], currentScore: 65 }
   */
  create: async (task) => {
    const result = await apiCall('/tasks', {
      method: 'POST',
      body: JSON.stringify(task)
    });
    return result;
  },

  update: (id, task) =>
    apiCall(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task)
    }),

  delete: (id) =>
    apiCall(`/tasks/${id}`, {
      method: 'DELETE'
    })
};

// Workload APIs
const workloadAPI = {
  get: (days = 30) => apiCall(`/workload?days=${days}`),

  getForStudent: (studentId, days = 30) =>
    apiCall(`/workload/student/${studentId}?days=${days}`)
};

// Grade APIs - UPDATED WITH EXCEL UPLOAD
const gradeAPI = {
  getAll: () => apiCall('/grades'),

  create: (grade) =>
    apiCall('/grades', {
      method: 'POST',
      body: JSON.stringify(grade)
    }),

  bulkCreate: (grades) =>
    apiCall('/grades/bulk', {
      method: 'POST',
      body: JSON.stringify({ grades })
    }),

  // Upload Excel/CSV
  uploadExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const response = await fetch(`${API_URL}/grades/upload-excel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Excel upload failed');
    }

    return response.json();
  },

  getForStudent: (studentId) =>
    apiCall(`/grades/student/${studentId}`)
};

// ============================================
// ENHANCED CALENDAR APIs (NOW HANDLES BLOCKING)
// ============================================
const calendarAPI = {
  get: (startDate, endDate) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiCall(`/calendar/all?${params}`);
  },

  /**
   * Create a personal event
   * Returns: 
   * - Success: { event: {...}, message: "...", warning?: "...", recommendations?: [...] }
   * - Blocked: { blocked: true, reason: "...", recommendations: [...], currentScore: 65 }
   */
  create: async (event) => {
    const result = await apiCall('/calendar/personal', {
      method: 'POST',
      body: JSON.stringify(event)
    });
    return result;
  },

  createInstitutional: (event) =>
    apiCall('/admin/calendar/institutional', {
      method: 'POST',
      body: JSON.stringify(event)
    }),

  delete: (id) =>
    apiCall(`/calendar/personal/${id}`, {
      method: 'DELETE'
    })
};

// Burnout APIs
const burnoutAPI = {
  getAnalysis: () => apiCall('/burnout/analysis'),

  getHistory: (days = 30) => apiCall(`/burnout/history?days=${days}`),

  getAnalysisForStudent: (studentId) =>
    apiCall(`/burnout/analysis/${studentId}`),

  getRecommendations: () => apiCall('/burnout/recommendations')
};

// Proctor APIs
const proctorAPI = {
  getStudents: () => apiCall('/proctor/students'),

  getStudent: (studentId) => apiCall(`/proctor/student/${studentId}`),

  addIntervention: (intervention) =>
    apiCall('/proctor/intervention', {
      method: 'POST',
      body: JSON.stringify(intervention)
    }),

  getInterventions: (studentId) =>
    apiCall(`/proctor/interventions/${studentId}`),

  updateIntervention: (id, status) =>
    apiCall(`/proctor/intervention/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    })
};

// Admin APIs
const adminAPI = {
  getUsers: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return apiCall(`/admin/users?${params}`);
  },

  getUserById: (id) => apiCall(`/admin/users/${id}`),

  createUser: (userData) =>
    apiCall('/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    }),

  updateUser: (id, userData) =>
    apiCall(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    }),

  toggleUserStatus: (id) =>
    apiCall(`/admin/users/${id}/toggle-status`, {
      method: 'PATCH'
    }),

  deleteUser: (id) =>
    apiCall(`/admin/users/${id}`, {
      method: 'DELETE'
    }),

  getProctors: () => apiCall('/admin/proctors'),

  assignStudents: (proctorId, studentIds) =>
    apiCall(`/admin/proctors/${proctorId}/assign-students`, {
      method: 'POST',
      body: JSON.stringify({ studentIds })
    }),

  removeStudents: (proctorId, studentIds) =>
    apiCall(`/admin/proctors/${proctorId}/remove-students`, {
      method: 'POST',
      body: JSON.stringify({ studentIds })
    }),

  getStats: () => apiCall('/admin/analytics/stats'),

  getDepartments: () => apiCall('/admin/analytics/departments'),

  getBurnoutTrends: (days = 30) =>
    apiCall(`/admin/analytics/burnout-trends?days=${days}`),

  getHighRiskStudents: () => apiCall('/admin/analytics/high-risk-students'),

  getInstitutionalEvents: () => apiCall('/admin/calendar/institutional'),

  createInstitutionalEvent: (event) =>
    apiCall('/admin/calendar/institutional', {
      method: 'POST',
      body: JSON.stringify(event)
    }),

  updateInstitutionalEvent: (id, event) =>
    apiCall(`/admin/calendar/institutional/${id}`, {
      method: 'PUT',
      body: JSON.stringify(event)
    }),

  deleteInstitutionalEvent: (id) =>
    apiCall(`/admin/calendar/institutional/${id}`, {
      method: 'DELETE'
    }),

  exportData: (type, format = 'json') =>
    apiCall(`/admin/export/${type}?format=${format}`)
};

// ============================================
// HELPER FUNCTIONS FOR UI BLOCKING/WARNINGS
// ============================================

/**
 * Show a blocking modal to the user
 * @param {Object} blockInfo - { reason, recommendations, currentScore, currentRisk }
 */
function showBlockingModal(blockInfo) {
  const modal = document.createElement('div');
  modal.className = 'burnout-blocking-modal';
  modal.innerHTML = `
    <div class="burnout-modal-overlay"></div>
    <div class="burnout-modal-content blocked">
      <div class="burnout-modal-header">
        <span class="burnout-icon">🛑</span>
        <h2>Action Blocked for Your Wellbeing</h2>
      </div>
      <div class="burnout-modal-body">
        <div class="burnout-score-badge risk-${blockInfo.currentRisk}">
          Burnout Risk: ${blockInfo.currentRisk.toUpperCase()} (${blockInfo.currentScore}/100)
        </div>
        <p class="burnout-reason">${blockInfo.reason}</p>
        <div class="burnout-recommendations">
          <h3>📋 What You Can Do:</h3>
          <ul>
            ${blockInfo.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="burnout-modal-footer">
        <button class="btn-primary" onclick="this.closest('.burnout-blocking-modal').remove()">
          Understood
        </button>
        <a href="student.html" class="btn-secondary">View Dashboard</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * Show a warning modal to the user (allows proceeding)
 * @param {Object} warnInfo - { warning, recommendations, currentScore }
 */
function showWarningModal(warnInfo) {
  const modal = document.createElement('div');
  modal.className = 'burnout-warning-modal';
  modal.innerHTML = `
    <div class="burnout-modal-overlay"></div>
    <div class="burnout-modal-content warning">
      <div class="burnout-modal-header">
        <span class="burnout-icon">⚠️</span>
        <h2>Burnout Risk Warning</h2>
      </div>
      <div class="burnout-modal-body">
        <div class="burnout-score-badge risk-medium">
          Current Score: ${warnInfo.currentScore}/100
        </div>
        <p class="burnout-reason">${warnInfo.warning}</p>
        <div class="burnout-recommendations">
          <h3>💡 Recommendations:</h3>
          <ul>
            ${warnInfo.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="burnout-modal-footer">
        <button class="btn-primary" onclick="this.closest('.burnout-warning-modal').remove()">
          Got It
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ============================================
// ADD STYLES FOR MODALS
// ============================================
const modalStyles = `
<style>
.burnout-blocking-modal,
.burnout-warning-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.burnout-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.burnout-modal-content {
  position: relative;
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.burnout-modal-content.blocked {
  border-top: 4px solid #e74c3c;
}

.burnout-modal-content.warning {
  border-top: 4px solid #f39c12;
}

.burnout-modal-header {
  padding: 2rem;
  text-align: center;
  border-bottom: 1px solid #eee;
}

.burnout-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 1rem;
}

.burnout-modal-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.burnout-modal-body {
  padding: 2rem;
}

.burnout-score-badge {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.burnout-score-badge.risk-high {
  background: #fee;
  color: #e74c3c;
  border: 2px solid #e74c3c;
}

.burnout-score-badge.risk-medium {
  background: #ffeaa7;
  color: #f39c12;
  border: 2px solid #f39c12;
}

.burnout-reason {
  font-size: 1.1rem;
  color: #555;
  margin: 1.5rem 0;
  line-height: 1.6;
}

.burnout-recommendations {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  margin-top: 1.5rem;
}

.burnout-recommendations h3 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1rem;
}

.burnout-recommendations ul {
  margin: 0;
  padding-left: 1.5rem;
}

.burnout-recommendations li {
  margin: 0.8rem 0;
  color: #555;
  line-height: 1.5;
}

.burnout-modal-footer {
  padding: 1.5rem 2rem;
  border-top: 1px solid #eee;
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.burnout-modal-footer .btn-primary {
  background: #3498db;
  color: white;
  padding: 0.8rem 2rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.3s;
}

.burnout-modal-footer .btn-primary:hover {
  background: #2980b9;
}

.burnout-modal-footer .btn-secondary {
  background: white;
  color: #3498db;
  padding: 0.8rem 2rem;
  border: 2px solid #3498db;
  border-radius: 6px;
  text-decoration: none;
  font-size: 1rem;
  transition: all 0.3s;
  display: inline-block;
}

.burnout-modal-footer .btn-secondary:hover {
  background: #3498db;
  color: white;
}
</style>
`;

// Inject styles into page
if (typeof document !== 'undefined') {
  document.head.insertAdjacentHTML('beforeend', modalStyles);

}
