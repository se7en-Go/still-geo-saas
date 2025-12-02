
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

// --- User Configuration ---
const username = 'seven';
const plainPassword = 'aa10101100';
const email = 'lml1140490403@163.com';
const role = 'admin';
// --------------------------

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: true,
});

const createAdmin = async () => {
  const client = await pool.connect();
  try {
    // Check if user already exists
    const existingUser = await client.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (existingUser.rows.length > 0) {
      logger.warn(`Admin user already exists (username: ${username} or email: ${email}). Aborting.`);
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    // Insert the new admin user
    const result = await client.query(
      'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
      [username, hashedPassword, email, role]
    );

    if (result.rows.length > 0) {
      logger.info('Admin user created successfully!', { user: result.rows[0] });
    } else {
      logger.error('Failed to create admin user for an unknown reason.');
    }
  } catch (err) {
    logger.error('Error creating admin user:', { error: err.message, stack: err.stack });
  } finally {
    await client.release();
    await pool.end();
  }
};

createAdmin();
