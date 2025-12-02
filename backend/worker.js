require('dotenv').config();
const { Worker } = require('bullmq');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const db = require('./db');
const logger = require('./logger');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
};

const MAX_KNOWLEDGE_BASE_CHAR_LENGTH = 8000;
const MAX_KNOWLEDGE_BASE_SNIPPETS = 5;
const FALLBACK_KNOWLEDGE_BASE_SNIPPETS = 5;

const embeddingConfigured =
  Boolean(config.ai.embeddingModel) &&
  Boolean((config.ai.embeddingBaseUrl || config.ai.baseUrl) && (config.ai.embeddingApiKey || config.ai.apiKey));

const embeddingClient = embeddingConfigured
  ? axios.create({
      baseURL: config.ai.embeddingBaseUrl || config.ai.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.embeddingApiKey || config.ai.apiKey}`,
      },
      timeout: config.ai.requestTimeoutMs,
    })
  : null;

const aiClient = axios.create({
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

function resolveChatPath(pathFragment) {
  if (!pathFragment) {
    return '/chat/completions';
  }
  return pathFragment.startsWith('/') ? pathFragment : `/${pathFragment}`;
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

const vectorLiteral = (values) => (Array.isArray(values) ? `[${values.join(',')}]` : null);

const formatBulletList = (items = [], emptyFallback = '无特殊要求。') => {
  const normalized = (items || []).filter(Boolean);
  if (!normalized.length) {
    return `- ${emptyFallback}`;
  }
  return normalized.map((item) => `- ${item}`).join('\n');
};

const describeWordRange = (wordCount = {}) => {
  const min = wordCount?.min;
  const max = wordCount?.max;
  if (min && max) {
    return `${min} ~ ${max} 字`;
  }
  if (min) {
    return `不少于 ${min} 字`;
  }
  if (max) {
    return `不超过 ${max} 字`;
  }
  return '按主题自行发挥';
};

const truncateValue = (value, depth = 0, maxDepth = 3) => {
  if (depth >= maxDepth) {
    return '[Truncated]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => truncateValue(item, depth + 1, maxDepth));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 20);
    return entries.reduce((acc, [key, val]) => {
      acc[key] = truncateValue(val, depth + 1, maxDepth);
      return acc;
    }, {});
  }
  return value;
};

const deepMergeObjects = (target = {}, source = {}) => {
  if (!source || typeof source !== 'object') {
    return target;
  }
  const output = { ...(target || {}) };
  Object.entries(source).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMergeObjects(output[key], value);
    } else {
      output[key] = Array.isArray(value) ? [...value] : value;
    }
  });
  return output;
};

const mergeSchemaConfig = (...configs) =>
  configs
    .filter((cfg) => cfg && typeof cfg === 'object')
    .reduce(
      (acc, cfg) => {
        const next = { ...acc };
        if (typeof cfg.enabled === 'boolean') {
          next.enabled = cfg.enabled;
        }
        if (Array.isArray(cfg.enabledTypes) && cfg.enabledTypes.length) {
          const typeSet = new Set(next.enabledTypes || []);
          cfg.enabledTypes.forEach((type) => typeSet.add(String(type)));
          next.enabledTypes = Array.from(typeSet);
        }
        if (cfg.schemaTemplates) {
          next.schemaTemplates = { ...(next.schemaTemplates || {}), ...cfg.schemaTemplates };
        }
        if (cfg.customFields) {
          next.customFields = deepMergeObjects(next.customFields || {}, cfg.customFields);
        }
        if (cfg.advanced) {
          next.advanced = { ...(next.advanced || {}), ...cfg.advanced };
        }
        return next;
      },
      {}
    );

const getEnabledSchemaTypes = (config = {}) => {
  if (!config) {
    return [];
  }
  if (Array.isArray(config.enabledTypes) && config.enabledTypes.length) {
    return Array.from(new Set(config.enabledTypes.map((type) => String(type))));
  }
  if (config.schemaTemplates) {
    return Object.keys(config.schemaTemplates);
  }
  return [];
};

const isSchemaModuleEnabled = (config) => {
  if (!config || config.enabled === false) {
    return false;
  }
  return getEnabledSchemaTypes(config).length > 0;
};

const flattenMetadataEntries = (metadata, prefix = []) => {
  if (metadata === null || metadata === undefined) {
    return [];
  }
  if (typeof metadata !== 'object') {
    return [[prefix.join('.'), metadata]];
  }
  if (Array.isArray(metadata)) {
    return metadata.slice(0, 10).flatMap((value, index) =>
      flattenMetadataEntries(value, prefix.concat(String(index)))
    );
  }
  return Object.entries(metadata)
    .slice(0, 20)
    .flatMap(([key, value]) => flattenMetadataEntries(value, prefix.concat(String(key))));
};

const formatMetadataValue = (value) => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value.length > 280 ? `${value.slice(0, 277)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 5)
      .map((item) => formatMetadataValue(item))
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .slice(0, 5)
      .map(([key, val]) => `${key}: ${formatMetadataValue(val)}`)
      .join('; ');
  }
  return String(value);
};

const buildEntityMetadataSection = (entityData = {}) => {
  const sections = [];
  Object.entries(entityData).forEach(([entityKey, entityValue]) => {
    if (!entityValue || typeof entityValue !== 'object') {
      return;
    }
    const meta = entityValue.schemaMetadata || entityValue.metadata || null;
    if (!meta) {
      return;
    }
    const entries = flattenMetadataEntries(meta).slice(0, 12);
    if (!entries.length) {
      return;
    }
    const title = entityKey
      .split(/[_-]/)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
    const lines = entries.map(([path, value]) => `- ${path || entityKey}: ${formatMetadataValue(value)}`);
    sections.push(`${title} 元数据:\n${lines.join('\n')}`);
  });
  return sections.join('\n\n');
};

const renderTemplateFields = (template = {}) => {
  const fields = Array.isArray(template.fields) ? template.fields : [];
  if (!fields.length) {
    return null;
  }
  return fields
    .map((field) => {
      const pieces = [`- ${field.key || '字段'} (${field.type || 'string'}`];
      if (field.required) {
        pieces[0] += ', required';
      }
      pieces[0] += ')';
      if (field.description) {
        pieces.push(`  描述：${field.description}`);
      }
      if (field.example !== undefined) {
        pieces.push(`  示例：${formatMetadataValue(field.example)}`);
      }
      return pieces.join('\n');
    })
    .join('\n');
};

const buildSchemaPromptSection = (schemaConfig, entityData) => {
  if (!isSchemaModuleEnabled(schemaConfig)) {
    return '';
  }
  const enabledTypes = getEnabledSchemaTypes(schemaConfig);
  const templates = schemaConfig?.schemaTemplates || {};
  const templateSections = enabledTypes.map((type) => {
    const template = templates[type] || {};
    const lines = [
      `### ${type} Schema`,
      template.description ? `说明：${template.description}` : null,
      renderTemplateFields(template),
    ].filter(Boolean);
    return lines.join('\n');
  });
  const entitySection = buildEntityMetadataSection(entityData);

  return [
    '## Schema Block',
    '你必须在最终 JSON 中包含 `schema_payloads` 字段，结构示例：',
    '{ "types": ["Product","FAQ"], "payloads": { "Product": { ... }, "FAQ": { ... } } }',
    '为 enabledTypes 中的每一种 Schema 输出完整 JSON，字段必须与模板定义一致，所有 key 使用驼峰或模板指定格式，不得添加额外说明文字。',
    templateSections.join('\n\n'),
    entitySection ? `### 实体参考数据\n${entitySection}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
};

const snapshotSchemaConfig = (schemaConfig) => {
  if (!schemaConfig) {
    return null;
  }
  return {
    enabled: schemaConfig.enabled !== false,
    enabledTypes: getEnabledSchemaTypes(schemaConfig),
    customFields: schemaConfig.customFields ? truncateValue(schemaConfig.customFields) : null,
    advanced: schemaConfig.advanced ? truncateValue(schemaConfig.advanced) : null,
  };
};

const sanitizeEntitySchemaData = (entitySchemaData = {}) => {
  const sanitizeEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const result = { ...entry };
    if (result.schemaMetadata) {
      result.schemaMetadata = truncateValue(result.schemaMetadata);
    }
    return result;
  };
  return {
    keyword: sanitizeEntry(entitySchemaData.keyword),
    variation: sanitizeEntry(entitySchemaData.variation),
    knowledgeBase: sanitizeEntry(entitySchemaData.knowledgeBase),
    documents: Array.isArray(entitySchemaData.documents)
      ? entitySchemaData.documents.map(sanitizeEntry)
      : undefined,
    custom: Array.isArray(entitySchemaData.custom)
      ? entitySchemaData.custom.map(sanitizeEntry)
      : undefined,
  };
};

const processSchemaOutput = ({ rawContent, schemaConfig, entitySchemaData }) => {
  if (!isSchemaModuleEnabled(schemaConfig)) {
    return { record: null, types: [] };
  }

  const rawSchema =
    rawContent?.schema_payloads ||
    rawContent?.schemaPayload ||
    rawContent?.schema ||
    rawContent?.schemas ||
    null;

  const configSnapshot = snapshotSchemaConfig(schemaConfig);
  const entitySnapshot = sanitizeEntitySchemaData(entitySchemaData);

  if (!rawSchema) {
    return {
      record: {
        types: [],
        payloads: null,
        raw: null,
        fallback: {
          reason: 'schema_payload_missing',
          message: '模型未返回 schema_payloads 字段。',
        },
        configSnapshot,
        entitySnapshot,
      },
      types: [],
    };
  }

  let payloadContainer = rawSchema;
  if (Array.isArray(rawSchema)) {
    payloadContainer = rawSchema.reduce(
      (acc, item) => {
        if (item && typeof item === 'object') {
          const typeName = item.type || item.schema_type;
          if (typeName) {
            acc.types = acc.types || [];
            acc.payloads = acc.payloads || {};
            acc.types.push(String(typeName));
            acc.payloads[String(typeName)] = item.payload || item.data || item;
          }
        }
        return acc;
      },
      { types: [], payloads: {} }
    );
  }

  const candidatePayloads =
    payloadContainer?.payloads ||
    payloadContainer?.payload ||
    (typeof payloadContainer === 'object' && !Array.isArray(payloadContainer)
      ? payloadContainer
      : null);

  const enabledTypes = getEnabledSchemaTypes(schemaConfig);
  let types = Array.isArray(payloadContainer?.types) ? payloadContainer.types.map(String) : [];
  if (!types.length && candidatePayloads) {
    types = Object.keys(candidatePayloads);
  }
  if (enabledTypes.length && types.length) {
    types = types.filter((type) => enabledTypes.includes(type));
  }
  if (!types.length && enabledTypes.length && candidatePayloads) {
    types = enabledTypes.filter((type) => candidatePayloads[type]);
  }

  if (!candidatePayloads || !types.length) {
    return {
      record: {
        types: [],
        payloads: candidatePayloads || null,
        raw: rawSchema,
        fallback: {
          reason: 'schema_payload_invalid',
          message: 'schema_payloads 缺失或不包含启用的类型。',
        },
        configSnapshot,
        entitySnapshot,
      },
      types: [],
    };
  }

  const normalizedPayloads = {};
  types.forEach((type) => {
    const payload = candidatePayloads[type] ?? candidatePayloads[type?.toLowerCase()] ?? null;
    if (payload !== null && payload !== undefined) {
      normalizedPayloads[type] = payload;
    }
  });

  if (!Object.keys(normalizedPayloads).length) {
    return {
      record: {
        types: [],
        payloads: candidatePayloads,
        raw: rawSchema,
        fallback: {
          reason: 'schema_payload_empty',
          message: '未匹配到有效的 schema payload。',
        },
        configSnapshot,
        entitySnapshot,
      },
      types: [],
    };
  }

  return {
    record: {
      types,
      payloads: normalizedPayloads,
      raw: rawSchema,
      generatedAt: new Date().toISOString(),
      configSnapshot,
      entitySnapshot,
    },
    types,
  };
};

const composeContentPrompt = ({
  keyword,
  rule,
  knowledgeBaseContent,
  imageDetails,
  schemaConfig,
  entitySchemaData,
}) => {
  const source = rule?.source_settings || {};
  const style = rule?.style_settings || {};
  const seo = rule?.seo_settings || {};
  const outline = Array.isArray(seo?.outline) ? seo.outline : [];
  const references = Array.isArray(source?.references) ? source.references : [];

  const brandContext = [
    source.brand_name ? `品牌：${source.brand_name}` : null,
    source.campaign_name ? `活动/场景：${source.campaign_name}` : null,
    source.target_region ? `目标地区：${source.target_region}` : null,
    Array.isArray(source.channels) && source.channels.length
      ? `发布渠道：${source.channels.join(' / ')}`
      : null,
  ];

  const audienceContext = [
    style.target_audience ? `目标受众：${style.target_audience}` : null,
    style.pain_points ? `受众痛点：${style.pain_points}` : null,
    style.value_props ? `核心价值：${style.value_props}` : null,
    style.persona ? `内容人格设定：${style.persona}` : null,
    style.call_to_action ? `主要 CTA：${style.call_to_action}` : null,
    Array.isArray(style.voice_keywords) && style.voice_keywords.length
      ? `语调关键词：${style.voice_keywords.join(' / ')}`
      : null,
    style.reading_level ? `阅读水平：${style.reading_level}` : null,
    Array.isArray(style.avoid_phrases) && style.avoid_phrases.length
      ? `禁止出现：${style.avoid_phrases.join('、')}`
      : null,
  ];

  const seoContext = [
    Array.isArray(seo.target_keywords) && seo.target_keywords.length
      ? `必须覆盖的核心关键词：${seo.target_keywords.join('、')}`
      : null,
    Array.isArray(seo.secondary_keywords) && seo.secondary_keywords.length
      ? `辅助关键词：${seo.secondary_keywords.join('、')}`
      : null,
    `建议字数：${describeWordRange(seo.word_count)}`,
    seo.keyword_density
      ? `关键词密度：${seo.keyword_density.min ?? '—'}% ~ ${seo.keyword_density.max ?? '—'}%`
      : null,
    seo.meta_title_length ? `Meta Title 最长 ${seo.meta_title_length} 字符` : null,
    seo.meta_description_length
      ? `Meta Description 最长 ${seo.meta_description_length} 字符`
      : null,
    `内部链接：${seo.internal_links?.count ?? 0}（${seo.internal_links?.anchor_strategy || '策略自定'}）`,
    `外部链接：${seo.external_links?.count ?? 0}（${seo.external_links?.anchor_strategy || '策略自定'}）`,
    `标题结构：${seo.require_h1 ? '需包含唯一 H1' : 'H1 非必需'}；H2 数量 ${seo.h2_count ?? '未指定'}`,
  ];

  const outlineText = outline.length
    ? outline
        .map((section, index) => {
          const parts = [`${index + 1}. ${section.title || `段落 ${index + 1}`}`];
          if (section.minimum_words) {
            parts.push(`（不少于 ${section.minimum_words} 字）`);
          }
          if (section.objective) {
            parts.push(`——${section.objective}`);
          }
          if (section.notes) {
            parts.push(`（备注：${section.notes}）`);
          }
          return parts.join(' ');
        })
        .join('\n')
    : '1. 自行设计合理的大纲结构，确保信息完整。';

  const referenceText = references.length
    ? references
        .map(
          (ref, index) =>
            `${index + 1}. ${ref.title || ref.url} - ${ref.url}${
              ref.notes ? `（${ref.notes}）` : ''
            }`
        )
        .join('\n')
    : '无额外参考链接。';

  const schemaInstructions = buildSchemaPromptSection(schemaConfig, entitySchemaData);

  const ranking = rule?.ranking_settings;
  let rankingText = '';
  if (ranking?.enabled && Array.isArray(ranking.items) && ranking.items.length > 0) {
    const sortedItems = [...ranking.items].sort((a, b) => (a.index || 0) - (b.index || 0));
    const primaryIndex = Math.max(1, ranking.primary_position || 1);
    const primaryItem =
      sortedItems.find((item) => (item.index || 0) === primaryIndex) || sortedItems[0];

    const rankingList = sortedItems
      .map(
        (item, idx) =>
          `${idx + 1}. ${item.name || `项目${idx + 1}`}——${
            item.highlight || item.description || '请说明其亮点或适用场景'
          }`
      )
      .join('\n');

    rankingText = `
**榜单要求**
- 以“${ranking.title || '推荐榜单'}”的语气呈现，突出排名信息。
- 第 ${primaryIndex} 位必须为核心推荐：${primaryItem?.name || '主推项目'}，需给出至少 3 个关键优势，并对比其他产品指出差异。
- 对其余项目，要客观说明适用人群、核心亮点及潜在局限，可与主推项目形成对照。
- 共列出 ${sortedItems.length} 个项目，并按以下顺序输出，给出亮点/对比说明：
${rankingList}
- 在正文中使用 Markdown H2 或有序列表表示「TOP 1 / TOP 2 ...」，确保读者可以快速对比。`;
  } else if (ranking?.enabled && ranking.auto_generate) {
    rankingText = `
**榜单要求**
- 以“${ranking.title || '推荐榜单'}”的语气呈现，输出至少 4 个推荐条目。
- 第 ${ranking.primary_position || 1} 位必须为核心推荐：${rule.source_settings?.brand_name || '主推品牌'} 的产品，给出 ≥3 个优势并和竞品对比。
- 其余条目由你补充行业主流竞品，说明亮点、适用人群与潜在不足，保持客观准确。
- 请标注来源或提醒读者这是参考信息，如缺乏可靠数据需说明。`;
  }

  const imageInstructions = imageDetails
    ? `- 图片指引（仅供生成时定位，不要直接写入正文）：
${imageDetails}
- 在正文中需要插入图片的地方，必须使用占位符形式，例如 [IMAGE_1]、[IMAGE_2]。严禁输出 HTML 注释或直接描述图片内容。`
    : '- 如需插入图片，请在正文使用 [IMAGE_1]、[IMAGE_2] 等占位符，严禁输出 HTML 注释或图片描述。';

  return `
你是一名资深内容营销顾问，请围绕 "${keyword}" 生成高质量的营销文章，并严格遵守以下约束：

**品牌 & 业务背景**
${formatBulletList(brandContext)}

**受众画像与语调**
${formatBulletList(audienceContext)}

**SEO 要求**
${formatBulletList(seoContext)}

**内容大纲（按序输出）**
${outlineText}

**参考资料**
${referenceText}

${rankingText}

**其他说明**
- 语言需与目标受众匹配，若规则未指定则默认使用简体中文。
- 请避免出现禁用词、夸大或未经验证的承诺。
- 优先引用知识库信息，确保内容准确。
- 在正文合适处可使用 Markdown 列表与加粗突出重点。
${imageInstructions}

**知识库补充内容**（如无则忽略）
${knowledgeBaseContent && knowledgeBaseContent.trim() ? knowledgeBaseContent : '暂无额外知识库摘要。'}

${schemaInstructions ? `${schemaInstructions}\n` : ''}

**输出要求**
- 输出 JSON，包含以下字段：
  {
    "title": "string",
    "meta_description": "string",
    "body": "string (markdown format)"
  }
- 若启用了 Schema，请额外输出 "schema_payloads" 字段，并确保类型列表与 Schema Block 保持一致。
- 确保返回合法 JSON，不得出现额外说明。`;
};

const sanitizeKnowledgeText = (value) =>
  (value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();

const generateQueryEmbedding = async (text, jobId) => {
  if (!embeddingConfigured || !embeddingClient || !text) {
    return null;
  }

  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedText) {
    return null;
  }

  try {
    const response = await embeddingClient.post('/v1/embeddings', {
      model: config.ai.embeddingModel,
      input: normalizedText,
    });
    return response?.data?.data?.[0]?.embedding || null;
  } catch (err) {
    logger.warn('Failed to generate query embedding', {
      error: err.response ? err.response.data : err.message,
      jobId,
    });
    return null;
  }
};

async function fetchFallbackChunks(documentId, userId, limit = FALLBACK_KNOWLEDGE_BASE_SNIPPETS) {
  const result = await db.query(
    `
      SELECT document_id, content, chunk_index
      FROM document_chunks
      WHERE document_id = $1 AND user_id = $2
      ORDER BY chunk_index ASC
      LIMIT $3
    `,
    [documentId, userId, limit]
  );
  return result.rows;
}

async function fetchRelevantChunks(documentId, userId, queryVectorLiteral, limit = MAX_KNOWLEDGE_BASE_SNIPPETS) {
  if (!queryVectorLiteral) {
    return [];
  }

  const result = await db.query(
    `
      SELECT document_id, content, chunk_index, embedding <-> $3::vector AS distance
      FROM document_chunks
      WHERE document_id = $1 AND user_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <-> $3::vector ASC
      LIMIT $4
    `,
    [documentId, userId, queryVectorLiteral, limit]
  );

  return result.rows;
}

async function getDocumentChunkStats(documentId, userId) {
  const result = await db.query(
    `
      SELECT
        COUNT(*)::int AS chunk_count,
        COALESCE(SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS embedding_count,
        COALESCE(SUM(char_length(content)), 0)::int AS total_length
      FROM document_chunks
      WHERE document_id = $1 AND user_id = $2
    `,
    [documentId, userId]
  );

  const row = result.rows[0] || {};
  return {
    chunkCount: Number(row.chunk_count || 0),
    embeddingCount: Number(row.embedding_count || 0),
    totalLength: Number(row.total_length || 0),
  };
}

async function getAggregatedChunkStats(documentIds, userId) {
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return { chunkCount: 0, embeddingCount: 0, totalLength: 0 };
  }
  const result = await db.query(
    `
      SELECT
        COUNT(*)::int AS chunk_count,
        COALESCE(SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END), 0)::int AS embedding_count,
        COALESCE(SUM(char_length(content)), 0)::int AS total_length
      FROM document_chunks
      WHERE document_id = ANY($1::int[]) AND user_id = $2
    `,
    [documentIds, userId]
  );
  const row = result.rows[0] || {};
  return {
    chunkCount: Number(row.chunk_count || 0),
    embeddingCount: Number(row.embedding_count || 0),
    totalLength: Number(row.total_length || 0),
  };
}

async function fetchRelevantChunksForDocuments(documentIds, userId, queryVectorLiteral, limit = MAX_KNOWLEDGE_BASE_SNIPPETS) {
  if (!queryVectorLiteral || !Array.isArray(documentIds) || !documentIds.length) {
    return [];
  }

  const result = await db.query(
    `
      SELECT document_id, content, chunk_index, embedding <-> $3::vector AS distance
      FROM document_chunks
      WHERE document_id = ANY($1::int[]) AND user_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <-> $3::vector ASC
      LIMIT $4
    `,
    [documentIds, userId, queryVectorLiteral, limit]
  );
  return result.rows;
}

async function fetchFallbackChunksForDocuments(documentIds, userId, limit = FALLBACK_KNOWLEDGE_BASE_SNIPPETS) {
  if (!Array.isArray(documentIds) || !documentIds.length) {
    return [];
  }
  const result = await db.query(
    `
      SELECT document_id, content, chunk_index
      FROM document_chunks
      WHERE document_id = ANY($1::int[]) AND user_id = $2
      ORDER BY document_id ASC, chunk_index ASC
      LIMIT $3
    `,
    [documentIds, userId, limit]
  );
  return result.rows;
}

function buildFallbackContent(keyword, rule, knowledgeBaseContent, selectedImages = []) {
  const sections = [
    `## Why ${keyword} Matters`,
    `Discuss the importance of ${keyword} for the target audience and how it connects to current market dynamics.`,
    `## Best Practices`,
    `Provide actionable tips, referencing any knowledge base snippets and highlighting when images should be inserted.`,
    `## Next Steps`,
    `Offer a clear call to action and summarize the benefits of adopting strategies related to ${keyword}.`,
  ];

  const placeholders =
    Array.isArray(selectedImages) && selectedImages.length > 0
      ? selectedImages.map((_, idx) => `[IMAGE_${idx + 1}]`).join('\n\n')
      : '';

  if (placeholders) {
    sections.splice(2, 0, `## Visual Inspiration`, `Incorporate the following visuals:\n\n${placeholders}`);
  }

  return {
    title: `Essential Guide to ${keyword}`,
    meta_description: `Discover how ${keyword} can impact your marketing strategy with practical steps tailored to your needs.`,
    body: sections.join('\n\n'),
    details: {
      appliedRule: rule?.rule_name || 'default',
      hasKnowledgeBase: Boolean(knowledgeBaseContent),
      imagesIncluded: Array.isArray(selectedImages) && selectedImages.length > 0,
    },
  };
}

async function fetchRule(ruleId, userId) {
  if (!ruleId) {
    return null;
  }
  const result = await db.query(
    'SELECT * FROM generation_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId]
  );
  return result.rows[0] || null;
}

async function fetchKnowledgeBaseContent({ knowledgeBaseId, knowledgeSetId, userId, jobId, queryText }) {
  if (knowledgeSetId) {
    return fetchKnowledgeSetContext(knowledgeSetId, userId, jobId, queryText);
  }
  return fetchDocumentContext(knowledgeBaseId, userId, jobId, queryText);
}

async function fetchDocumentContext(knowledgeBaseId, userId, jobId, queryText) {
  if (!knowledgeBaseId) {
    return {
      content: '',
      truncated: false,
      originalLength: 0,
      snippets: [],
      retrievalMode: 'none',
      chunkStats: { chunkCount: 0, embeddingCount: 0, totalLength: 0 },
      schemaMetadata: null,
      knowledgeSource: null,
    };
  }

  const docResult = await db.query(
    'SELECT id, file_name, file_path, schema_metadata FROM documents WHERE id = $1 AND user_id = $2',
    [knowledgeBaseId, userId]
  );

  if (docResult.rows.length === 0) {
    return {
      content: '',
      truncated: false,
      originalLength: 0,
      snippets: [],
      retrievalMode: 'missing',
      chunkStats: { chunkCount: 0, embeddingCount: 0, totalLength: 0 },
      schemaMetadata: null,
      knowledgeSource: null,
    };
  }

  const documentMeta = docResult.rows[0];
  const documentId = documentMeta.id;
  const chunkStats = await getDocumentChunkStats(documentId, userId);

  let retrievalMode = 'none';
  let snippetRows = [];

  if (embeddingConfigured && chunkStats.embeddingCount > 0) {
    const queryEmbedding = await generateQueryEmbedding(queryText, jobId);
    const queryVectorLiteral = vectorLiteral(queryEmbedding);
    if (queryVectorLiteral) {
      snippetRows = await fetchRelevantChunks(documentId, userId, queryVectorLiteral);
      if (snippetRows.length > 0) {
        retrievalMode = 'vector';
      }
    }
  }

  if (!snippetRows.length && chunkStats.chunkCount > 0) {
    snippetRows = await fetchFallbackChunks(documentId, userId);
    if (snippetRows.length > 0) {
      retrievalMode = 'chunk';
    }
  }

  let combinedContent = snippetRows
    .map((chunk) => chunk.content)
    .join('\n\n');
  let effectiveStats = chunkStats;

  if (!combinedContent) {
    try {
      const relativePath = documentMeta.file_path.replace(/\\/g, path.sep);
      const documentPath = path.join(__dirname, relativePath);
      const raw = await fs.promises.readFile(documentPath, 'utf-8');
      const sanitizedRaw = sanitizeKnowledgeText(raw);
      combinedContent = sanitizedRaw;
      retrievalMode = 'raw';
      effectiveStats = {
        ...chunkStats,
        totalLength: sanitizedRaw.length,
      };
    } catch (fileErr) {
      logger.warn('Failed to read knowledge base file for job', {
        error: fileErr.message,
        jobId,
        documentPath: documentMeta.file_path,
      });
      return {
        content: '',
        truncated: false,
        originalLength: 0,
        snippets: [],
        retrievalMode: 'error',
        chunkStats,
        schemaMetadata: documentMeta.schema_metadata || null,
        knowledgeSource: {
          type: 'document',
          id: documentId,
          name: documentMeta.file_name,
          documentCount: 1,
        },
      };
    }
  }

  const truncated = combinedContent.length > MAX_KNOWLEDGE_BASE_CHAR_LENGTH;
  const normalizedContent = truncated
    ? combinedContent.slice(0, MAX_KNOWLEDGE_BASE_CHAR_LENGTH)
    : combinedContent;

  if (truncated) {
    logger.warn('Knowledge base snippets truncated after retrieval', {
      jobId,
      knowledgeBaseId: documentId,
      userId,
      snippetCount: snippetRows.length,
      truncatedLength: normalizedContent.length,
      limit: MAX_KNOWLEDGE_BASE_CHAR_LENGTH,
      retrievalMode,
    });
  }

  const snippetSummaries = snippetRows.map((row) => ({
    documentId: row.document_id || documentId,
    chunkIndex: row.chunk_index,
    preview: row.content.slice(0, 200),
    score: typeof row.distance === 'number' ? Number(row.distance) : undefined,
  }));

  return {
    content: normalizedContent,
    truncated,
    originalLength: effectiveStats.totalLength || combinedContent.length,
    snippets: snippetSummaries,
    retrievalMode,
    chunkStats: effectiveStats,
    schemaMetadata: documentMeta.schema_metadata || null,
    knowledgeSource: {
      type: 'document',
      id: documentId,
      name: documentMeta.file_name,
      documentCount: 1,
    },
  };
}

async function fetchKnowledgeSetContext(knowledgeSetId, userId, jobId, queryText) {
  const setResult = await db.query(
    'SELECT id, name, description, schema_metadata FROM knowledge_sets WHERE id = $1 AND user_id = $2',
    [knowledgeSetId, userId]
  );

  if (setResult.rows.length === 0) {
    return {
      content: '',
      truncated: false,
      originalLength: 0,
      snippets: [],
      retrievalMode: 'missing_set',
      chunkStats: { chunkCount: 0, embeddingCount: 0, totalLength: 0 },
      schemaMetadata: null,
      knowledgeSource: null,
    };
  }

  const setMeta = setResult.rows[0];
  const docsResult = await db.query(
    `
      SELECT id, file_name, file_path, schema_metadata
      FROM documents
      WHERE user_id = $1 AND knowledge_set_id = $2
      ORDER BY created_at DESC
    `,
    [userId, knowledgeSetId]
  );
  const documents = docsResult.rows;

  if (documents.length === 0) {
    return {
      content: '',
      truncated: false,
      originalLength: 0,
      snippets: [],
      retrievalMode: 'empty_set',
      chunkStats: { chunkCount: 0, embeddingCount: 0, totalLength: 0 },
      schemaMetadata: setMeta.schema_metadata || null,
      knowledgeSource: {
        type: 'set',
        id: setMeta.id,
        name: setMeta.name,
        documentCount: 0,
        documents: [],
      },
    };
  }

  const documentIds = documents.map((doc) => doc.id);
  const chunkStats = await getAggregatedChunkStats(documentIds, userId);

  let retrievalMode = 'none';
  let snippetRows = [];

  if (embeddingConfigured && chunkStats.embeddingCount > 0) {
    const queryEmbedding = await generateQueryEmbedding(queryText, jobId);
    const queryVectorLiteral = vectorLiteral(queryEmbedding);
    if (queryVectorLiteral) {
      snippetRows = await fetchRelevantChunksForDocuments(documentIds, userId, queryVectorLiteral);
      if (snippetRows.length > 0) {
        retrievalMode = 'vector_set';
      }
    }
  }

  if (!snippetRows.length && chunkStats.chunkCount > 0) {
    snippetRows = await fetchFallbackChunksForDocuments(documentIds, userId);
    if (snippetRows.length > 0) {
      retrievalMode = 'chunk_set';
    }
  }

  const docLookup = documents.reduce((acc, doc) => {
    acc[doc.id] = doc;
    return acc;
  }, {});

  let combinedContent = snippetRows
    .map((chunk) => {
      const doc = docLookup[chunk.document_id];
      const heading = doc ? `## ${doc.file_name}\n` : '';
      return `${heading}${chunk.content}`;
    })
    .join('\n\n');

  if (!combinedContent) {
    const sections = [];
    for (const doc of documents) {
      try {
        const relativePath = doc.file_path.replace(/\\/g, path.sep);
        const documentPath = path.join(__dirname, relativePath);
        const raw = await fs.promises.readFile(documentPath, 'utf-8');
        const sanitizedRaw = sanitizeKnowledgeText(raw);
        if (sanitizedRaw) {
          sections.push(`## ${doc.file_name}\n${sanitizedRaw}`);
        }
        if (sections.join('\n\n').length >= MAX_KNOWLEDGE_BASE_CHAR_LENGTH) {
          break;
        }
      } catch (err) {
        logger.warn('Failed to read knowledge set document during fallback', {
          error: err.message,
          jobId,
          documentPath: doc.file_path,
        });
      }
    }
    combinedContent = sections.join('\n\n');
    retrievalMode = combinedContent ? 'raw_set' : 'error';
  }

  if (!combinedContent) {
    return {
      content: '',
      truncated: false,
      originalLength: 0,
      snippets: [],
      retrievalMode: 'error',
      chunkStats,
      schemaMetadata: setMeta.schema_metadata || null,
      knowledgeSource: {
        type: 'set',
        id: setMeta.id,
        name: setMeta.name,
        documentCount: documents.length,
        documents: documents.map((doc) => ({ id: doc.id, name: doc.file_name })),
      },
    };
  }

  const truncated = combinedContent.length > MAX_KNOWLEDGE_BASE_CHAR_LENGTH;
  const normalizedContent = truncated
    ? combinedContent.slice(0, MAX_KNOWLEDGE_BASE_CHAR_LENGTH)
    : combinedContent;

  if (truncated) {
    logger.warn('Knowledge set snippets truncated after retrieval', {
      jobId,
      knowledgeSetId,
      userId,
      snippetCount: snippetRows.length,
      truncatedLength: normalizedContent.length,
      limit: MAX_KNOWLEDGE_BASE_CHAR_LENGTH,
      retrievalMode,
    });
  }

  const snippetSummaries = snippetRows.map((row) => ({
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    preview: row.content.slice(0, 200),
    score: typeof row.distance === 'number' ? Number(row.distance) : undefined,
  }));

  const documentSchemaEntries = documents
    .filter((doc) => doc.schema_metadata)
    .map((doc) => ({
      id: doc.id,
      name: doc.file_name,
      schemaMetadata: doc.schema_metadata,
    }));

  const combinedSchemaMetadata =
    setMeta.schema_metadata || documentSchemaEntries.length
      ? {
          knowledgeSet: setMeta.schema_metadata || null,
          documents: documentSchemaEntries,
        }
      : null;

  return {
    content: normalizedContent,
    truncated,
    originalLength: chunkStats.totalLength || normalizedContent.length,
    snippets: snippetSummaries,
    retrievalMode,
    chunkStats,
    schemaMetadata: combinedSchemaMetadata,
    knowledgeSource: {
      type: 'set',
      id: setMeta.id,
      name: setMeta.name,
      documentCount: documents.length,
      documents: documents.map((doc) => ({
        id: doc.id,
        name: doc.file_name,
      })),
    },
  };
}

async function fetchImagesByIds(imageIds, userId) {
  if (!imageIds || imageIds.length === 0) {
    return [];
  }
  const result = await db.query(
    `
      SELECT id, image_name, image_path, tags
      FROM images
      WHERE id = ANY($1::int[]) AND user_id = $2
    `,
    [imageIds, userId]
  );
  return result.rows;
}

async function fetchImagesFromCollection(collectionId, userId, limit, tagFilters = []) {
  if (!collectionId) {
    return [];
  }

  const values = [userId, collectionId];
  const conditions = ['user_id = $1', 'collection_id = $2'];

  if (Array.isArray(tagFilters) && tagFilters.length > 0) {
    values.push(tagFilters);
    conditions.push(`tags && $${values.length}`);
  }

  if (limit) {
    values.push(limit);
  }

  const query = `
    SELECT id, image_name, image_path, tags
    FROM images
    WHERE ${conditions.join(' AND ')}
    ORDER BY RANDOM()
    ${limit ? `LIMIT $${values.length}` : ''}
  `;

  const result = await db.query(query, values);
  return result.rows;
}

async function fetchImagesFromLibrary(userId, limit, tagFilters = []) {
  const values = [userId];
  const conditions = ['user_id = $1', 'collection_id IS NULL'];

  if (Array.isArray(tagFilters) && tagFilters.length > 0) {
    values.push(tagFilters);
    conditions.push(`tags && $${values.length}::text[]`);
  }

  if (typeof limit === 'number' && limit > 0) {
    values.push(limit);
  }

  const query = `
    SELECT id, image_name, image_path, tags
    FROM images
    WHERE ${conditions.join(' AND ')}
    ORDER BY RANDOM()
    ${limit ? `LIMIT $${values.length}` : ''}
  `;

  const result = await db.query(query, values);
  return result.rows;
}

function formatImageGuidance(images) {
  if (!images.length) {
    return '';
  }
  return images
    .map(
      (img, idx) =>
        `Image ${idx + 1}: Name - ${img.image_name}, Tags - ${
          img.tags && img.tags.length ? img.tags.join(', ') : 'N/A'
        }`
    )
    .join('\n');
}

async function resolveImages({ manualImageIds, collectionId, requestedCount, tagFilters, userId }) {
  let images = [];

  if (manualImageIds && manualImageIds.length > 0) {
    images = await fetchImagesByIds(manualImageIds, userId);
  } else if (collectionId) {
    images = await fetchImagesFromCollection(collectionId, userId, requestedCount, tagFilters);
  } else {
    images = await fetchImagesFromLibrary(userId, requestedCount, tagFilters);
  }

  const guidance = formatImageGuidance(images);
  return { images, guidance };
}

function ensureStructuredContent(rawContent, keyword, rule, knowledgeBaseContent, selectedImages) {
  if (!rawContent) {
    return buildFallbackContent(keyword, rule, knowledgeBaseContent, selectedImages);
  }

  const { title, meta_description, body } = rawContent;
  if (typeof title === 'string' && typeof meta_description === 'string' && typeof body === 'string') {
    return rawContent;
  }

  return buildFallbackContent(keyword, rule, knowledgeBaseContent, selectedImages);
}

const worker = new Worker(
  'content-generation',
  async (job) => {
    const {
      keyword,
      knowledgeBaseId,
      knowledgeSetId,
      imageIds,
      imageCollectionId,
      imageTags,
      imageCount,
      ruleId,
      userId,
      schemaConfig: jobSchemaConfig,
      schemaEntities = {},
      schemaOverrides,
    } = job.data;
    logger.info(`Processing job ${job.id} for user ${userId}`);

    try {
      await job.updateProgress({ stage: 'initializing', percent: 5 });
      const rule = await fetchRule(ruleId, userId);
      const mergedSchemaConfig = mergeSchemaConfig(rule?.schema_config, jobSchemaConfig, schemaOverrides);
      await job.updateProgress({ stage: 'loading_knowledge_base', percent: 15 });
      const knowledgeQueryText = [
        keyword,
        rule?.rule_name,
        rule?.seo_settings?.primary_keyword,
      ]
        .filter(Boolean)
        .join(' ');
      const {
        content: knowledgeBaseContent,
        truncated: knowledgeBaseTruncated,
        originalLength: knowledgeBaseOriginalLength,
        snippets: knowledgeBaseSnippets,
        retrievalMode: knowledgeBaseRetrievalMode,
        chunkStats: knowledgeBaseChunkStats,
        schemaMetadata: knowledgeBaseSchemaMetadata,
        knowledgeSource,
      } = await fetchKnowledgeBaseContent({
        knowledgeBaseId,
        knowledgeSetId,
        userId,
        jobId: job.id,
        queryText: knowledgeQueryText || keyword || rule?.rule_name || '',
      });
      const resolvedSchemaEntities = { ...schemaEntities };
      if (knowledgeBaseSchemaMetadata) {
        if (resolvedSchemaEntities.knowledgeBase) {
          resolvedSchemaEntities.knowledgeBase = {
            ...resolvedSchemaEntities.knowledgeBase,
            schemaMetadata:
              resolvedSchemaEntities.knowledgeBase.schemaMetadata || knowledgeBaseSchemaMetadata,
          };
        } else {
          resolvedSchemaEntities.knowledgeBase = {
            id: knowledgeSource?.id || knowledgeBaseId || knowledgeSetId || null,
            type: knowledgeSource?.type || (knowledgeSetId ? 'set' : 'document'),
            schemaMetadata: knowledgeBaseSchemaMetadata,
          };
        }
      }
      await job.updateProgress({ stage: 'loading_images', percent: 30 });

      const requestedImageCount =
        typeof imageCount === 'number'
          ? imageCount
          : typeof rule?.media_settings?.image_count === 'number'
          ? rule.media_settings.image_count
          : 0;

      const tagFilters =
        Array.isArray(imageTags) && imageTags.length
          ? imageTags
          : Array.isArray(rule?.media_settings?.image_source?.tags)
          ? rule.media_settings.image_source.tags
          : [];

      const collectionId =
        imageCollectionId || rule?.media_settings?.image_source?.collection_id || null;

      const { images: selectedImages, guidance: imageDetails } = await resolveImages({
        manualImageIds: imageIds,
        collectionId,
        requestedCount: requestedImageCount,
        tagFilters,
        userId,
      });

      const aiConfigured = Boolean(config.ai.baseUrl && config.ai.apiKey && config.ai.chatModel);
      let generatedContent = null;
      let fallbackReason = null;

      if (!aiConfigured) {
        fallbackReason = 'AI service is not configured.';
        logger.warn('AI configuration missing. Falling back to templated content.', {
          jobId: job.id,
          userId,
        });
      } else {
        await job.updateProgress({ stage: 'building_prompt', percent: 45 });
        const prompt = composeContentPrompt({
          keyword,
          rule,
          knowledgeBaseContent,
          imageDetails,
          schemaConfig: mergedSchemaConfig,
          entitySchemaData: resolvedSchemaEntities,
        });

        try {
          const isGemini = config.ai.provider === 'gemini';
          const payload = isGemini
            ? {
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: prompt }],
                  },
                ],
              }
            : {
                model: config.ai.chatModel,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a helpful content generation assistant that responds in JSON only.',
                  },
                  { role: 'user', content: prompt },
                ],
              };
          if (!isGemini && config.ai.useResponseFormat) {
            payload.response_format = { type: 'json_object' };
          }
          if (isGemini && config.ai.useResponseFormat) {
            payload.generation_config = {
              response_mime_type: 'application/json',
            };
          }

          const aiResponse = await aiClient.post(resolveChatPath(config.ai.chatPath), payload);
          await job.updateProgress({ stage: 'awaiting_ai_response', percent: 65 });

          try {
            const message = extractMessagePayload(aiResponse?.data);
            const sanitized = normalizeJsonContent(message);
            logger.info('Sanitized AI response', { jobId: job.id, sanitized });
            try {
              generatedContent = sanitized ? JSON.parse(sanitized) : null;
            } catch (e) {
              logger.error('Failed to parse sanitized JSON', { jobId: job.id, sanitized, error: e.message });
              throw new Error('Failed to parse AI response');
            }
          } catch (parseErr) {
            fallbackReason = 'AI response parsing failed.';
            logger.error('Failed to parse AI response', {
              error: parseErr.message,
              jobId: job.id,
              response: aiResponse.data,
            });
          }
        } catch (aiErr) {
          fallbackReason = aiErr?.response?.data?.error?.message || aiErr.message || 'AI request failed.';
          logger.error('AI request failed, falling back to templated content', {
            error: fallbackReason,
            jobId: job.id,
            userId,
          });
        }
      }

      const safeContent = ensureStructuredContent(generatedContent, keyword, rule, knowledgeBaseContent, selectedImages);

      safeContent.details = {
        ...(safeContent.details || {}),
        knowledgeBase: {
          includedSnippetCount: knowledgeBaseSnippets.length,
          retrievalMode: knowledgeBaseRetrievalMode,
          truncated: knowledgeBaseTruncated,
          originalCombinedLength: knowledgeBaseOriginalLength,
          includedLength: knowledgeBaseContent.length,
          chunkStats: knowledgeBaseChunkStats,
          snippets: knowledgeBaseSnippets,
          source: knowledgeSource || null,
        },
      };

      const { record: schemaPayloadRecord, types: schemaTypes } = processSchemaOutput({
        rawContent: generatedContent || safeContent,
        schemaConfig: mergedSchemaConfig,
        entitySchemaData: resolvedSchemaEntities,
      });

      if (schemaPayloadRecord?.fallback) {
        safeContent.details = {
          ...(safeContent.details || {}),
          schemaFallback: schemaPayloadRecord.fallback,
        };
      }
      if (schemaTypes && schemaTypes.length) {
        safeContent.details = {
          ...(safeContent.details || {}),
          schemaTypes,
        };
      }

      if (fallbackReason) {
        safeContent.details = {
          ...(safeContent.details || {}),
          fallbackReason,
        };
        await job.updateProgress({ stage: 'fallback', percent: 75, fallbackReason });
      }

      if (schemaPayloadRecord) {
        await job.updateProgress({
          stage: 'schema_processed',
          percent: fallbackReason ? 82 : 78,
          schemaTypes,
        });
      }

      await job.updateProgress({ stage: 'persisting', percent: fallbackReason ? 85 : 80 });
      const imageIdList =
        (selectedImages && selectedImages.length ? selectedImages.map((img) => img.id) : imageIds) || [];
      const schemaTypeArray = Array.isArray(schemaTypes) && schemaTypes.length ? schemaTypes : null;
      const schemaPayloadForInsert = schemaPayloadRecord || null;
      const persisted = await db.withTransaction(async (client) => {
        const insert = await client.query(
          `INSERT INTO generated_content
            (user_id, rule_id, title, meta_description, body, image_ids, schema_payload, schema_types)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            userId,
            ruleId || null,
            safeContent.title,
            safeContent.meta_description,
            safeContent.body,
            imageIdList,
            schemaPayloadForInsert,
            schemaTypeArray,
          ]
        );
        return insert.rows[0];
      });

      await job.updateProgress({ stage: 'completed', percent: 100, fallback: Boolean(fallbackReason) });
      logger.info(`Job ${job.id} completed successfully.`);
      return {
        ...persisted,
        fallbackReason,
        knowledgeSource,
        selectedImages: selectedImages.map((img) => ({
          id: img.id,
          image_name: img.image_name,
          image_path: img.image_path,
          tags: img.tags,
        })),
      };
    } catch (err) {
      try {
        await job.updateProgress({ stage: 'failed', percent: 100, error: err.message });
      } catch (progressErr) {
        logger.warn('Failed to update job progress after error', {
          jobId: job.id,
          error: progressErr.message,
        });
      }
      logger.error(`Job ${job.id} failed`, {
        error: err.message,
        jobId: job.id,
        userId,
        stack: err.stack,
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: config.queue.concurrency,
    lockDuration: config.queue.timeoutMs,
  }
);

worker.on('failed', (job, err) => {
  logger.error('Content generation job failed', {
    jobId: job.id,
    error: err.message,
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('Content generation job stalled', { jobId });
});

worker.on('completed', (job) => {
  logger.info('Content generation job completed', { jobId: job.id });
});

logger.info('Worker started...');
