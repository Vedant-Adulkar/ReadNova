/**
 * src/lib/apiClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised fetch wrapper that:
 *  - Prepends VITE_API_URL to every request
 *  - Attaches the Bearer token from localStorage automatically
 *  - Parses JSON responses
 *  - Throws a structured error on non-2xx status so callers can show toasts
 * ─────────────────────────────────────────────────────────────────────────────
 */

let rawBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Remove trailing slash if present
if (rawBaseUrl.endsWith("/")) {
  rawBaseUrl = rawBaseUrl.slice(0, -1);
}

// Ensure it ends with /api if it doesn't already
// This handles cases where VITE_API_URL is just the domain
if (!rawBaseUrl.endsWith("/api")) {
  rawBaseUrl = `${rawBaseUrl}/api`;
}

// Guard: must have a protocol — catches missing https:// in Vercel env vars
if (!rawBaseUrl.startsWith("http://") && !rawBaseUrl.startsWith("https://")) {
  console.error(
    `[apiClient] VITE_API_URL is missing a protocol (http:// or https://).\n` +
    `Current value: "${rawBaseUrl}"\n` +
    `Fix: set VITE_API_URL=https://readnova-7c5h.onrender.com/api in Vercel environment variables.`
  );
  rawBaseUrl = `https://${rawBaseUrl}`;
}

const BASE_URL = rawBaseUrl;

/**
 * api(path, options) — thin wrapper around fetch.
 *
 * @param {string} path     - e.g. "/books" or "/auth/login"
 * @param {RequestInit & { params?: Record<string,string|number> }} options
 * @returns {Promise<any>}  Parsed JSON body of a successful response
 * @throws {{ message: string, status: number }}
 */
const api = async (path, { params, ...options } = {}) => {
  // Build URL with optional query params
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }

  // Attach token if present
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url.toString(), { ...options, headers });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    let msg = data.message || `Request failed: ${response.status}`;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const parts = data.errors.map((e) => e.message || e.msg || e).filter(Boolean);
      if (parts.length) msg = parts.join(". ");
    }
    const error = new Error(msg);
    error.status = response.status;
    throw error;
  }

  return data;
};

// ── Convenience methods ───────────────────────────────────────────────────────
export const get = (path, params, opts = {}) => api(path, { method: "GET", params, ...opts });
export const post = (path, body, opts = {}) => api(path, { method: "POST", body: JSON.stringify(body), ...opts });
export const put = (path, body, opts = {}) => api(path, { method: "PUT", body: JSON.stringify(body), ...opts });
export const del = (path, opts = {}) => api(path, { method: "DELETE", ...opts });

export default { get, post, put, del };
