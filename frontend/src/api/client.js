const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(
      (typeof data === 'object' && data?.error) ||
        `Request failed with status ${response.status}`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function fetchAttendanceSession({ platform, screenSize }) {
  const params = new URLSearchParams({ platform, screenSize });
  return apiRequest(`/api/attendance/session?${params.toString()}`);
}

export function postCheckIn(payload) {
  return apiRequest('/api/attendance/check-in', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function postCheckOut(payload) {
  return apiRequest('/api/attendance/check-out', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchVapidPublicKey() {
  return apiRequest('/api/attendance/vapid-public-key');
}

export function postSubscribePush(payload) {
  return apiRequest('/api/attendance/subscribe-push', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchMonthlyLedger(yearMonth) {
  const params = new URLSearchParams({ yearMonth });
  return apiRequest(`/api/admin/monthly-ledger?${params.toString()}`);
}

export function postAdminLogin(credentials) {
  return apiRequest('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
}

export function postAdminLogout() {
  return apiRequest('/api/admin/logout', {
    method: 'POST'
  });
}

export function postManualOverride(payload) {
  return apiRequest('/api/admin/manual-override', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function postUnbindDevice(employeeId) {
  return apiRequest('/api/admin/unbind-device', {
    method: 'POST',
    body: JSON.stringify({ employeeId })
  });
}

