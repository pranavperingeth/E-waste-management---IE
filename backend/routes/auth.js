// backend/routes/auth.js
// ---------------------------------------------------------------
// Two public endpoints: POST /api/register and POST /api/login.
// No JWT required — these are how users *get* a token.
//
// REGISTER flow:
//   1. Validate all 4 fields (full_name, email, password, whatsapp_number).
//   2. Normalize the phone number using libphonenumber-js so that
//      "+91 98765 43210", "09876543210", "919876543210" all become
//      "919876543210" (digits-only with country code). Default country IN.
//   3. Hash the password with bcrypt (10 salt rounds).
//   4. INSERT into registrations. PostgreSQL UNIQUE constraints on
//      email and whatsapp_number catch duplicates (error code 23505).
//   5. Log the registration attempt in antispam_log for audit.
//   6. Fire-and-forget POST to the n8n webhook so n8n can send the
//      WhatsApp welcome message. If n8n is down, we still return 201
//      to the user (the welcome message is non-critical).
//
// LOGIN flow:
//   1. Look up the user by email.
//   2. Compare the plaintext password against the stored bcrypt hash.
//   3. If valid, sign a JWT with { id: <uuid> } expiring in 7 days.
// ---------------------------------------------------------------
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { parsePhoneNumber, isValidPhoneNumber } = require("libphonenumber-js");
const pool = require("../db");

const router = express.Router();

// --------------- POST /api/register ---------------
router.post("/register", async (req, res) => {
  try {
    const { full_name, email, password, whatsapp_number } = req.body;

    // --- Validate required fields ---
    if (!full_name || !email || !password || !whatsapp_number) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // --- Validate email format (simple regex, not exhaustive) ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    // --- Validate password length ---
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    }

    // --- Normalize WhatsApp number with libphonenumber-js ---
    // ASSUMPTION: default country is IN (India) as stated in the plan.
    // This lets users type "9876543210" and we auto-prepend "91".
    if (!isValidPhoneNumber(whatsapp_number, "IN")) {
      return res.status(400).json({ error: "Invalid WhatsApp number." });
    }
    const parsed = parsePhoneNumber(whatsapp_number, "IN");
    // Digits only with country code, e.g. "919876543210"
    const normalizedNumber = parsed.countryCallingCode + parsed.nationalNumber;

    // --- Hash password (10 bcrypt rounds) ---
    const password_hash = await bcrypt.hash(password, 10);

    // --- Insert into registrations ---
    const insertResult = await pool.query(
      `INSERT INTO registrations (full_name, email, password_hash, whatsapp_number)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [full_name, email.toLowerCase().trim(), password_hash, normalizedNumber]
    );

    const registrationId = insertResult.rows[0].id;

    // --- Log to antispam_log (audit trail for registration) ---
    await pool.query(
      `INSERT INTO antispam_log (whatsapp_number, registration_id, event_type, action)
       VALUES ($1, $2, 'REGISTER', 'ALLOWED')`,
      [normalizedNumber, registrationId]
    );

    // --- Fire-and-forget POST to n8n webhook ---
    // n8n will use this to send the WhatsApp welcome message via Evolution API.
    // We don't await the result — if n8n is unreachable, registration still succeeds.
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.INTERNAL_SECRET || "",
        },
        body: JSON.stringify({
          whatsapp_number: normalizedNumber,
          full_name: full_name,
        }),
      }).catch((err) => {
        console.error("Failed to notify n8n:", err.message);
      });
    }

    return res.status(201).json({ message: "Registered. Check WhatsApp." });
  } catch (err) {
    // --- Handle PostgreSQL unique constraint violations ---
    // Error code 23505 = unique_violation
    if (err.code === "23505") {
      const detail = err.detail || "";
      if (detail.includes("email")) {
        return res.status(409).json({ error: "Email already registered." });
      }
      if (detail.includes("whatsapp_number")) {
        return res
          .status(409)
          .json({ error: "WhatsApp number already registered." });
      }
      return res.status(409).json({ error: "Duplicate entry." });
    }
    console.error("Register error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// --------------- POST /api/login ---------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // Look up user by normalized email
    const result = await pool.query(
      `SELECT id, password_hash FROM registrations WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      // Same generic message whether email or password is wrong (security)
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Sign JWT with user's UUID, expires in 7 days
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
