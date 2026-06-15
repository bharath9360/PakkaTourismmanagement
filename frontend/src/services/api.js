import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pt_token');
      localStorage.removeItem('pt_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: create a temporary <a> tag, trigger download, then clean up
// ─────────────────────────────────────────────────────────────────────────────
function triggerBlobDownload(blob, filename) {
  // 1. Build a temporary object URL from the blob
  const objectUrl = window.URL.createObjectURL(blob);

  // 2. Create a hidden <a> element and attach it to the DOM
  const anchor = document.createElement('a');
  anchor.href        = objectUrl;
  anchor.download    = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  // 3. Programmatically click it to start the download
  anchor.click();

  // 4. Clean up — revoke the URL and remove the anchor
  window.URL.revokeObjectURL(objectUrl);
  document.body.removeChild(anchor);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET-based file download (for most export endpoints)
//
// Usage:
//   import { downloadFile } from '../../services/api';
//   await downloadFile('/exports/leads', 'PakkaTourism_Leads.xlsx', { from, to });
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadFile(endpoint, filename, params = {}) {
  // Use responseType: 'blob' — critical, otherwise Axios parses the binary as text
  const response = await api.get(endpoint, {
    params,
    responseType: 'blob',
  });

  // Derive filename from Content-Disposition header if backend provides one
  const disposition = response.headers['content-disposition'];
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=['"]?([^'";\n]+)['"]?/);
    if (match?.[1]) filename = match[1].trim();
  }

  triggerBlobDownload(response.data, filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-based file download (for endpoints that need a request body)
//
// Usage:
//   import { downloadFilePost } from '../../services/api';
//   await downloadFilePost('/exports/custom', 'Report.xlsx', { ids: [...] });
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadFilePost(endpoint, filename, body = {}) {
  const response = await api.post(endpoint, body, {
    responseType: 'blob',
  });

  const disposition = response.headers['content-disposition'];
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=['"]?([^'";\n]+)['"]?/);
    if (match?.[1]) filename = match[1].trim();
  }

  triggerBlobDownload(response.data, filename);
}

export default api;
