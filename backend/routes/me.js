// backend/routes/me.js
// ---------------------------------------------------------------
// Two protected endpoints (require valid JWT via auth middleware):
//
// GET /api/me
//   Returns the logged-in user's profile (full_name, email,
//   whatsapp_number). Used by the dashboard to greet the user.
//
// GET /api/my-bookings
//   Returns all bookings for the logged-in user, ordered by newest
//   first. The frontend renders these in a table on the dashboard.
//   We use the idx_bookings_reg_created index for efficient lookups.
// ---------------------------------------------------------------
const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

// --------------- GET /api/me ---------------
router.get("/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT full_name, email, whatsapp_number FROM registrations WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/me error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// --------------- GET /api/my-bookings ---------------
router.get("/my-bookings", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT booking_ref, item_category, quantity, pickup_address,
              pickup_date, status, created_at
       FROM bookings
       WHERE registration_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("GET /api/my-bookings error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
