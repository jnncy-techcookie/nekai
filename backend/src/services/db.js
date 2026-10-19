const { Pool, types } = require("pg");

/* The PostgreSQL connection pool (schema: db/init.sql).
 * Connection settings come from DATABASE_URL, e.g.
 *   postgresql://nekai:password@localhost:5432/nekai
 * or, when it's not set, the standard PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE. */

// Dates stay "YYYY-MM-DD" strings instead of becoming JS Dates at local midnight,
// so a watch day never shifts with the server's time zone
types.setTypeParser(types.builtins.DATE, (value) => value);

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || undefined,
      max: Number(process.env.PGPOOL_MAX) || 10,
    });
    // An idle client losing its connection (the database restarted) shouldn't crash the server
    pool.on("error", (err) => console.error("PostgreSQL connection error:", err.message));
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

// Runs fn(client) inside one transaction: everything is saved, or nothing is
async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// true when the database answers (used by GET /api/health)
async function ping() {
  try {
    await query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { query, transaction, ping, close };
