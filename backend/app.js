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
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const { uploadDir, created } = ensureDirectories();
  created.forEach((dir) => logger.info(`Ensured directory ${dir}`));

  const app = express();
  app.use(cors());
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

  app.get('/', (req, res) => {
    res.send('GEO SaaS Platform Backend is running!');
  });

  // 健康检查端点
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'geo-backend'
    });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
