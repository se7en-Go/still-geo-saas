const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, documentSchemas } = require('../validation');
const axios = require('axios');
const logger = require('../logger');
const AppError = require('../utils/appError');

const { config } = require('../config');
const { extractDocumentText, sanitizeText } = require('../utils/documentParser');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '-' + originalname);
  },
});

const upload = multer({
  storage: storage,
});

async function ensureDefaultKnowledgeSet(userId) {
  const existing = await db.query(
    'SELECT id FROM knowledge_sets WHERE user_id = $1 AND is_default = true LIMIT 1',
    [userId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const created = await db.query(
    `INSERT INTO knowledge_sets (user_id, name, description, is_default)
     VALUES ($1, $2, $3, true)
     RETURNING id`,
    [userId, 'Default Knowledge Set', 'System generated default knowledge set']
  );
  return created.rows[0].id;
}

async function resolveKnowledgeSetId(userId, knowledgeSetId) {
  if (knowledgeSetId) {
    const result = await db.query(
      'SELECT id FROM knowledge_sets WHERE id = $1 AND user_id = $2',
      [knowledgeSetId, userId]
    );
    if (result.rows.length === 0) {
      throw new AppError('Knowledge set not found or user not authorized.', 404);
    }
    return result.rows[0].id;
  }
  return ensureDefaultKnowledgeSet(userId);
}

// AI Client for Embeddings
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

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_PER_DOCUMENT = 256;
const EMBEDDING_BATCH_SIZE = 16;

const vectorLiteral = (values) => (Array.isArray(values) ? `[${values.join(',')}]` : null);

const splitIntoChunks = (raw) => {
  const sanitized = sanitizeText(raw);
  if (!sanitized) {
    return [];
  }

  const text = sanitized;
  if (!text) {
    return [];
  }

  const chunks = [];
  let start = 0;
  let chunkCount = 0;

  while (start < text.length && chunkCount < MAX_CHUNKS_PER_DOCUMENT) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    if (end < text.length) {
      const newlineIndex = text.lastIndexOf('\n', end);
      if (newlineIndex > start + CHUNK_SIZE * 0.5) {
        end = newlineIndex;
      } else {
        const spaceIndex = text.lastIndexOf(' ', end);
        if (spaceIndex > start + CHUNK_SIZE * 0.5) {
          end = spaceIndex;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
      chunkCount += 1;
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = end - CHUNK_OVERLAP;
    start = Math.max(nextStart, start + 1);
  }

  if (chunks.length === 0 && text) {
    chunks.push(text.slice(0, CHUNK_SIZE));
  }

  return chunks;
};

const generateChunkEmbeddings = async (chunks) => {
  if (!embeddingConfigured || !embeddingClient || chunks.length === 0) {
    return Array(chunks.length).fill(null);
  }

  const embeddings = [];

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    try {
      const response = await embeddingClient.post('/v1/embeddings', {
        model: config.ai.embeddingModel,
        input: batch,
      });
      const vectors = response?.data?.data || [];
      vectors.forEach((item, index) => {
        embeddings.push(item?.embedding || null);
      });
      if (vectors.length < batch.length) {
        const missing = batch.length - vectors.length;
        embeddings.push(...Array(missing).fill(null));
      }
    } catch (err) {
      logger.warn('Failed to generate embeddings for chunk batch', {
        error: err.response ? err.response.data : err.message,
        batchStart: i,
      });
      embeddings.push(...Array(batch.length).fill(null));
    }
  }

  if (embeddings.length > chunks.length) {
    embeddings.length = chunks.length;
  } else if (embeddings.length < chunks.length) {
    embeddings.push(...Array(chunks.length - embeddings.length).fill(null));
  }

  return embeddings;
};

// Upload a document
router.post('/upload', auth, upload.single('document'), async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded.', 400));
  }

  const rawKnowledgeSetId = req.body?.knowledgeSetId;
  let knowledgeSetId = null;
  if (rawKnowledgeSetId !== undefined && rawKnowledgeSetId !== null && rawKnowledgeSetId !== '') {
    const parsed = Number(rawKnowledgeSetId);
    if (Number.isNaN(parsed)) {
      return next(new AppError('Invalid knowledge set specified.', 400));
    }
    knowledgeSetId = parsed;
  }

  const { filename: storedFilename } = req.file;
  const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const storedPath = path.posix.join('uploads', storedFilename);
  const absolutePath = path.join(uploadsDir, storedFilename);

  try {
    const resolvedKnowledgeSetId = await resolveKnowledgeSetId(req.user.id, knowledgeSetId);
    const fileBuffer = await fs.promises.readFile(absolutePath);
    const parseResult = await extractDocumentText({
      buffer: fileBuffer,
      filePath: absolutePath,
      originalName: originalname,
      mimetype: req.file.mimetype,
    });

    if (parseResult.warnings && parseResult.warnings.length > 0) {
      parseResult.warnings.forEach((warning) => {
        logger.warn('Document parsing warning', {
          warning,
          fileName: originalname,
          userId: req.user.id,
          mode: parseResult.mode,
        });
      });
    }

    let sourceContent = parseResult.text;
    if (parseResult.mode === 'binary' || parseResult.mode === 'error') {
      sourceContent = '';
    }

    const sanitizedContent = sanitizeText(sourceContent);
    let chunks = [];
    let chunkEmbeddings = [];
    let hasChunkEmbeddings = false;
    let documentEmbedding = null;
    let chunkingMode = parseResult.mode || 'unknown';

    if (sanitizedContent) {
      chunks = splitIntoChunks(sanitizedContent);
      chunkEmbeddings = await generateChunkEmbeddings(chunks);
      hasChunkEmbeddings = chunkEmbeddings.some((vector) => Array.isArray(vector) && vector.length > 0);
      documentEmbedding = hasChunkEmbeddings
        ? chunkEmbeddings.find((vector) => Array.isArray(vector) && vector.length > 0)
        : null;
      chunkingMode = chunks.length > 0 ? chunkingMode : 'empty';

      if (chunks.length === MAX_CHUNKS_PER_DOCUMENT && sanitizedContent.length > CHUNK_SIZE * MAX_CHUNKS_PER_DOCUMENT) {
        logger.warn('Document content truncated due to chunk limit', {
          fileName: originalname,
          userId: req.user.id,
          chunkCount: chunks.length,
          maxChunks: MAX_CHUNKS_PER_DOCUMENT,
          originalLength: sanitizedContent.length,
        });
      }
    } else if (chunkingMode === 'unknown') {
      chunkingMode = parseResult.mode || 'empty';
    }

    if (parseResult.mode === 'binary') {
      logger.warn('Document treated as binary; skipping chunking and embeddings', {
        fileName: originalname,
        userId: req.user.id,
      });
      chunkingMode = 'binary';
    }

    if (chunks.length === 0) {
      chunkEmbeddings = [];
    } else if (chunkEmbeddings.length !== chunks.length) {
      const missingCount = chunks.length - chunkEmbeddings.length;
      if (missingCount > 0) {
        chunkEmbeddings.push(...Array(missingCount).fill(null));
      }
      if (chunkEmbeddings.length > chunks.length) {
        chunkEmbeddings.length = chunks.length;
      }
    }

    const persisted = await db.withTransaction(async (client) => {
      const embeddingVector = vectorLiteral(documentEmbedding);
      const insertDocumentSql = embeddingVector
        ? `INSERT INTO public.documents (user_id, knowledge_set_id, file_name, file_path, embedding)
            VALUES ($1, $2, $3, $4, $5::vector)
            RETURNING *`
        : `INSERT INTO public.documents (user_id, knowledge_set_id, file_name, file_path, embedding)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`;

      const documentResult = await client.query(insertDocumentSql, [
        req.user.id,
        resolvedKnowledgeSetId,
        originalname,
        storedPath,
        embeddingVector,
      ]);

      const document = documentResult.rows[0];

      if (chunks.length > 0) {
        const chunkSqlWithEmbedding = `INSERT INTO public.document_chunks (document_id, user_id, chunk_index, content, embedding)
          VALUES ($1, $2, $3, $4, $5::vector)`;
        const chunkSqlWithoutEmbedding = `INSERT INTO public.document_chunks (document_id, user_id, chunk_index, content, embedding)
          VALUES ($1, $2, $3, $4, $5)`;

        for (let index = 0; index < chunks.length; index += 1) {
          const chunkContent = chunks[index];
          const chunkEmbedding = vectorLiteral(chunkEmbeddings[index]);
          const params = [
            document.id,
            req.user.id,
            index,
            chunkContent,
            chunkEmbedding,
          ];
          await client.query(
            chunkEmbedding ? chunkSqlWithEmbedding : chunkSqlWithoutEmbedding,
            params
          );
        }
      }

      return {
        document,
        chunkCount: chunks.length,
        embeddingCount: chunkEmbeddings.filter((vector) => Array.isArray(vector) && vector.length > 0).length,
        hasChunkEmbeddings,
        chunkingMode,
      };
    });

    const response = {
      ...persisted.document,
      chunk_count: persisted.chunkCount,
      chunk_embedding_count: persisted.embeddingCount,
      chunking_mode: persisted.chunkingMode,
      embedding_status:
        persisted.hasChunkEmbeddings
          ? 'success'
          : persisted.chunkCount > 0
          ? embeddingConfigured
            ? 'failed'
            : 'partial'
          : 'skipped',
    };

    res.json(response);
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    logger.error('Failed to upload document', { error: err.message, userId: req.user.id });
    next(new AppError('Failed to upload document.', 500, { userId: req.user.id }));
  }
});

// Get all documents for the logged-in user
router.get('/', auth, async (req, res, next) => {
  try {
    const { knowledgeSetId } = req.query;
    let knowledgeSetFilterId = null;
    if (knowledgeSetId !== undefined) {
      const parsed = Number(knowledgeSetId);
      if (Number.isNaN(parsed)) {
        return next(new AppError('Invalid knowledge set filter.', 400));
      }
      knowledgeSetFilterId = parsed;
    }
    const params = [req.user.id];
    const filters = ['d.user_id = $1'];
    if (knowledgeSetFilterId !== null) {
      params.push(knowledgeSetFilterId);
      filters.push(`d.knowledge_set_id = $${params.length}`);
    }
    const documents = await db.query(
      `
        SELECT
          d.id,
          d.file_name,
          d.file_path,
          d.created_at,
          d.schema_metadata,
          d.knowledge_set_id,
          ks.name AS knowledge_set_name,
          ks.is_default AS knowledge_set_is_default,
          COALESCE(COUNT(dc.id), 0) AS chunk_count,
          COALESCE(SUM(CASE WHEN dc.embedding IS NOT NULL THEN 1 ELSE 0 END), 0) AS chunk_embedding_count
        FROM public.documents d
        LEFT JOIN public.document_chunks dc ON dc.document_id = d.id
        LEFT JOIN knowledge_sets ks ON ks.id = d.knowledge_set_id
        WHERE ${filters.join(' AND ')}
        GROUP BY d.id, d.knowledge_set_id, ks.name, ks.is_default
        ORDER BY d.created_at DESC
      `,
      params
    );

    const results = documents.rows.map((doc) => {
      const chunkCount = Number(doc.chunk_count || 0);
      const chunkEmbeddingCount = Number(doc.chunk_embedding_count || 0);
      let embeddingStatus = 'skipped';
      if (chunkCount > 0) {
        embeddingStatus = chunkEmbeddingCount > 0 ? 'success' : embeddingConfigured ? 'failed' : 'skipped';
      }

      return {
        id: doc.id,
        file_name: doc.file_name,
        file_path: doc.file_path,
        created_at: doc.created_at,
        schema_metadata: doc.schema_metadata || null,
        knowledge_set_id: doc.knowledge_set_id || null,
        knowledge_set_name: doc.knowledge_set_name || null,
        knowledge_set_is_default: Boolean(doc.knowledge_set_is_default),
        chunk_count: chunkCount,
        chunk_embedding_count: chunkEmbeddingCount,
        embedding_status: embeddingStatus,
      };
    });
    res.json(results);
  } catch (err) {
    logger.error('Failed to fetch documents', { error: err, userId: req.user.id });
    next(new AppError('Failed to fetch documents.', 500, { userId: req.user.id }));
  }
});

// Delete a document
router.delete('/:id', auth, async (req, res, next) => {
  const { id } = req.params;

  try {
    // First, get the file path to delete it from the filesystem
    const docResult = await db.query('SELECT file_path FROM public.documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);

    if (docResult.rows.length === 0) {
      return next(new AppError('Document not found or user not authorized.', 404));
    }

    const filePath = docResult.rows[0].file_path;
    logger.info('Attempting to delete file with path from DB:', { filePath });

    // Delete the file
    if (filePath) {
      try {
        const absoluteFilePath = path.resolve(__dirname, '..', filePath);
        logger.info('Constructed absolute file path for deletion:', { absoluteFilePath });
        await fs.promises.unlink(absoluteFilePath);
      } catch (fsErr) {
        // Log the error but don't block deletion from DB if file is already gone
        logger.warn(`Failed to delete file from filesystem: ${filePath}`, { error: fsErr });
      }
    }

    // Then, delete the record from the database
    await db.query('DELETE FROM public.documents WHERE id = $1 AND user_id = $2', [id, req.user.id]);

    res.json({ msg: 'Document deleted successfully.' });
  } catch (err) {
    logger.error('Failed to delete document', { error: err, documentId: id, userId: req.user.id });
    next(new AppError('Failed to delete document.', 500, { documentId: id, userId: req.user.id }));
  }
});

router.put(
  '/:id/knowledge-set',
  auth,
  validate(documentSchemas.updateKnowledgeSet),
  async (req, res, next) => {
    const { id } = req.params;
    const { knowledgeSetId } = req.body;
    try {
      const resolvedKnowledgeSetId = await resolveKnowledgeSetId(req.user.id, knowledgeSetId);
      const result = await db.query(
        `UPDATE public.documents
         SET knowledge_set_id = $1
         WHERE id = $2 AND user_id = $3
         RETURNING id, file_name, knowledge_set_id`,
        [resolvedKnowledgeSetId, id, req.user.id]
      );
      if (result.rows.length === 0) {
        return next(new AppError('Document not found or user not authorized.', 404));
      }
      res.json(result.rows[0]);
    } catch (err) {
      if (err instanceof AppError) {
        return next(err);
      }
      logger.error('Failed to update document knowledge set', {
        error: err.message,
        documentId: id,
        userId: req.user.id,
      });
      next(new AppError('Failed to update document knowledge set.', 500));
    }
  }
);

router.put(
  '/:id/schema',
  auth,
  validate(documentSchemas.updateSchemaMetadata),
  async (req, res, next) => {
    const { id } = req.params;
    const { schemaMetadata } = req.body;

    try {
      const result = await db.query(
        `UPDATE public.documents
         SET schema_metadata = $1
         WHERE id = $2 AND user_id = $3
         RETURNING id, file_name, schema_metadata`,
        [schemaMetadata, id, req.user.id]
      );

      if (result.rows.length === 0) {
        return next(new AppError('Document not found or user not authorized.', 404));
      }

      res.json(result.rows[0]);
    } catch (err) {
      logger.error('Failed to update document schema metadata', {
        error: err.message,
        documentId: id,
        userId: req.user.id,
      });
      next(new AppError('Failed to update document schema metadata.', 500));
    }
  }
);

module.exports = router;
