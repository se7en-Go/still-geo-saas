require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

// --- User Configuration ---
const username = 'seven';
const plainPassword = 'Zwj#1234567890'; // 更新为正确的密码
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

const updateAdminPassword = async () => {
  const client = await pool.connect();
  try {
    // Check if user exists
    const existingUser = await client.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (existingUser.rows.length === 0) {
      logger.warn(`Admin user does not exist (username: ${username} or email: ${email}). Please create user first.`);
      return;
    }

    const user = existingUser.rows[0];
    logger.info('Found existing user:', { id: user.id, username: user.username, email: user.email });

    // Test current password
    const currentPasswordMatch = await bcrypt.compare(plainPassword, user.password);
    if (currentPasswordMatch) {
      logger.info('Password is already correct. No update needed.');
      return;
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    logger.info('Updating password for admin user...');

    // Update the admin user password
    const result = await client.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, username, email, role',
      [hashedPassword, user.id]
    );

    if (result.rows.length > 0) {
      logger.info('Admin password updated successfully!', { user: result.rows[0] });

      // Test the new password
      const testMatch = await bcrypt.compare(plainPassword, hashedPassword);
      logger.info('Password verification test:', { success: testMatch });
    } else {
      logger.error('Failed to update admin password for an unknown reason.');
    }
  } catch (err) {
    logger.error('Error updating admin password:', { error: err.message, stack: err.stack });
  } finally {
    await client.release();
    await pool.end();
  }
};

updateAdminPassword();