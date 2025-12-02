const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { config } = require('../config');

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
]);

const PDF_EXTENSIONS = new Set(['.pdf']);
const DOCX_EXTENSIONS = new Set(['.docx']);

const TEXT_MIME_PREFIXES = ['text/'];
const PDF_MIME_TYPES = new Set(['application/pdf']);
const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const sanitizeText = (value) =>
  (value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const isBinaryBuffer = (buffer) => {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  const sampleLength = Math.min(buffer.length, 2048);
  let suspicious = 0;

  for (let i = 0; i < sampleLength; i += 1) {
    const byte = buffer[i];
    if (byte === 0) {
      return true;
    }
    if ((byte < 7 && byte !== 9 && byte !== 10) || (byte > 13 && byte < 32) || byte === 127) {
      suspicious += 1;
    }
  }

  return suspicious / sampleLength > 0.3;
};

const readBuffer = async ({ buffer, filePath }) => {
  if (buffer) {
    return buffer;
  }
  if (!filePath) {
    return null;
  }
  return fs.promises.readFile(filePath);
};

const extractPdfText = async (buffer) => {
  const result = await pdfParse(buffer);
  return typeof result.text === 'string' ? result.text : '';
};

const extractDocxText = async (buffer) => {
  const { value } = await mammoth.extractRawText({ buffer });
  return typeof value === 'string' ? value : '';
};

function isTextFileExtension(ext) {
  return TEXT_EXTENSIONS.has(ext);
}

function isPdfExtension(ext) {
  return PDF_EXTENSIONS.has(ext);
}

function isDocxExtension(ext) {
  return DOCX_EXTENSIONS.has(ext);
}

function isTextMime(mimetype = '') {
  return TEXT_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix));
}

function isPdfMime(mimetype = '') {
  return PDF_MIME_TYPES.has(mimetype);
}

function isDocxMime(mimetype = '') {
  return DOCX_MIME_TYPES.has(mimetype);
}

async function callDeepseekOcr(buffer, { originalName, mimetype }) {
  if (!buffer || !config.ocr?.enabled || config.ocr?.provider !== 'deepseek') {
    return null;
  }

  if (!config.ocr.baseUrl || !config.ocr.apiKey) {
    return null;
  }

  const endpoint = config.ocr.endpoint
    ? config.ocr.endpoint.startsWith('/')
      ? config.ocr.endpoint
      : `/${config.ocr.endpoint}`
    : '/v1/chat/completions';

  const url = `${config.ocr.baseUrl}${endpoint}`;
  const base64 = buffer.toString('base64');

  const dataUrl = `data:${mimetype || 'application/octet-stream'};base64,${base64}`;
  const payload = {
    model: config.ocr.model,
    messages: [
      {
        role: 'user',
        content: '请识别图片中的所有文字并输出纯文本。',
      },
    ],
    input_images: [
      {
        image_url: {
          url: dataUrl,
        },
      },
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.ocr.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: config.ocr.timeoutMs,
    });

    const choice = response?.data?.choices?.[0];
    const messageContent = choice?.message?.content;
    const normalized = sanitizeText(
      Array.isArray(messageContent)
        ? messageContent
            .map((item) => {
              if (!item) return '';
              if (typeof item === 'string') return item;
              if (typeof item.text === 'string') return item.text;
              if (typeof item.value === 'string') return item.value;
              return '';
            })
            .filter(Boolean)
            .join('\n')
        : typeof messageContent === 'string'
        ? messageContent
        : messageContent?.text || ''
    );

    if (normalized) {
      return normalized;
    }

    return {
      error: 'OCR response did not contain text content.',
    };
  } catch (err) {
    return {
      error: err.response ? err.response.data : err.message,
    };
  }
}

async function extractDocumentText({ buffer, filePath, originalName = '', mimetype = '' }) {
  const result = {
    text: '',
    mode: 'unknown',
    warnings: [],
  };

  const ext = path.extname(originalName || '').toLowerCase();
  const fileBuffer = await readBuffer({ buffer, filePath });

  if (!fileBuffer || fileBuffer.length === 0) {
    result.mode = 'empty';
    result.warnings.push('Document buffer is empty.');
    return result;
  }

  const maybeBinary = isBinaryBuffer(fileBuffer);

  const attemptOcr = async () => {
    if (!config.ocr?.enabled) {
      return false;
    }
    const ocrResult = await callDeepseekOcr(fileBuffer, { originalName, mimetype });
    if (typeof ocrResult === 'string' && ocrResult.trim()) {
      result.text = ocrResult;
      result.mode = 'ocr';
      return true;
    }
    if (ocrResult?.error) {
      result.warnings.push(`OCR error: ${ocrResult.error}`);
    }
    return false;
  };

  try {
    if (isPdfExtension(ext) || isPdfMime(mimetype)) {
      const text = await extractPdfText(fileBuffer);
      const cleaned = sanitizeText(text);
      if (cleaned) {
        result.text = cleaned;
        result.mode = 'pdf';
        return result;
      }
      const ocrApplied = await attemptOcr();
      if (ocrApplied) {
        return result;
      }
    } else if (isDocxExtension(ext) || isDocxMime(mimetype)) {
      result.text = sanitizeText(await extractDocxText(fileBuffer));
      result.mode = 'docx';
      return result;
    } else if (isTextFileExtension(ext) || isTextMime(mimetype)) {
      result.text = sanitizeText(fileBuffer.toString('utf8'));
      result.mode = 'text';
      return result;
    } else if (!maybeBinary) {
      const asText = sanitizeText(fileBuffer.toString('utf8'));
      if (asText) {
        result.text = asText;
        result.mode = 'converted';
        return result;
      }
    }

    // If we got here, treat as binary and try OCR if possible
    result.mode = 'binary';
    result.warnings.push('Document appears to be binary and is not supported for text extraction.');
    const ocrApplied = await attemptOcr();
    if (ocrApplied) {
      return result;
    }
    return result;
  } catch (err) {
    result.mode = 'error';
    result.warnings.push(err.message || 'Failed to extract document text.');
    const ocrApplied = await attemptOcr();
    if (ocrApplied) {
      return result;
    }
    return result;
  }
}

module.exports = {
  extractDocumentText,
  sanitizeText,
};
