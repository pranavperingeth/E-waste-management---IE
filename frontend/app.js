// frontend/app.js
// ---------------------------------------------------------------
// Shared helper functions for all frontend pages.
//
// This file handles:
//   - API calls with automatic token attachment (apiFetch)
//   - Token storage/retrieval in localStorage
//   - Auth guard (redirect to login if no token)
//   - Displaying success/error messages
//   - Logout
//
// Every HTML page includes this script. Page-specific logic is
// written inline in each HTML file using these helpers.
// ---------------------------------------------------------------

const API_BASE = "/api";

// --- Token management ---
// The JWT is stored in localStorage under the key "token".
// This is acceptable for a prototype; production apps might use
// httpOnly cookies for better XSS protection.

function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearToken() {
  localStorage.removeItem("token");
}

// --- Auth guard ---
// Call this at the top of any page that requires login.
// Redirects to login.html if no token is found.
function requireAuth() {
  if (!getToken()) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

// --- API fetch wrapper ---
// Automatically attaches the Bearer token if one exists.
// Returns the parsed JSON response. Throws on non-ok responses
// so callers can catch and display the error message.
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

// --- Message display helpers ---
// Shows a success or error alert inside a container element.
function showMessage(containerId, message, type = "error") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}

function clearMessage(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = "";
}

// --- XSS prevention ---
// Simple HTML escaping for user-generated content rendered in the DOM.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Logout ---
function logout() {
  clearToken();
  window.location.href = "/login.html";
}
