// backend/server.js
// ---------------------------------------------------------------
// Main Express application entry point.
//
// What this file does:
//   1. Loads environment variables from .env via dotenv.
//   2. Creates the Express app with JSON parsing and CORS enabled.
//   3. Applies rate limiting to /api/register and /api/login to
//      prevent brute-force attacks (max 10 requests per 15 min per IP).
//   4. Serves the frontend static files from /app/frontend (this
//      path is a Docker volume mount — see docker-compose.yml).
//   5. Mounts API route handlers:
//        /api  → routes/auth.js  (register, login)
//        /api  → routes/me.js    (me, my-bookings)
//   6. Provides a GET /api/health endpoint for quick liveness checks.
//   7. Listens on BACKEND_PORT (default 3000).
//
// Rate limiting rationale:
//   express-rate-limit uses an in-memory store by default.
//   10 requests per 15 min on register/login is aggressive enough
//   to stop credential-stuffing while allowing normal use.
//   This also feeds into anti-spam rule R1 on the website side.
// ---------------------------------------------------------------
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const authRoutes = require("./routes/auth");
const meRoutes = require("./routes/me");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Rate limiting on auth endpoints ---
// Max 10 requests per 15 minutes per IP address
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again in 15 minutes." },
});
app.use("/api/register", authLimiter);
app.use("/api/login", authLimiter);

// --- Serve frontend static files ---
// In Docker, ./frontend is mounted read-only at /app/frontend
app.use(express.static(path.join(__dirname, "frontend")));

// --- API routes ---
app.use("/api", authRoutes);
app.use("/api", meRoutes);
app.use("/api/admin", adminRoutes);

// --- Health check ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Fallback: serve index.html for any non-API route (SPA-style) ---
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
