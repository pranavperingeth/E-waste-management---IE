// backend/routes/admin.js
// ---------------------------------------------------------------
// Admin operations & monitoring endpoints:
//   - POST  /api/admin/auth                (validate admin key)
//   - GET   /api/admin/overview            (KPI counts & metrics)
//   - GET   /api/admin/bookings            (all bookings with client info)
//   - PATCH /api/admin/bookings/:id/status (update booking status)
//   - GET   /api/admin/users               (all registered clients)
//   - POST  /api/admin/users/:id/toggle-block (toggle client block status)
//   - GET   /api/admin/antispam-logs       (view recent antispam events)
//   - GET   /api/admin/gateway-health      (Evolution API status check)
// ---------------------------------------------------------------
const express = require("express");
const pool = require("../db");

const router = express.Router();

// Helper: Check admin authorization
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"] || req.query.admin_key;
  const validSecret = process.env.INTERNAL_SECRET || "change_me_shared_with_n8n";

  // Accept configured INTERNAL_SECRET, or default demo password "admin123"
  if (adminKey === validSecret || adminKey === "admin123") {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Invalid Admin Key." });
}

// --------------- POST /api/admin/auth ---------------
router.post("/auth", (req, res) => {
  const { key } = req.body;
  const validSecret = process.env.INTERNAL_SECRET || "change_me_shared_with_n8n";

  if (key === validSecret || key === "admin123") {
    return res.json({ success: true, token: key });
  }
  return res.status(401).json({ error: "Invalid Admin Passkey." });
});

// --------------- GET /api/admin/overview ---------------
router.get("/overview", adminAuth, async (req, res) => {
  try {
    const [userRes, bookingRes, spamRes, categoryRes] = await Promise.all([
      // Total registered users and blocked count
      pool.query(`
        SELECT 
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE is_blocked = TRUE)::int AS blocked_users
        FROM registrations
      `),
      // Bookings count by status
      pool.query(`
        SELECT 
          COUNT(*)::int AS total_bookings,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_bookings,
          COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed_bookings,
          COUNT(*) FILTER (WHERE status = 'PICKED_UP')::int AS picked_up_bookings,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_bookings,
          COALESCE(SUM(quantity), 0)::int AS total_items
        FROM bookings
      `),
      // Spam stats
      pool.query(`
        SELECT 
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE action = 'BLOCKED')::int AS blocked_events
        FROM antispam_log
      `),
      // Category breakdown
      pool.query(`
        SELECT item_category, COUNT(*)::int AS count, COALESCE(SUM(quantity), 0)::int AS items
        FROM bookings
        GROUP BY item_category
        ORDER BY count DESC
      `),
    ]);

    return res.json({
      users: userRes.rows[0],
      bookings: bookingRes.rows[0],
      spam: spamRes.rows[0],
      categories: categoryRes.rows,
    });
  } catch (err) {
    console.error("Admin overview error:", err);
    return res.status(500).json({ error: "Failed to load admin overview." });
  }
});

// --------------- GET /api/admin/bookings ---------------
router.get("/bookings", adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT b.id, b.booking_ref, b.item_category, b.quantity, b.pickup_address,
             b.pickup_date, b.status, b.created_at,
             r.full_name, r.email, r.whatsapp_number
      FROM bookings b
      JOIN registrations r ON b.registration_id = r.id
    `;
    const params = [];

    if (status && status !== "ALL") {
      query += ` WHERE b.status = $1`;
      params.push(status.toUpperCase());
    }

    query += ` ORDER BY b.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error("Admin get bookings error:", err);
    return res.status(500).json({ error: "Failed to fetch bookings." });
  }
});

// --------------- PATCH /api/admin/bookings/:id/status ---------------
router.patch("/bookings/:id/status", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "PICKED_UP", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    const result = await pool.query(
      `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }

    return res.json({ success: true, booking: result.rows[0] });
  } catch (err) {
    console.error("Admin update booking status error:", err);
    return res.status(500).json({ error: "Failed to update booking status." });
  }
});

// --------------- GET /api/admin/users ---------------
router.get("/users", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.full_name, r.email, r.whatsapp_number, r.chat_state,
             r.is_blocked, r.blocked_until, r.created_at,
             COUNT(b.id)::int AS bookings_count
      FROM registrations r
      LEFT JOIN bookings b ON r.id = b.registration_id
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 100
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("Admin get users error:", err);
    return res.status(500).json({ error: "Failed to fetch users." });
  }
});

// --------------- POST /api/admin/users/:id/toggle-block ---------------
router.post("/users/:id/toggle-block", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userRes = await pool.query(
      `SELECT is_blocked, whatsapp_number FROM registrations WHERE id = $1`,
      [id]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const currentBlocked = userRes.rows[0].is_blocked;
    const newBlocked = !currentBlocked;
    const blockedUntil = newBlocked ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

    await pool.query(
      `UPDATE registrations SET is_blocked = $1, blocked_until = $2 WHERE id = $3`,
      [newBlocked, blockedUntil, id]
    );

    // Audit in antispam_log
    await pool.query(
      `INSERT INTO antispam_log (whatsapp_number, registration_id, event_type, action, reason)
       VALUES ($1, $2, 'MESSAGE', $3, 'manual_admin_toggle')`,
      [userRes.rows[0].whatsapp_number, id, newBlocked ? "BLOCKED" : "ALLOWED"]
    );

    return res.json({ success: true, is_blocked: newBlocked, blocked_until: blockedUntil });
  } catch (err) {
    console.error("Admin toggle block error:", err);
    return res.status(500).json({ error: "Failed to toggle user block." });
  }
});

// --------------- GET /api/admin/antispam-logs ---------------
router.get("/antispam-logs", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.id, l.whatsapp_number, l.event_type, l.action, l.reason, l.created_at,
             r.full_name
      FROM antispam_log l
      LEFT JOIN registrations r ON l.registration_id = r.id
      ORDER BY l.created_at DESC
      LIMIT 60
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("Admin get antispam-logs error:", err);
    return res.status(500).json({ error: "Failed to fetch antispam logs." });
  }
});

// --------------- GET /api/admin/gateway-health ---------------
router.get("/gateway-health", adminAuth, async (req, res) => {
  try {
    const apiKey = process.env.EVOLUTION_API_KEY || "change_me_long_random_uuid";
    const evoUrl = "http://evolution-api:8080";

    const stateRes = await fetch(`${evoUrl}/instance/connectionState/ewaste-bot`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(3000),
    });
    const stateData = await stateRes.json();
    return res.json({
      online: true,
      instance: stateData?.instance?.instanceName || "ewaste-bot",
      state: stateData?.instance?.state || "unknown",
    });
  } catch (err) {
    return res.json({
      online: false,
      error: err.message,
    });
  }
});

module.exports = router;
