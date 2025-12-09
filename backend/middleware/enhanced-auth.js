const jwt = require('jsonwebtoken');
const { config } = require('../config');
const AppError = require('../utils/appError');
const logger = require('../logger');

/**
 * Enhanced JWT Authentication Middleware with Security Hardening
 */

// Token format validation
const validateJWTFormat = (token) => {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // Check token length (JWT tokens are typically 100-500 characters)
  if (token.length < 50 || token.length > 1000) {
    return false;
  }

  // Check token format: 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // Check each part is valid Base64URL and has reasonable content
  return parts.every((part, index) => {
    try {
      const decoded = Buffer.from(part, 'base64url');
      if (decoded.length === 0) return false;

      // Additional structural checks
      if (index === 0) { // Header
        const header = JSON.parse(decoded.toString());
        return header && header.alg && header.typ;
      }
      if (index === 1) { // Payload
        const payload = JSON.parse(decoded.toString());
        return payload && payload.user && payload.user.id;
      }
      return true; // Signature (part 2) - just check it's non-empty
    } catch (err) {
      return false;
    }
  });
};

// Detect suspicious token patterns
const detectSuspiciousToken = (token, req) => {
  const suspiciousPatterns = [
    /^test_/i,           // test tokens
    /^invalid_/i,        // explicitly invalid tokens
    /^fake_/i,           // fake tokens
    /^demo_/i,           // demo tokens
    /^[a-zA-Z0-9]{10,20}$/, // short alphanumeric strings
    /^Bearer\s+/i        // Bearer prefix included in token
  ];

  return suspiciousPatterns.some(pattern => pattern.test(token)) ||
         token.length < 30 ||
         !token.includes('.');
};

// Rate limiting for failed auth attempts
const authFailureCache = new Map();

const checkAuthRateLimit = (req) => {
  const key = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10;

  if (!authFailureCache.has(key)) {
    authFailureCache.set(key, { count: 0, resetTime: now + windowMs });
  }

  const attempts = authFailureCache.get(key);

  if (now > attempts.resetTime) {
    attempts.count = 0;
    attempts.resetTime = now + windowMs;
  }

  attempts.count++;

  if (attempts.count > maxAttempts) {
    return false; // Rate limited
  }

  return true;
};

// Enhanced authentication middleware
const auth = async (req, _res, next) => {
  const token = req.header('x-auth-token');

  if (!token) {
    return next(new AppError('No token, authorization denied.', 401));
  }

  // Enhanced format validation
  if (!validateJWTFormat(token)) {
    const isSuspicious = detectSuspiciousToken(token, req);

    logger.warn('Invalid token format detected', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10) + '...',
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      suspicious: isSuspicious,
      timestamp: new Date().toISOString()
    });

    // Rate limit suspicious attempts
    if (isSuspicious && !checkAuthRateLimit(req)) {
      logger.warn('Authentication rate limit exceeded', { ip: req.ip });
      return next(new AppError('Too many authentication attempts. Please try again later.', 429));
    }

    return next(new AppError('Invalid token format.', 401));
  }

  try {
    // JWT verification with detailed error handling
    const decoded = jwt.verify(token, config.auth.jwtSecret);

    // Verify user data structure
    if (!decoded.user || !decoded.user.id) {
      return next(new AppError('Invalid token structure.', 401));
    }

    // Check token age for additional security
    const now = Math.floor(Date.now() / 1000);
    const tokenAge = now - decoded.iat;
    const maxAge = 24 * 60 * 60; // 24 hours

    if (tokenAge > maxAge) {
      logger.warn('Token age exceeds maximum allowed', {
        tokenAge,
        maxAge,
        userId: decoded.user.id,
        ip: req.ip
      });
      return next(new AppError('Token has expired.', 401));
    }

    req.user = decoded.user;
    req.tokenIssuedAt = decoded.iat;

    next();
  } catch (err) {
    // Enhanced error logging for security monitoring
    const errorInfo = {
      message: err.message,
      name: err.name,
      expiredAt: err.expiredAt,
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 10) + '...',
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };

    logger.error('JWT Verification Error', errorInfo);

    // Rate limiting on failed verification
    checkAuthRateLimit(req);

    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired.', 401));
    } else if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token.', 401));
    } else if (err.name === 'NotBeforeError') {
      return next(new AppError('Token not active.', 401));
    } else {
      return next(new AppError('Token verification failed.', 401));
    }
  }
};

// Enhanced role-based access control
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Unauthorized', 401));
  }
  if (!roles.includes(req.user.role)) {
    logger.warn('Insufficient permissions attempted', {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRoles: roles,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    return next(new AppError('Forbidden', 403));
  }
  return next;
};

// Token cleanup utility
const cleanupInvalidTokens = (tokens) => {
  return tokens.filter(token => validateJWTFormat(token));
};

// Security monitoring middleware
const securityMonitor = (req, _res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
};

module.exports = {
  auth,
  requireRole,
  validateJWTFormat,
  cleanupInvalidTokens,
  securityMonitor
};