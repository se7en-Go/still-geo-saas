const express = require('express');
const cors = require('cors');
const path = require('path');
const { ensureDirectories } = require('./config');
const logger = require('./logger');

const authRoutes = require('./routes/auth');
const keywordRoutes = require('./routes/keywords');
const documentRoutes = require('./routes/documents');
const imageRoutes = require('./routes/images');
const imageCollectionRoutes = require('./routes/imageCollections');
const ruleRoutes = require('./routes/rules');
const contentRoutes = require('./routes/content');
const knowledgeSetRoutes = require('./routes/knowledgeSets');
const geoRoutes = require('./routes/geo');
const { router: healthRoutes } = require('./routes/health');
const queueStatusRoutes = require('./routes/queue-status');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const { uploadDir, created } = ensureDirectories();
  created.forEach((dir) => logger.info(`Ensured directory ${dir}`));

  const app = express();

  // CORS配置 - 支持多域名和动态配置
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://geo-optimization-frontend-bvmg40kfj-se7en7788s-projects.vercel.app',  // 当前Vercel生产域名
        'https://still-geo.gocdn.dpdns.org',  // 自定义域名
        /\.vercel\.app$/,  // 支持所有Vercel子域名
        // 可以通过环境变量添加更多域名
        ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : [])
      ]
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];  // 开发环境域名

  const corsOptions = {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-auth-token', 'Authorization'],
    exposedHeaders: ['x-auth-token'],
  };

  // 开发环境下输出CORS配置
  if (process.env.NODE_ENV !== 'production') {
    logger.info('CORS Origins:', corsOrigins);
  }

  app.use(cors(corsOptions));

  app.use(express.json());
  app.use('/uploads', express.static(path.resolve(uploadDir)));

  // 简化的健康检查端点 - 用于Render部署验证
  // 必须在其他路由之前注册，确保快速响应
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      service: 'geo-backend-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  app.get('/', (req, res) => {
    res.send('GEO SaaS Platform Backend is running!');
  });

  // 其他API路由（安全加载，避免启动失败）
  const routes = [
    { path: '/api/auth', handler: authRoutes, name: 'auth' },
    { path: '/api/keywords', handler: keywordRoutes, name: 'keywords' },
    { path: '/api/documents', handler: documentRoutes, name: 'documents' },
    { path: '/api/images', handler: imageRoutes, name: 'images' },
    { path: '/api/image-collections', handler: imageCollectionRoutes, name: 'imageCollections' },
    { path: '/api/rules', handler: ruleRoutes, name: 'rules' },
    { path: '/api/content', handler: contentRoutes, name: 'content' },
    { path: '/api/knowledge-sets', handler: knowledgeSetRoutes, name: 'knowledgeSets' },
    { path: '/api/geo', handler: geoRoutes, name: 'geo' },
    { path: '/api/health-detailed', handler: healthRoutes, name: 'health-detailed' },
    { path: '/api/queue', handler: queueStatusRoutes, name: 'queue-status' }
  ];

  routes.forEach(route => {
    try {
      app.use(route.path, route.handler);
    } catch (error) {
      logger.warn(`Failed to load ${route.name} routes: ${error.message}`);
      // 为失败的路由创建一个简单的错误响应
      app.use(route.path, (req, res) => {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          service: route.name,
          message: `${route.name} service is currently down for maintenance`
        });
      });
    }
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
