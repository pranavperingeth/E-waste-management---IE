// backend/db.js
// ---------------------------------------------------------------
// Creates a shared PostgreSQL connection pool using the `pg` library.
// Every route file imports this pool instead of creating its own
// connection, which avoids exhausting database connections.
// The DATABASE_URL env var is injected by docker-compose from .env.
// ---------------------------------------------------------------
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
