const { Pool } = require('pg');
const { config } = require('./config');

const sslOptions = config.db.ssl === false ? false : { rejectUnauthorized: false };

let pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
  ssl: sslOptions,
});

const query = (text, params) => pool.query(text, params);

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function setPool(customPool) {
  if (pool && typeof pool.end === 'function') {
    pool.end().catch(() => {});
  }
  pool = customPool;
}

module.exports = {
  query,
  withTransaction,
  getPool: () => pool,
  setPool,
};
