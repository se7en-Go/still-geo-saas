const jwt = require('jsonwebtoken');
const { config } = require('../config');
const AppError = require('../utils/appError');

const auth = (req, _res, next) => {
  const token = req.header('x-auth-token');

  if (!token) {
    return next(new AppError('No token, authorization denied.', 401));
  }

  try {
    // 增强JWT验证错误处理
    const decoded = jwt.verify(token, config.auth.jwtSecret);

    // 验证用户数据结构
    if (!decoded.user || !decoded.user.id) {
      return next(new AppError('Invalid token structure.', 401));
    }

    req.user = decoded.user;
    next();
  } catch (err) {
    // 提供更详细的错误信息用于调试
    console.error('JWT Verification Error:', {
      message: err.message,
      name: err.name,
      expiredAt: err.expiredAt,
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 20) + '...'
    });

    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired.', 401));
    } else if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token format.', 401));
    } else {
      return next(new AppError('Token is not valid.', 401));
    }
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
