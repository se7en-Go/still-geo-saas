const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get overall GEO statistics
router.get('/stats', auth, async (req, res) => {
  // TODO: Replace with real data fetching and aggregation
  const mockStats = {
    totalKeywords: 120,
    totalDocuments: 50,
    totalImages: 80,
    generatedContentCount: 35,
    totalIncluded: 28,
  };
  res.json(mockStats);
});

// Get hot keywords
router.get('/hot-keywords', auth, async (req, res) => {
  // TODO: Replace with real data fetching and aggregation
  const mockHotKeywords = [
    { keyword: 'GEO Optimization', score: 95 },
    { keyword: 'AI Content Strategy', score: 88 },
    { keyword: 'Long-tail Keywords', score: 82 },
  ];
  res.json(mockHotKeywords);
});

// Get content inclusion distribution
router.get('/inclusion-distribution', auth, async (req, res) => {
  // TODO: Replace with real data fetching and aggregation
  const mockDistribution = [
    { platform: '豆包', count: 10 },
    { platform: '通义', count: 8 },
    { platform: '元宝', count: 5 },
    { platform: 'Kimi', count: 3 },
    { platform: '其他', count: 2 },
  ];
  res.json(mockDistribution);
});

module.exports = router;