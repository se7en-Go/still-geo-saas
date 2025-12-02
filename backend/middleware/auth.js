const jwt = require('jsonwebtoken');
const { config } = require('../config');
const AppError = require('../utils/appError');

const auth = (req, _res, next) => {
  const token = req.header('x-auth-token');

  if (!token) {
    return next(new AppError('No token, authorization denied.', 401));
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded.user;
    next();
  } catch (err) {
    return next(new AppError('Token is not valid.', 401));
  }
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Unauthorized', 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(new AppError('Forbidden', 403));
  }
  return next();
};

module.exports = { auth, requireRole };
