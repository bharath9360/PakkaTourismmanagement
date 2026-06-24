/**
 * api.js — Production-grade Axios instance for Pakka Tourism CRM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Auth Strategy:
 *  • Tokens are stored in HttpOnly cookies (set by backend on login)
 *  • `withCredentials: true` ensures cookies are sent on every request
 *  • No token stored in localStorage — XSS cannot steal it
 *
 * Auto Token Refresh:
 *  • On 401 with code `TOKEN_EXPIRED`, silently calls /api/auth/refresh
 *  • Retries the original failed request after refresh
 *  • If refresh also fails → logout and redirect to /login
 *  • Concurrent 401s: only ONE refresh call happens; others wait in queue
 *
 * Circular-dependency note:
 *  • useAuthStore is imported lazily (dynamic import) inside the interceptor
 *    to avoid a circular module dependency at load time.
 * ══════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';

// ─── Programmatic navigation helper ───────────────────────────────────────────
export let navigateFn = null;
export const setNavigateFn = (fn) => { navigateFn = fn; };

// ─── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         '/api',
  withCredentials: true,    // ← Sends HttpOnly cookies automatically
  headers:         { 'Content-Type': 'application/json' },
  timeout:         30_000,
});

// ─── REQUEST INTERCEPTOR ──────────────────────────────────────────────────────
// Cookies are sent automatically via withCredentials.
// We still support a fallback Authorization header for API/mobile clients
// that store the token in localStorage (backward compat).
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('pt_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Token refresh queue ──────────────────────────────────────────────────────
// If multiple requests get 401 simultaneously, only ONE refresh call should
// happen. Others wait in this queue and retry after the first refresh completes.
let isRefreshing    = false;
let refreshQueue    = [];   // Array of { resolve, reject }

function processQueue(error = null, token = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else       resolve(token);
  });
  refreshQueue = [];
}

// ─── RESPONSE INTERCEPTOR ─────────────────────────────────────────────────────
let isLoggingOut = false;

api.interceptors.response.use(
  // ── Success passthrough ──
  (response) => response,

  // ── Error handler ──
  async (error) => {
    const originalRequest = error.config;
    const status          = error.response?.status;
    const code            = error.response?.data?.code;

    // ── Auto-refresh on TOKEN_EXPIRED ──────────────────────────────────────
    // Only attempt refresh if:
    //  • 401 response
    //  • Backend says TOKEN_EXPIRED
    //  • We haven't already retried this exact request
    //  • We're not currently logging out
    if (
      status === 401 &&
      code   === 'TOKEN_EXPIRED' &&
      !originalRequest._retried &&
      !isLoggingOut
    ) {
      originalRequest._retried = true;

      if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Call refresh endpoint — backend sets new cookies automatically
        const { data } = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
        });

        // If backend also returns token in body (legacy support), persist it
        if (data.token) {
          localStorage.setItem('pt_token', data.token);
          // Update user in localStorage if returned
          if (data.user) localStorage.setItem('pt_user', JSON.stringify(data.user));
        }

        processQueue(null, data.token);
        isRefreshing = false;

        // Retry the original request
        return api(originalRequest);

      } catch (refreshError) {
        processQueue(refreshError);
        isRefreshing = false;

        // Refresh failed → force logout
        await performLogout();
        return Promise.reject(refreshError);
      }
    }

    // ── Hard 401 (not expired — invalid/revoked) ───────────────────────────
    if (status === 401 && !isLoggingOut && !originalRequest._retried) {
      await performLogout();
    }

    return Promise.reject(error);
  },
);

// ─── Logout helper ────────────────────────────────────────────────────────────
async function performLogout() {
  if (isLoggingOut) return;
  isLoggingOut = true;

  try {
    const { default: useAuthStore } = await import('../store/useAuthStore');
    useAuthStore.getState().logout();
  } catch (_) {}

  if (navigateFn) {
    navigateFn('/login', { replace: true });
  } else {
    window.location.href = '/login';
  }

  setTimeout(() => { isLoggingOut = false; }, 3000);
}

// ─── File download helpers ────────────────────────────────────────────────────

function triggerBlobDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor    = document.createElement('a');
  anchor.href          = objectUrl;
  anchor.download      = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(anchor);
  }, 100);
}

export async function downloadFile(endpoint, filename, params = {}) {
  const response = await api.get(endpoint, { params, responseType: 'blob' });
  const cd       = response.headers['content-disposition'];
  if (cd) {
    const match = cd.match(/filename[^;=\n]*=['"](.*?)['"]/);
    if (match?.[1]) filename = match[1].trim();
  }
  triggerBlobDownload(response.data, filename);
}

export async function downloadFilePost(endpoint, filename, body = {}) {
  const response = await api.post(endpoint, body, { responseType: 'blob' });
  const cd       = response.headers['content-disposition'];
  if (cd) {
    const match = cd.match(/filename[^;=\n]*=['"](.*?)['"]/);
    if (match?.[1]) filename = match[1].trim();
  }
  triggerBlobDownload(response.data, filename);
}

export default api;
