// backend/middleware/auth.js
// ---------------------------------------------------------------
// JWT authentication middleware.
// Every protected route (e.g. GET /api/me, GET /api/my-bookings)
// passes through this middleware first.
//
// How it works:
//   1. Reads the Authorization header, expecting "Bearer <token>".
//   2. Verifies the token signature + expiry using JWT_SECRET.
//   3. If valid, attaches the user's UUID (payload.id) to req.userId
//      so downstream handlers know *who* is making the request.
//   4. If invalid or missing, returns 401 immediately.
// ---------------------------------------------------------------
const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token." });
  }

  const token = header.slice(7); // strip "Bearer "
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = auth;
