const express = require('express');
const axios = require('axios');
const db = require('../db');
const { validate, keywordSchemas, keywordSchemaMetadataSchemas } = require('../validation');
const { auth } = require('../middleware/auth');
const { config } = require('../config');
const AppError = require('../utils/appError');
const logger = require('../logger');
const SimpleCache = require('../utils/simpleCache');
const QueryProfiler = require('../utils/queryProfiler');

const router = express.Router();

const VARIATION_TARGET_COUNT = 12;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const KEYWORD_EXPORT_LIMIT = 5000;

const SORT_FIELDS = new Set(['created_at', 'base_keyword', 'variation_count']);
const SORT_ORDERS = new Set(['asc', 'desc']);
const VARIATION_FILTERS = new Set(['all', 'with', 'without']);

const keywordListCache = new SimpleCache({
  ttlMs: config.cache?.keywords?.ttlMs || 60000,
  maxEntries: config.cache?.keywords?.maxEntries || 200,
});
const keywordListProfiler = new QueryProfiler(200);

const buildCacheKey = (userId, page, pageSize, search, sortField, sortOrder, variationFilter) =>
  `list:${userId}:${page}:${pageSize}:${search || ''}:${sortField}:${sortOrder}:${variationFilter}`;

const cachePrefixForUser = (userId) => `list:${userId}:`;

function invalidateKeywordCache(userId) {
  keywordListCache.deleteByPrefix(cachePrefixForUser(userId));
}

function resolveChatPath(pathFragment) {
  if (!pathFragment) {
    return '/chat/completions';
  }
  return pathFragment.startsWith('/') ? pathFragment : `/${pathFragment}`;
}

function buildAiClient() {
  return axios.create({
    baseURL: config.ai.baseUrl,
    headers: (() => {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (config.ai.provider === 'gemini') {
        headers['x-goog-api-key'] = config.ai.apiKey || '';
      } else {
        headers.Authorization = `Bearer ${config.ai.apiKey || ''}`;
      }
      return headers;
    })(),
    params: config.ai.provider === 'gemini' ? { key: config.ai.apiKey } : undefined,
    timeout: config.ai.requestTimeoutMs,
  });
}

async function requestJsonFromAi(systemInstruction, userPrompt) {
  const aiClient = buildAiClient();
  const isGemini = config.ai.provider === 'gemini';
  const payload = isGemini
    ? {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\n\n${userPrompt}`,
              },
            ],
          },
        ],
        generation_config: config.ai.useResponseFormat
          ? {
              response_mime_type: 'application/json',
            }
          : undefined,
      }
    : {
        model: config.ai.chatModel,
        messages: [
          {
            role: 'system',
            content: systemInstruction,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      };

  if (!isGemini && config.ai.useResponseFormat) {
    payload.response_format = { type: 'json_object' };
  }

  const aiResponse = await aiClient.post(resolveChatPath(config.ai.chatPath), payload);
  const message = extractMessagePayload(aiResponse?.data);
  const sanitized = normalizeJsonContent(message);
  if (!sanitized) {
    throw new Error('AI response was empty');
  }
  return JSON.parse(sanitized);
}

function extractMessagePayload(data) {
  if (typeof data?.content === 'string' && data.content.trim()) {
    return data.content;
  }
  if (typeof data?.result === 'string' && data.result.trim()) {
    return data.result;
  }
  if (typeof data?.text === 'string' && data.text.trim()) {
    return data.text;
  }
  const openAiStyle = data?.choices?.[0]?.message?.content;
  if (typeof openAiStyle === 'string' && openAiStyle.trim()) {
    return openAiStyle;
  }

  if (Array.isArray(data?.candidates)) {
    const concatenated = data.candidates
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (concatenated) {
      return concatenated;
    }
  }

  return null;
}

function normalizeJsonContent(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  let content = raw.trim();
  if (!content) {
    return null;
  }

  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    content = fenceMatch[1].trim();
  }

  if (content.startsWith('{') || content.startsWith('[')) {
    return content;
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }

  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return content.slice(firstBracket, lastBracket + 1).trim();
  }

  return content;
}

function truncateForPrompt(payload, maxLength = 1500) {
  if (payload === null || payload === undefined) {
    return '';
  }
  let serialized;
  if (typeof payload === 'string') {
    serialized = payload;
  } else {
    try {
      serialized = JSON.stringify(payload);
    } catch (_err) {
      serialized = String(payload);
    }
  }
  if (serialized.length <= maxLength) {
    return serialized;
  }
  return `${serialized.slice(0, maxLength)}...`;
}

function describeProductContext(productContext = {}) {
  const parts = [];
  if (productContext.productBrand) {
    parts.push(`品牌：${productContext.productBrand}`);
  }
  if (productContext.productSku) {
    parts.push(`SKU：${productContext.productSku}`);
  }
  if (productContext.productUrl) {
    parts.push(`链接：${productContext.productUrl}`);
  }
  return parts.join(' | ');
}

function buildKeywordSchemaFallback({ keyword, variations, hint, productContext }) {
  const relatedFaq = variations.slice(0, 3).map((variation) => ({
    question: variation.name,
    answer: `围绕「${variation.name}」给出产品亮点、适用场景与差异化卖点。`,
  }));

  return {
    base_keyword: keyword.base_keyword,
    search_intent: `用户希望了解${keyword.base_keyword}的产品卖点、真实体验与购买决策要点。`,
    user_persona: [
      '准备购买同类产品、需要快速对比差异的潜在买家',
      '正在使用竞品、希望升级或换新的用户',
      '负责内容/营销的运营同学，需补全结构化 Schema 数据',
    ],
    recommended_sections: [
      { title: '核心亮点', fields: ['产品定位', '目标人群', '独特卖点'] },
      { title: '功能体验', fields: ['使用场景', '性能指标', '与竞品对比'] },
      { title: '购买决策', fields: ['适配套餐/版本', '价格区间', '赠品/服务政策'] },
    ],
    structured_data_hints: {
      product: {
        brand: productContext?.productBrand || '待确认',
        sku: productContext?.productSku || '待确认',
        url: productContext?.productUrl || '待补充',
      },
      recommended_schema_types: ['Product', 'FAQPage', 'HowTo'],
      notes: hint || '可根据长尾词进一步细化字段。',
    },
    faq: relatedFaq,
    fallback: true,
  };
}

function buildVariationSchemaFallback({ keyword, variation, hint, productContext }) {
  const brandSnippet = productContext?.productBrand
    ? `品牌重点：${productContext.productBrand}；`
    : '';
  return {
    target_keyword: variation.name,
    search_intent: `用户围绕「${variation.name}」希望确认真实体验、适配场景及优惠信息。`,
    intent: ['了解具体功能/规格', '确认是否适合自身场景', '寻找优惠或套装方案'],
    persona: [
      '对产品有初步认知，准备进一步研究的买家',
      '关注品牌/口碑的老用户',
      '需要整理内容大纲的内容运营人员',
    ],
    recommended_sections: [
      {
        title: '需求痛点',
        bullets: ['当前痛点/触发场景', '解决方案简介', '适用人群'],
      },
      {
        title: '功能亮点',
        bullets: ['核心规格', '真实体验/案例', '与竞品差异'],
      },
      {
        title: '购买建议',
        bullets: ['价格/优惠', '适配套餐', '售后与保障'],
      },
    ],
    question_answer_pairs: [
      {
        question: `为什么选择${variation.name}？`,
        answer: `${brandSnippet}突出与基础关键词「${keyword.base_keyword}」的差异化价值，覆盖购买场景。`,
      },
      {
        question: `${variation.name}是否适合我？`,
        answer: '结合目标用户画像，说明适配人群、限制条件与建议。',
      },
      {
        question: `${variation.name} 有哪些优惠/套装？`,
        answer: '如无真实信息，可提示到官方渠道获取，保持描述客观。',
      },
    ],
    structured_data_hints: {
      productUrl: productContext?.productUrl || '待补充',
      brand: productContext?.productBrand || '待确认',
      sku: productContext?.productSku || '待确认',
      recommended_schema_types: ['FAQPage', 'Product', 'Article'],
      notes: hint || '可补充更多问答或意图字段。',
    },
    fallback: true,
  };
}

function coerceNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.round(parsed);
}

function buildVariationList(parsed, baseKeyword) {
  let rawList = [];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (Array.isArray(parsed?.keywords)) {
    rawList = parsed.keywords;
  } else if (Array.isArray(parsed?.data)) {
    rawList = parsed.data;
  } else if (Array.isArray(parsed?.items)) {
    rawList = parsed.items;
  }

  const seen = new Set();
  const cleaned = [];

  rawList.forEach((entry) => {
    let name;
    let monthlySearchVolume = null;
    let weight = null;

    if (typeof entry === 'string') {
      name = entry;
    } else if (entry && typeof entry === 'object') {
      name =
        entry.name ||
        entry.keyword ||
        entry.term ||
        entry.title ||
        entry.phrase ||
        entry.long_tail_keyword;
      monthlySearchVolume = coerceNumber(
        entry.monthly_search_volume ??
          entry.search_volume ??
          entry.searchVolume ??
          entry.volume
      );
      weight = coerceNumber(entry.weight ?? entry.score ?? entry.priority);
    }

    if (!name || typeof name !== 'string') {
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized === baseKeyword.toLowerCase()) {
      return;
    }
    if (seen.has(normalized)) {
      return;
    }

    cleaned.push({
      name: trimmed,
      monthly_search_volume: monthlySearchVolume,
      weight,
    });
    seen.add(normalized);
  });

  const limited = cleaned.slice(0, VARIATION_TARGET_COUNT);
  limited.forEach((item, index) => {
    if (item.monthly_search_volume === null) {
      item.monthly_search_volume = Math.max(20, 120 - index * 5);
    }
    if (item.weight === null) {
      item.weight = Math.max(20, 100 - index * 3);
    }
  });
  return limited;
}

function normalizeVariationPayload(rawVariations = []) {
  if (!Array.isArray(rawVariations)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];

  rawVariations.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      return;
    }
    const lower = name.toLowerCase();
    if (seen.has(lower)) {
      return;
    }
    const monthly = entry.monthly_search_volume ?? entry.search_volume ?? entry.volume ?? null;
    const weightValue = entry.weight ?? entry.score ?? null;
    const monthlyValue = coerceNumber(monthly, null);
    const weight = coerceNumber(weightValue, null);
    normalized.push({
      name,
      monthly_search_volume: monthlyValue !== null ? Math.max(0, monthlyValue) : null,
      weight: weight !== null ? Math.max(0, Math.min(100, weight)) : null,
    });
    seen.add(lower);
  });

  return normalized;
}

async function refreshLongTailKeywords(executor, keywordId) {
  await executor.query(
    `UPDATE public.keywords
     SET long_tail_keywords = (
       SELECT ARRAY(
         SELECT name FROM public.keyword_variations
         WHERE keyword_id = $1
         ORDER BY created_at DESC, id DESC
       )
     )
     WHERE id = $1`,
    [keywordId]
  );
}

async function replaceKeywordVariations(executor, keywordId, variations) {
  await executor.query('DELETE FROM public.keyword_variations WHERE keyword_id = $1', [keywordId]);
  if (Array.isArray(variations) && variations.length) {
    // eslint-disable-next-line no-restricted-syntax
    for (const variation of variations) {
      // eslint-disable-next-line no-await-in-loop
      await executor.query(
        `INSERT INTO public.keyword_variations (keyword_id, name, monthly_search_volume, weight)
         VALUES ($1, $2, $3, $4)`,
        [keywordId, variation.name, variation.monthly_search_volume, variation.weight]
      );
    }
  }
  await refreshLongTailKeywords(executor, keywordId);
}

function parsePage(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function parsePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseSortField(value) {
  if (typeof value !== 'string') {
    return 'created_at';
  }
  const normalized = value.toLowerCase();
  return SORT_FIELDS.has(normalized) ? normalized : 'created_at';
}

function parseSortOrder(value) {
  if (typeof value !== 'string') {
    return 'desc';
  }
  const normalized = value.toLowerCase();
  return SORT_ORDERS.has(normalized) ? normalized : 'desc';
}

function parseVariationFilter(value) {
  if (typeof value !== 'string') {
    return 'all';
  }
  const normalized = value.toLowerCase();
  return VARIATION_FILTERS.has(normalized) ? normalized : 'all';
}

function recordQuerySample(label, startTime, metadata = {}) {
  try {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1e6;
    keywordListProfiler.record(durationMs, { label, ...metadata });
  } catch (err) {
    logger.debug('Failed to record query sample', { error: err.message, label });
  }
}

async function fetchKeywordCollections(
  userId,
  { page, pageSize, search, sortField, sortOrder, variationFilter, all = false }
) {
  const filters = ['k.user_id = $1'];
  const values = [userId];

  if (search) {
    values.push(`%${search}%`);
    filters.push(`k.base_keyword ILIKE $${values.length}`);
  }

  const countFilters = [...filters];
  if (variationFilter === 'with') {
    countFilters.push(
      'EXISTS (SELECT 1 FROM public.keyword_variations kv WHERE kv.keyword_id = k.id)'
    );
  } else if (variationFilter === 'without') {
    countFilters.push(
      'NOT EXISTS (SELECT 1 FROM public.keyword_variations kv WHERE kv.keyword_id = k.id)'
    );
  }

  const countClause = countFilters.join(' AND ') || 'TRUE';
  const countStart = process.hrtime.bigint();
  const countRes = await db.query(
    `SELECT COUNT(*) FROM public.keywords k WHERE ${countClause}`,
    values
  );
  recordQuerySample('count', countStart, { userId, search, variationFilter });

  const total = Number(countRes.rows[0]?.count || 0);
  if (total === 0) {
    return { items: [], total };
  }

  const baseOrderColumn =
    sortField === 'base_keyword'
      ? 'k.base_keyword'
      : sortField === 'variation_count'
      ? 'COALESCE(vc.variation_count, 0)'
      : 'k.created_at';
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const orderClause = `${baseOrderColumn} ${direction}, k.id DESC`;

  let variationFilterClause = '';
  if (variationFilter === 'with') {
    variationFilterClause = 'AND COALESCE(vc.variation_count, 0) > 0';
  } else if (variationFilter === 'without') {
    variationFilterClause = 'AND COALESCE(vc.variation_count, 0) = 0';
  }

  const whereClause = filters.join(' AND ') || 'TRUE';
  let limitClause = '';
  const listValues = [...values];
  if (all) {
    const limitIndex = listValues.length + 1;
    limitClause = `LIMIT $${limitIndex}`;
    listValues.push(pageSize);
  } else {
    const offset = (page - 1) * pageSize;
    const limitIndex = listValues.length + 1;
    const offsetIndex = listValues.length + 2;
    limitClause = `LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
    listValues.push(pageSize, offset);
  }

  const listStart = process.hrtime.bigint();
  const listRes = await db.query(
    `
      SELECT
        k.id,
        k.user_id,
        k.base_keyword,
        k.long_tail_keywords,
        k.schema_metadata,
        k.created_at,
        COALESCE(vc.variation_count, 0) AS variation_count
      FROM public.keywords k
      LEFT JOIN (
        SELECT keyword_id, COUNT(*)::int AS variation_count
        FROM public.keyword_variations
        GROUP BY keyword_id
      ) vc ON vc.keyword_id = k.id
      WHERE ${whereClause}
      ${variationFilterClause}
      ORDER BY ${orderClause}
      ${limitClause}
    `,
    listValues
  );
  recordQuerySample('list', listStart, {
    userId,
    page,
    pageSize,
    search,
    variationFilter,
    sortField,
    sortOrder,
  });

  const keywordRows = listRes.rows;
  if (keywordRows.length === 0) {
    return { items: [], total };
  }

  const keywordIds = keywordRows.map((row) => Number(row.id));
  const variationsStart = process.hrtime.bigint();
  const variationPlaceholders = keywordIds.map((_, index) => `$${index + 1}`).join(', ');
  const variationsRes = await db.query(
    `SELECT id, keyword_id, name, monthly_search_volume, weight, schema_metadata, created_at
     FROM public.keyword_variations
     WHERE keyword_id IN (${variationPlaceholders})
     ORDER BY created_at DESC, id DESC`,
    keywordIds
  );
  recordQuerySample('variations', variationsStart, { userId, count: variationsRes.rowCount });

  const variationMap = new Map();
  variationsRes.rows.forEach((variation) => {
    const formatted = {
      ...variation,
      monthly_search_volume:
        variation.monthly_search_volume !== null ? Number(variation.monthly_search_volume) : null,
      weight: variation.weight !== null ? Number(variation.weight) : null,
      schema_metadata: variation.schema_metadata || null,
    };

    if (!variationMap.has(variation.keyword_id)) {
      variationMap.set(variation.keyword_id, []);
    }
    variationMap.get(variation.keyword_id).push(formatted);
  });

  const items = keywordRows.map((keyword) => {
    const variations = variationMap.get(keyword.id) || [];
    const derivedLongTail =
      variations.length > 0 ? variations.map((variation) => variation.name) : keyword.long_tail_keywords;

    return {
      ...keyword,
      schema_metadata: keyword.schema_metadata || null,
      variation_count: Number(keyword.variation_count) || 0,
      long_tail_keywords: derivedLongTail,
      variations,
    };
  });

  return { items, total };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.pageSize);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const sortField = parseSortField(req.query.sortField);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const variationFilter = parseVariationFilter(req.query.variationFilter);

    const cacheKey = buildCacheKey(
      req.user.id,
      page,
      pageSize,
      search,
      sortField,
      sortOrder,
      variationFilter
    );

    const cached = keywordListCache.get(cacheKey);
    if (cached) {
      res.set('X-Keywords-Cache', 'HIT');
      return res.json(cached);
    }

    let collections = await fetchKeywordCollections(req.user.id, {
      page,
      pageSize,
      search,
      sortField,
      sortOrder,
      variationFilter,
    });

    if (collections.items.length === 0 && collections.total > 0 && page > 1) {
      const lastPage = Math.max(1, Math.ceil(collections.total / pageSize));
      collections = await fetchKeywordCollections(req.user.id, {
        page: lastPage,
        pageSize,
        search,
        sortField,
        sortOrder,
        variationFilter,
      });

      const fallbackPayload = {
        page: lastPage,
        pageSize,
        total: collections.total,
        items: collections.items,
      };
      keywordListCache.set(
        buildCacheKey(
          req.user.id,
          lastPage,
          pageSize,
          search,
          sortField,
          sortOrder,
          variationFilter
        ),
        fallbackPayload
      );
      res.set('X-Keywords-Cache', 'MISS');
      return res.json(fallbackPayload);
    }

    const payload = {
      page,
      pageSize,
      total: collections.total,
      items: collections.items,
    };
    keywordListCache.set(cacheKey, payload);
    res.set('X-Keywords-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/metrics', auth, (req, res) => {
  res.json({
    cache: keywordListCache.getStats(),
    profiler: keywordListProfiler.getSummary(),
  });
});

router.get('/export', auth, async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const sortField = parseSortField(req.query.sortField);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const variationFilter = parseVariationFilter(req.query.variationFilter);
    const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'json';
    const exportFormat = format === 'csv' ? 'csv' : 'json';

    const collections = await fetchKeywordCollections(req.user.id, {
      page: 1,
      pageSize: KEYWORD_EXPORT_LIMIT,
      search,
      sortField,
      sortOrder,
      variationFilter,
      all: true,
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      total: collections.total,
      limit: KEYWORD_EXPORT_LIMIT,
      truncated: collections.total > KEYWORD_EXPORT_LIMIT,
      items: collections.items,
    };

    if (exportFormat === 'csv') {
      const rows = ['base_keyword,variation_name,monthly_search_volume,weight'];
      payload.items.forEach((item) => {
        if (!item.variations.length) {
          rows.push(`"${item.base_keyword.replace(/"/g, '""')}",,,`);
          return;
        }
        item.variations.forEach((variation) => {
          rows.push(
            [
              `"${item.base_keyword.replace(/"/g, '""')}"`,
              `"${variation.name.replace(/"/g, '""')}"`,
              variation.monthly_search_volume ?? '',
              variation.weight ?? '',
            ].join(',')
          );
        });
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="keywords-${Date.now()}.csv"`
      );
      const csvContent = `\ufeff${rows.join('\r\n')}`;
      return res.send(csvContent);
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/bulk/import',
  auth,
  validate(keywordSchemas.bulkImport),
  async (req, res, next) => {
    const { keywords, overrideExisting } = req.body;
    const summary = { imported: 0, updated: 0, skipped: 0, variations: 0, processed: keywords.length };

    try {
      await db.withTransaction(async (client) => {
        // eslint-disable-next-line no-restricted-syntax
        for (const entry of keywords) {
          const baseKeyword = entry.base_keyword.trim();
          const normalizedVariations = normalizeVariationPayload(entry.variations);

          // eslint-disable-next-line no-await-in-loop
          const existing = await client.query(
            'SELECT id FROM public.keywords WHERE user_id = $1 AND LOWER(base_keyword) = LOWER($2)',
            [req.user.id, baseKeyword]
          );

          if (existing.rowCount > 0) {
            const keywordId = existing.rows[0].id;
            if (!overrideExisting) {
              summary.skipped += 1;
              // eslint-disable-next-line no-continue
              continue;
            }
            summary.updated += 1;
            // eslint-disable-next-line no-await-in-loop
            await client.query(
              'UPDATE public.keywords SET base_keyword = $1 WHERE id = $2',
              [baseKeyword, keywordId]
            );
            // eslint-disable-next-line no-await-in-loop
            await replaceKeywordVariations(client, keywordId, normalizedVariations);
            summary.variations += normalizedVariations.length;
          } else {
            // eslint-disable-next-line no-await-in-loop
            const inserted = await client.query(
              'INSERT INTO public.keywords (user_id, base_keyword) VALUES ($1, $2) RETURNING id',
              [req.user.id, baseKeyword]
            );
            const keywordId = inserted.rows[0].id;
            summary.imported += 1;
            if (normalizedVariations.length) {
              // eslint-disable-next-line no-await-in-loop
              await replaceKeywordVariations(client, keywordId, normalizedVariations);
              summary.variations += normalizedVariations.length;
            }
          }
        }
      });

      invalidateKeywordCache(req.user.id);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/', auth, validate(keywordSchemas.addKeyword), async (req, res, next) => {
  const { base_keyword } = req.body;

  try {
    const existing = await db.query(
      'SELECT id FROM public.keywords WHERE user_id = $1 AND LOWER(base_keyword) = LOWER($2)',
      [req.user.id, base_keyword]
    );
    if (existing.rowCount > 0) {
      return next(new AppError('该关键词已存在，请勿重复添加。', 409));
    }

    const newKeyword = await db.query(
      'INSERT INTO public.keywords (user_id, base_keyword) VALUES ($1, $2) RETURNING id, user_id, base_keyword, long_tail_keywords, created_at',
      [req.user.id, base_keyword.trim()]
    );
    const created = newKeyword.rows[0];
    invalidateKeywordCache(req.user.id);
    res.status(201).json({ ...created, variations: [] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM public.keywords WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return next(new AppError('未找到指定的关键词。', 404));
    }

    invalidateKeywordCache(req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.delete('/:keywordId/variations/:variationId', auth, async (req, res, next) => {
  const { keywordId, variationId } = req.params;

  try {
    const ownershipCheck = await db.query(
      'SELECT 1 FROM public.keywords WHERE id = $1 AND user_id = $2',
      [keywordId, req.user.id]
    );
    if (ownershipCheck.rowCount === 0) {
      return next(new AppError('未找到指定的关键词。', 404));
    }

    const deleted = await db.query(
      'DELETE FROM public.keyword_variations WHERE id = $1 AND keyword_id = $2 RETURNING id',
      [variationId, keywordId]
    );

    if (deleted.rowCount === 0) {
      return next(new AppError('未找到指定的长尾词。', 404));
    }

    await refreshLongTailKeywords(db, keywordId);
    invalidateKeywordCache(req.user.id);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:keywordId/variations/bulk',
  auth,
  validate(keywordSchemas.bulkUpdateVariations),
  async (req, res, next) => {
    const { keywordId } = req.params;
    const { variationIds, monthly_search_volume, weight } = req.body;

    try {
      const ownership = await db.query(
        'SELECT 1 FROM public.keywords WHERE id = $1 AND user_id = $2',
        [keywordId, req.user.id]
      );
      if (ownership.rowCount === 0) {
        return next(new AppError('未找到指定的关键词。', 404));
      }

      const updates = [];
      const values = [];
      let index = 1;

      if (monthly_search_volume !== undefined) {
        updates.push(`monthly_search_volume = $${index}`);
        values.push(monthly_search_volume);
        index += 1;
      }
      if (weight !== undefined) {
        updates.push(`weight = $${index}`);
        values.push(weight);
        index += 1;
      }

      const variationStartIndex = index;
      const variationPlaceholders = variationIds
        .map((_, idx) => `$${variationStartIndex + idx}`)
        .join(', ');
      values.push(...variationIds);
      index += variationIds.length;

      values.push(keywordId);
      const keywordIndex = index;

      const updateRes = await db.query(
        `
          UPDATE public.keyword_variations
          SET ${updates.join(', ')}
          WHERE keyword_id = $${keywordIndex}
            AND id IN (${variationPlaceholders})
          RETURNING id, keyword_id, name, monthly_search_volume, weight, created_at
        `,
        values
      );

      if (updateRes.rowCount === 0) {
        return next(new AppError('未找到可更新的长尾词。', 404));
      }

      await refreshLongTailKeywords(db, keywordId);
      invalidateKeywordCache(req.user.id);

      const formatted = updateRes.rows.map((row) => ({
        ...row,
        monthly_search_volume:
          row.monthly_search_volume !== null ? Number(row.monthly_search_volume) : null,
        weight: row.weight !== null ? Number(row.weight) : null,
      }));

      res.json({ updated: formatted.length, items: formatted });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/:keywordId/variations/:variationId',
  auth,
  validate(keywordSchemas.updateVariation),
  async (req, res, next) => {
    const { keywordId, variationId } = req.params;
    const { name, monthly_search_volume, weight } = req.body;

    try {
      const ownership = await db.query(
        'SELECT 1 FROM public.keywords WHERE id = $1 AND user_id = $2',
        [keywordId, req.user.id]
      );
      if (ownership.rowCount === 0) {
        return next(new AppError('未找到指定的关键词。', 404));
      }

      const updates = [];
      const values = [];
      let index = 1;

      if (name !== undefined) {
        updates.push(`name = $${index}`);
        values.push(name.trim());
        index += 1;
      }
      if (monthly_search_volume !== undefined) {
        updates.push(`monthly_search_volume = $${index}`);
        values.push(monthly_search_volume);
        index += 1;
      }
      if (weight !== undefined) {
        updates.push(`weight = $${index}`);
        values.push(weight);
        index += 1;
      }

      const updateQuery = `
        UPDATE public.keyword_variations
        SET ${updates.join(', ')}
        WHERE id = $${index} AND keyword_id = $${index + 1}
        RETURNING id, keyword_id, name, monthly_search_volume, weight, created_at
      `;

      values.push(variationId, keywordId);

      const updated = await db.query(updateQuery, values);
      if (updated.rowCount === 0) {
        return next(new AppError('未找到指定的长尾词。', 404));
      }

      await refreshLongTailKeywords(db, keywordId);

      const result = updated.rows[0];
      result.monthly_search_volume =
        result.monthly_search_volume !== null ? Number(result.monthly_search_volume) : null;
      result.weight = result.weight !== null ? Number(result.weight) : null;

      invalidateKeywordCache(req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/expand', auth, validate(keywordSchemas.expandKeyword), async (req, res, next) => {
  const { base_keyword } = req.body;

  if (!config.ai.baseUrl || !config.ai.apiKey || !config.ai.chatModel) {
    logger.warn('Attempted keyword expansion without AI configuration', { userId: req.user.id });
    return next(new AppError('AI service is not configured.', 503));
  }

  const keywordRecord = await db.query(
    'SELECT id FROM public.keywords WHERE user_id = $1 AND LOWER(base_keyword) = LOWER($2)',
    [req.user.id, base_keyword]
  );

  if (keywordRecord.rowCount === 0) {
    return next(new AppError('请先添加该基础关键词，然后再尝试扩展。', 404));
  }

  const keywordId = keywordRecord.rows[0].id;

  const aiClient = buildAiClient();

  try {
    const isGemini = config.ai.provider === 'gemini';
    const systemInstruction = [
      'You are a keyword research assistant.',
      `Generate ${VARIATION_TARGET_COUNT} long-tail keywords for the base keyword provided.`,
      'For each entry include a concise name, estimated monthly search volume (integer), and relative weight between 1 and 100.',
      'Respond strictly in JSON. Use the schema: { "keywords": [ { "name": string, "monthly_search_volume": number, "weight": number } ] }',
    ].join(' ');

    const payload = isGemini
      ? {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${systemInstruction}\nBase keyword: ${base_keyword}`,
                },
              ],
            },
          ],
          generation_config: config.ai.useResponseFormat
            ? {
                response_mime_type: 'application/json',
              }
            : undefined,
        }
      : {
          model: config.ai.chatModel,
          messages: [
            {
              role: 'system',
              content: systemInstruction,
            },
            {
              role: 'user',
              content: base_keyword,
            },
          ],
        };

    if (!isGemini && config.ai.useResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }

    const aiResponse = await aiClient.post(resolveChatPath(config.ai.chatPath), payload);

    const message = extractMessagePayload(aiResponse?.data);
    let parsed;
    try {
      const sanitized = normalizeJsonContent(message);
      parsed = sanitized ? JSON.parse(sanitized) : null;
    } catch (parseErr) {
      logger.error('Failed to parse AI response for keyword expansion', {
        error: parseErr.message,
        response: aiResponse.data,
        userId: req.user.id,
      });
      parsed = null;
    }

    const variations = buildVariationList(parsed, base_keyword);

    if (variations.length === 0) {
      logger.error('Unexpected AI response format for keyword expansion', {
        userId: req.user.id,
        baseKeyword: base_keyword,
        response: parsed,
      });
      return next(new AppError('AI service returned an unexpected response format.', 502));
    }

    const inserted = await db.withTransaction(async (client) => {
      await client.query('DELETE FROM public.keyword_variations WHERE keyword_id = $1', [keywordId]);

      const created = [];
      for (const variation of variations) {
        const result = await client.query(
          `INSERT INTO public.keyword_variations (keyword_id, name, monthly_search_volume, weight)
           VALUES ($1, $2, $3, $4)
           RETURNING id, keyword_id, name, monthly_search_volume, weight, created_at`,
          [keywordId, variation.name, variation.monthly_search_volume, variation.weight]
        );
        const row = result.rows[0];
        created.push({
          ...row,
          monthly_search_volume:
            row.monthly_search_volume !== null ? Number(row.monthly_search_volume) : null,
          weight: row.weight !== null ? Number(row.weight) : null,
        });
      }

      await client.query(
        `UPDATE public.keywords
         SET long_tail_keywords = (
           SELECT ARRAY(
             SELECT name FROM public.keyword_variations
             WHERE keyword_id = $1
             ORDER BY created_at DESC, id DESC
           )
         )
         WHERE id = $1`,
        [keywordId]
      );

      created.sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return b.id - a.id;
      });

      return created;
    });

    invalidateKeywordCache(req.user.id);
    res.json(inserted);
  } catch (err) {
    logger.error('AI API Error during keyword expansion', {
      error: err.response ? err.response.data : err.message,
      userId: req.user.id,
      baseKeyword: base_keyword,
    });
    next(new AppError('Failed to expand keyword.', 502));
  }
});

router.put(
  '/:id/schema',
  auth,
  validate(keywordSchemaMetadataSchemas.updateKeywordSchema),
  async (req, res, next) => {
    const { id } = req.params;
    const { schemaMetadata } = req.body;
    try {
      const result = await db.query(
        `UPDATE public.keywords
         SET schema_metadata = $1
         WHERE id = $2 AND user_id = $3
         RETURNING id, base_keyword, schema_metadata`,
        [schemaMetadata, id, req.user.id]
      );
      if (result.rows.length === 0) {
        return next(new AppError('Keyword not found or user not authorized.', 404));
      }
      invalidateKeywordCache(req.user.id);
      res.json(result.rows[0]);
    } catch (err) {
      logger.error('Failed to update keyword schema metadata', {
        error: err.message,
        keywordId: id,
        userId: req.user.id,
      });
      next(new AppError('Failed to update keyword schema metadata.', 500));
    }
  }
);

router.post('/:id/schema/ai', auth, validate(keywordSchemaMetadataSchemas.generateKeywordSchemaAi), async (req, res, next) => {
  if (!config.ai.baseUrl || !config.ai.apiKey || !config.ai.chatModel) {
    logger.warn('Attempted keyword schema AI generation without AI configuration', { userId: req.user.id });
    return next(new AppError('AI service is not configured.', 503));
  }

  const { id } = req.params;
  const { hint, productUrl, productBrand, productSku } = req.body || {};
  const productContext = {
    productUrl: productUrl || undefined,
    productBrand: productBrand || undefined,
    productSku: productSku || undefined,
  };
  const sanitizedHint = typeof hint === 'string' ? hint.trim() : '';

  try {
    const keywordResult = await db.query(
      `SELECT id, base_keyword, schema_metadata
       FROM public.keywords
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (keywordResult.rowCount === 0) {
      return next(new AppError('Keyword not found or user not authorized.', 404));
    }

    const keyword = keywordResult.rows[0];
    const variationsResult = await db.query(
      `SELECT name, monthly_search_volume, weight
       FROM public.keyword_variations
       WHERE keyword_id = $1
       ORDER BY weight DESC NULLS LAST, monthly_search_volume DESC NULLS LAST, created_at ASC
       LIMIT 6`,
      [id]
    );

    const variationLines = variationsResult.rows.map((item, index) => {
      const parts = [`${index + 1}. ${item.name}`];
      if (item.monthly_search_volume !== null && item.monthly_search_volume !== undefined) {
        parts.push(`SV:${item.monthly_search_volume}`);
      }
      if (item.weight !== null && item.weight !== undefined) {
        parts.push(`W:${item.weight}`);
      }
      return parts.join(' | ');
    });

    const productSummary = describeProductContext(productContext);
    const promptSections = [
      `Base keyword: ${keyword.base_keyword}`,
      variationLines.length ? `Related long-tail keywords:\n${variationLines.join('\n')}` : null,
      keyword.schema_metadata ? `Existing schema metadata: ${truncateForPrompt(keyword.schema_metadata)}` : null,
      productSummary ? `Product context: ${productSummary}` : null,
      sanitizedHint ? `User hint: ${truncateForPrompt(sanitizedHint, 500)}` : null,
    ].filter(Boolean);

    const systemInstruction = [
      '你是一名 SEO Schema 策略助手，负责为给定的关键词生成结构化的 Schema 元数据建议。',
      '输出必须是一个 JSON 对象，并尽量包含 search_intent、user_persona、recommended_sections、faq、structured_data_hints 等字段。',
      '不要输出任何额外的解释或 Markdown，仅返回 JSON。',
    ].join(' ');

    let suggestion;
    let source = 'ai';
    try {
      suggestion = await requestJsonFromAi(systemInstruction, promptSections.join('\n\n') || '无额外上下文。');
    } catch (err) {
      logger.warn('Failed to generate keyword schema suggestion via AI, using fallback', {
        error: err.message,
        keywordId: id,
        userId: req.user.id,
      });
      suggestion = buildKeywordSchemaFallback({
        keyword,
        variations: variationsResult.rows,
        hint: sanitizedHint,
        productContext,
      });
      source = 'fallback';
    }

    if (!suggestion || typeof suggestion !== 'object') {
      logger.error('Keyword schema suggestion invalid even after fallback', {
        keywordId: id,
        userId: req.user.id,
        suggestionType: typeof suggestion,
      });
      return next(new AppError('AI 返回了无效的 Schema 建议。', 502));
    }

    res.json({ schemaMetadata: suggestion, metadata: { source } });
  } catch (err) {
    logger.error('Failed to prepare keyword schema AI suggestion', {
      error: err.message,
      keywordId: id,
      userId: req.user.id,
    });
    next(new AppError('无法生成 Schema 建议。', 500));
  }
});

router.put(
  '/:keywordId/variations/:variationId/schema',
  auth,
  validate(keywordSchemaMetadataSchemas.updateVariationSchema),
  async (req, res, next) => {
    const { keywordId, variationId } = req.params;
    const { schemaMetadata } = req.body;
    try {
      const owner = await db.query(
        `SELECT 1 FROM keywords WHERE id = $1 AND user_id = $2`,
        [keywordId, req.user.id]
      );
      if (owner.rows.length === 0) {
        return next(new AppError('Variation not found or user not authorized.', 404));
      }

      const result = await db.query(
        `UPDATE keyword_variations
         SET schema_metadata = $1
         WHERE id = $2
           AND keyword_id = $3
         RETURNING id, keyword_id, schema_metadata`,
        [schemaMetadata, variationId, keywordId]
      );
      if (result.rows.length === 0) {
        return next(new AppError('Variation not found or user not authorized.', 404));
      }
      invalidateKeywordCache(req.user.id);
      res.json(result.rows[0]);
    } catch (err) {
      logger.error('Failed to update keyword variation schema metadata', {
        error: err.message,
        keywordId,
        variationId,
        userId: req.user.id,
      });
      next(new AppError('Failed to update keyword variation schema metadata.', 500));
    }
  }
);

router.post(
  '/:keywordId/variations/:variationId/schema/ai',
  auth,
  validate(keywordSchemaMetadataSchemas.generateVariationSchemaAi),
  async (req, res, next) => {
    if (!config.ai.baseUrl || !config.ai.apiKey || !config.ai.chatModel) {
      logger.warn('Attempted variation schema AI generation without AI configuration', { userId: req.user.id });
      return next(new AppError('AI service is not configured.', 503));
    }

    const { keywordId, variationId } = req.params;
    const { hint, productUrl, productBrand, productSku } = req.body || {};
    const sanitizedHint = typeof hint === 'string' ? hint.trim() : '';
    const productContext = {
      productUrl: productUrl || undefined,
      productBrand: productBrand || undefined,
      productSku: productSku || undefined,
    };

    try {
      const keywordResult = await db.query(
        `SELECT id, base_keyword
       FROM public.keywords
       WHERE id = $1 AND user_id = $2`,
      [keywordId, req.user.id]
    );

    if (keywordResult.rowCount === 0) {
      return next(new AppError('Keyword not found or user not authorized.', 404));
    }

    const variationResult = await db.query(
      `SELECT id, name, schema_metadata, monthly_search_volume, weight
       FROM public.keyword_variations
       WHERE id = $1 AND keyword_id = $2`,
      [variationId, keywordId]
    );

    if (variationResult.rowCount === 0) {
      return next(new AppError('Keyword variation not found.', 404));
    }

    const variation = variationResult.rows[0];
    const siblingResult = await db.query(
      `SELECT name, monthly_search_volume, weight
       FROM public.keyword_variations
       WHERE keyword_id = $1 AND id <> $2
       ORDER BY weight DESC NULLS LAST, monthly_search_volume DESC NULLS LAST, created_at ASC
       LIMIT 5`,
      [keywordId, variationId]
    );

    const siblingLines = siblingResult.rows.map((item, index) => {
      const parts = [`${index + 1}. ${item.name}`];
      if (item.monthly_search_volume !== null && item.monthly_search_volume !== undefined) {
        parts.push(`SV:${item.monthly_search_volume}`);
      }
      if (item.weight !== null && item.weight !== undefined) {
        parts.push(`W:${item.weight}`);
      }
      return parts.join(' | ');
    });

    const productSummary = describeProductContext(productContext);
    const promptSections = [
      `Base keyword: ${keywordResult.rows[0].base_keyword}`,
      `Target long-tail keyword: ${variation.name}`,
      variation.monthly_search_volume !== null && variation.monthly_search_volume !== undefined
        ? `Estimated search volume: ${variation.monthly_search_volume}`
        : null,
      variation.weight !== null && variation.weight !== undefined ? `Weight: ${variation.weight}` : null,
      variation.schema_metadata
        ? `Existing schema metadata: ${truncateForPrompt(variation.schema_metadata)}`
        : null,
      siblingLines.length ? `Sibling variations:\n${siblingLines.join('\n')}` : null,
      productSummary ? `Product context: ${productSummary}` : null,
      sanitizedHint ? `User hint: ${truncateForPrompt(sanitizedHint, 500)}` : null,
    ].filter(Boolean);

    const systemInstruction = [
      '你是一名 SEO Schema 策略助手，需要为具体的长尾关键词生成结构化 Schema 元数据建议。',
      '请在 JSON 对象中包含 question_answer_pairs、intent, persona, recommended_sections、structured_data_hints 等字段，可根据上下文自行拓展。',
      '禁止输出除 JSON 以外的任何解释或 Markdown。',
    ].join(' ');

    let suggestion;
    let source = 'ai';
    try {
      suggestion = await requestJsonFromAi(systemInstruction, promptSections.join('\n\n') || '无额外上下文。');
    } catch (err) {
      logger.warn('Failed to generate variation schema suggestion via AI, using fallback', {
        error: err.message,
        keywordId,
        variationId,
        userId: req.user.id,
      });
      suggestion = buildVariationSchemaFallback({
        keyword: keywordResult.rows[0],
        variation,
        hint: sanitizedHint,
        productContext,
      });
      source = 'fallback';
    }

    if (!suggestion || typeof suggestion !== 'object') {
      logger.error('AI returned invalid variation schema suggestion', {
        keywordId,
        variationId,
        userId: req.user.id,
        suggestionType: typeof suggestion,
      });
      return next(new AppError('AI 返回了无效的 Schema 建议。', 502));
    }

    res.json({ schemaMetadata: suggestion, metadata: { source } });
  } catch (err) {
    logger.error('Failed to prepare variation schema AI suggestion', {
      error: err.message,
      keywordId,
      variationId,
      userId: req.user.id,
    });
    next(new AppError('无法生成 Schema 建议。', 500));
  }
  }
);

module.exports = router;
