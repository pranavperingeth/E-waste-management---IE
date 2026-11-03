// frontend/app.js
// ---------------------------------------------------------------
// Shared helper functions for all frontend pages.
//
// Features:
//   - Token & user profile storage/retrieval in localStorage
//   - Authenticated API fetch wrapper (apiFetch)
//   - Route auth guard (requireAuth)
//   - Responsive Navbar user state detection
//   - Safe DOM manipulation & alert handling
// ---------------------------------------------------------------

const API_BASE = "/api";

// --- Token & User Management ---
function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("user_name");
}

function getUserName() {
  return localStorage.getItem("user_name") || "User";
}

function setUserName(name) {
  localStorage.setItem("user_name", name);
}

// --- Auth Guard ---
function requireAuth() {
  if (!getToken()) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

// --- API Fetch Wrapper ---
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

// --- Dynamic Navbar State ---
function initNavbar() {
  const navActions = document.getElementById("navActions");
  if (!navActions) return;

  const token = getToken();
  const userName = getUserName();

  if (token) {
    navActions.innerHTML = `
      <a href="/dashboard.html" class="btn btn-outline btn-sm">📋 My Dashboard</a>
      <button onclick="logout()" class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger-border);">Logout</button>
    `;
  } else {
    navActions.innerHTML = `
      <a href="/login.html" class="btn btn-outline btn-sm">Sign In</a>
      <a href="/register.html" class="btn btn-primary btn-sm">Get Started</a>
    `;
  }
}

// --- URL Parameter Helper ---
function getUrlParam(param) {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}

// --- Alerts & Notification Display ---
function showMessage(containerId, message, type = "error") {
  const container = document.getElementById(containerId);
  if (!container) return;
  const alertClass = type === "success" ? "alert-success" : "alert-error";
  container.innerHTML = `<div class="alert ${alertClass}">${escapeHtml(message)}</div>`;
}

function clearMessage(containerId) {
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = "";
}

// --- XSS Escaping ---
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

// --- Logout ---
function logout() {
  clearToken();
  window.location.href = "/";
}

// Auto-run navbar state check on page load
document.addEventListener("DOMContentLoaded", () => {
  initNavbar();
});
