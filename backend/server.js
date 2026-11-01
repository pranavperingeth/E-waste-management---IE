// Minimal server for Phase 1 (will be replaced in Phase 2)
require("dotenv").config();
const express = require("express");
const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
