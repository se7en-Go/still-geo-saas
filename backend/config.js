const fs = require('fs');
const path = require('path');

const REQUIRED_ENV_VARS = [
  'DB_USER',
  'DB_HOST',
  'DB_DATABASE',
  'DB_PASSWORD',
  'DB_PORT',
  'JWT_SECRET',
];

const DEFAULTS = {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
  server: {
    port: 3001,
  },
  queue: {
    attempts: 3,
    backoffMs: 2000,
    timeoutMs: 60000,
  },
};

function coerceNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const raw = process.env[key];
    return raw === undefined || raw === null || raw === '';
  });

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    throw new Error(message);
  }

  const warnings = [];

  const optionalVars = [
    'AI_API_BASE_URL',
    'AI_API_KEY',
    'CHAT_COMPLETION_MODEL',
    'EMBEDDING_MODEL',
  'AI_CHAT_COMPLETION_PATH',
  'AI_USE_RESPONSE_FORMAT',
  'AI_PROVIDER',
  'REDIS_HOST',
  'REDIS_PORT',
  'KEYWORD_CACHE_TTL_MS',
  'KEYWORD_CACHE_MAX_ENTRIES',
];

  optionalVars
    .filter((key) => !process.env[key])
    .forEach((key) => {
      warnings.push(`Environment variable ${key} is not set. Related features may be limited.`);
    });

  const numericEnvChecks = [
    { key: 'PORT', min: 1, max: 65535 },
    { key: 'DB_PORT', min: 1, max: 65535 },
    { key: 'REDIS_PORT', min: 1, max: 65535 },
    { key: 'AI_REQUEST_TIMEOUT_MS', min: 1000 },
    { key: 'CONTENT_QUEUE_ATTEMPTS', min: 1 },
    { key: 'CONTENT_QUEUE_BACKOFF_MS', min: 0 },
    { key: 'CONTENT_QUEUE_TIMEOUT_MS', min: 1000 },
    { key: 'CONTENT_QUEUE_CONCURRENCY', min: 1 },
  ];

  numericEnvChecks.forEach(({ key, min, max }) => {
    const raw = process.env[key];
    if (!raw) {
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${key} must be a numeric value.`);
    }
    if (typeof min === 'number' && parsed < min) {
      throw new Error(`${key} must be greater than or equal to ${min}.`);
    }
    if (typeof max === 'number' && parsed > max) {
      throw new Error(`${key} must be less than or equal to ${max}.`);
    }
  });

  if (process.env.AI_API_BASE_URL) {
    try {
      // eslint-disable-next-line no-new
      new URL(process.env.AI_API_BASE_URL);
    } catch (_err) {
      warnings.push('AI_API_BASE_URL is not a valid URL. AI services may fail to initialize.');
    }

    if (!process.env.AI_API_KEY || !process.env.CHAT_COMPLETION_MODEL) {
      warnings.push('AI API credentials are incomplete. Keyword expansion and content generation will fall back to defaults.');
    }
  } else if (process.env.AI_API_KEY || process.env.CHAT_COMPLETION_MODEL) {
    warnings.push('AI API credentials are set but AI_API_BASE_URL is missing. AI requests will not be sent.');
  }

  if (!process.env.REDIS_HOST) {
    warnings.push('REDIS_HOST is not defined; falling back to localhost.');
  }

  if (asBoolean(process.env.OCR_ENABLED, false)) {
    if (!process.env.OCR_BASE_URL) {
      warnings.push('OCR is enabled but OCR_BASE_URL is not set.');
    }
    if (!process.env.OCR_API_KEY) {
      warnings.push('OCR is enabled but OCR_API_KEY is not set.');
    }
  }

  return warnings;
}

function ensureDirectories() {
  const uploadDir = path.join(__dirname, 'uploads');
  const logDir = path.join(__dirname, '..', 'logs');
  const created = [];

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    created.push(uploadDir);
  }

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    created.push(logDir);
  }

  return { uploadDir, logDir, created };
}

const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const rawUseResponseFormat = process.env.AI_USE_RESPONSE_FORMAT;
const defaultUseResponseFormat = provider === 'openai';

const config = {
  server: {
    port: coerceNumber(process.env.PORT, DEFAULTS.server.port),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: process.env.JWT_EXPIRY || '1h',
    allowRegistration: asBoolean(process.env.ALLOW_USER_REGISTRATION, false),
  },
  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: coerceNumber(process.env.DB_PORT, 5432),
  },
  redis: {
    host: process.env.REDIS_HOST || DEFAULTS.redis.host,
    port: coerceNumber(process.env.REDIS_PORT, DEFAULTS.redis.port),
    password: process.env.REDIS_PASSWORD,
  },
  ai: {
    provider,
    baseUrl: process.env.AI_API_BASE_URL,
    apiKey: process.env.AI_API_KEY,
    embeddingBaseUrl: process.env.EMBEDDING_API_BASE_URL,
    embeddingApiKey: process.env.EMBEDDING_API_KEY,
    chatModel: process.env.CHAT_COMPLETION_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL,
    requestTimeoutMs: coerceNumber(process.env.AI_REQUEST_TIMEOUT_MS, DEFAULTS.queue.timeoutMs),
    chatPath: process.env.AI_CHAT_COMPLETION_PATH || '/chat/completions',
    useResponseFormat:
      rawUseResponseFormat !== undefined
        ? asBoolean(rawUseResponseFormat, defaultUseResponseFormat)
        : defaultUseResponseFormat,
  },
  queue: {
    attempts: coerceNumber(process.env.CONTENT_QUEUE_ATTEMPTS, DEFAULTS.queue.attempts),
    backoffMs: coerceNumber(process.env.CONTENT_QUEUE_BACKOFF_MS, DEFAULTS.queue.backoffMs),
    timeoutMs: coerceNumber(process.env.CONTENT_QUEUE_TIMEOUT_MS, DEFAULTS.queue.timeoutMs),
    concurrency: coerceNumber(process.env.CONTENT_QUEUE_CONCURRENCY, 2),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  cache: {
    keywords: {
      ttlMs: coerceNumber(process.env.KEYWORD_CACHE_TTL_MS, 60000),
      maxEntries: coerceNumber(process.env.KEYWORD_CACHE_MAX_ENTRIES, 200),
    },
  },
  ocr: {
    enabled: asBoolean(process.env.OCR_ENABLED, false),
    provider: (process.env.OCR_PROVIDER || '').toLowerCase(),
    baseUrl: process.env.OCR_BASE_URL,
    apiKey: process.env.OCR_API_KEY,
    model: process.env.OCR_MODEL || 'deepseek-ai/DeepSeek-OCR',
    endpoint: process.env.OCR_ENDPOINT || '/v1/ocr',
    timeoutMs: coerceNumber(process.env.OCR_TIMEOUT_MS, 90000),
  },
};

module.exports = {
  validateEnvironment,
  ensureDirectories,
  config,
};
