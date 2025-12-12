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

  app.use('/api/auth', authRoutes);
  app.use('/api/keywords', keywordRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/image-collections', imageCollectionRoutes);
  app.use('/api/rules', ruleRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/knowledge-sets', knowledgeSetRoutes);
  app.use('/api/geo', geoRoutes);
  app.use('/api/health', healthRoutes);

  app.get('/', (req, res) => {
    res.send('GEO SaaS Platform Backend is running!');
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
