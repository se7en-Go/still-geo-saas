const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { validate, authSchemas } = require('../validation');
const { auth, requireRole } = require('../middleware/auth');
const { config } = require('../config');
const AppError = require('../utils/appError');
const logger = require('../logger');

const router = express.Router();

// Register a new user (typically disabled in production)
router.post('/register', validate(authSchemas.register), async (req, res, next) => {
  if (!config.auth.allowRegistration) {
    logger.warn('Registration attempt blocked while registration is disabled', {
      email: req.body?.email,
    });
    return next(new AppError('Registration is disabled. Please contact the administrator.', 403));
  }

  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO public.users (username, email, password, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, role`,
        [username, email, hashedPassword, 'user']
      );
      return created.rows[0];
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.code === '23505') {
      return next(new AppError('User with this username or email already exists.', 400));
    }
    return next(err);
  }
});

// Admin creates a new user (registration closed for regular users)
router.post(
  '/admin/users',
  auth,
  requireRole('admin'),
  validate(authSchemas.adminCreateUser),
  async (req, res, next) => {
    const { username, email, password, role } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const created = await db.withTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO public.users (username, email, password, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, username, email, role`,
          [username, email, hashedPassword, role]
        );
        return result.rows[0];
      });

      res.status(201).json(created);
    } catch (err) {
      if (err.code === '23505') {
        return next(new AppError('User with this username or email already exists.', 400));
      }
      return next(err);
    }
  }
);

router.get(
  '/admin/users',
  auth,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      const result = await db.query(
        'SELECT id, username, email, role, created_at FROM public.users ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  }
);

// Login a user
router.post('/login', validate(authSchemas.login), async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const userResult = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return next(new AppError('Invalid credentials.', 401));
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return next(new AppError('Invalid credentials.', 401));
    }

    const payload = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };

    const token = jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiry,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', auth, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, role, created_at FROM public.users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return next(new AppError('User not found.', 404));
    }
    res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});


// Delete a user
router.delete(
  '/admin/users/:id',
  auth,
  requireRole('admin'),
  async (req, res, next) => {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.id === parseInt(id, 10)) {
      return next(new AppError('Admins cannot delete their own accounts.', 400));
    }

    try {
      const result = await db.withTransaction(async (client) => {
        const deleted = await client.query('DELETE FROM public.users WHERE id = $1 RETURNING id', [id]);
        return deleted;
      });

      if (result.rows.length === 0) {
        return next(new AppError('User not found.', 404));
      }

      res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

// Reset a user's password
router.put(
  '/admin/users/:id/reset-password',
  auth,
  requireRole('admin'),
  validate(authSchemas.resetPassword),
  async (req, res, next) => {
    const { id } = req.params;
    const { password } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.withTransaction(async (client) => {
        const updated = await client.query(
          'UPDATE public.users SET password = $1 WHERE id = $2 RETURNING id',
          [hashedPassword, id]
        );
        return updated;
      });

      if (result.rows.length === 0) {
        return next(new AppError('User not found.', 404));
      }

      res.json({ message: 'Password has been reset successfully.' });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
