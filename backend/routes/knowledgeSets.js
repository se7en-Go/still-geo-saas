const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, knowledgeSetSchemas } = require('../validation');
const AppError = require('../utils/appError');

const router = express.Router();

router.use(auth);

function buildSearchClause(search, baseIndex = 2) {
  if (!search) {
    return { clause: '', params: [] };
  }
  return {
    clause: ` AND LOWER(ks.name) LIKE $${baseIndex}`,
    params: [`%${search.toLowerCase()}%`],
  };
}

router.get('/', async (req, res, next) => {
  const userId = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
  const search = (req.query.search || '').trim();

  try {
    const { clause, params: searchParams } = buildSearchClause(search, 2);
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM knowledge_sets ks
       WHERE ks.user_id = $1${clause}`,
      [userId, ...searchParams]
    );
    const total = Number(countResult.rows[0]?.total || 0);

    const dataResult = await db.query(
      `
        SELECT
          ks.id,
          ks.name,
          ks.description,
          ks.schema_metadata,
          ks.is_default,
          ks.created_at,
          COALESCE(doc_counts.document_count, 0)::int AS document_count,
          COALESCE(chunk_counts.chunk_count, 0)::int AS chunk_count
        FROM knowledge_sets ks
        LEFT JOIN (
          SELECT knowledge_set_id, COUNT(*)::int AS document_count
          FROM documents
          GROUP BY knowledge_set_id
        ) doc_counts ON doc_counts.knowledge_set_id = ks.id
        LEFT JOIN (
          SELECT d.knowledge_set_id, COUNT(dc.id)::int AS chunk_count
          FROM documents d
          JOIN document_chunks dc ON dc.document_id = d.id
          GROUP BY d.knowledge_set_id
        ) chunk_counts ON chunk_counts.knowledge_set_id = ks.id
        WHERE ks.user_id = $1${clause}
        ORDER BY ks.is_default DESC, ks.created_at DESC
        LIMIT $${searchParams.length + 2} OFFSET $${searchParams.length + 3};
      `,
      [userId, ...searchParams, pageSize, (page - 1) * pageSize]
    );

    res.json({
      items: dataResult.rows,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    next(new AppError('Failed to fetch knowledge sets.', 500, { userId, error: err.message }));
  }
});

router.post('/', validate(knowledgeSetSchemas.create), async (req, res, next) => {
  const userId = req.user.id;
  const { name, description, schemaMetadata } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO knowledge_sets (user_id, name, description, schema_metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, schema_metadata, is_default, created_at`,
      [userId, name.trim(), description || null, schemaMetadata || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    const code = err.code === '23505' ? 409 : 500;
    const message = err.code === '23505' ? 'Knowledge set with the same name already exists.' : 'Failed to create knowledge set.';
    next(new AppError(message, code, { userId, error: err.message }));
  }
});

router.put('/:id', validate(knowledgeSetSchemas.update), async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { name, description, schemaMetadata } = req.body;

  try {
    const existing = await db.query('SELECT * FROM knowledge_sets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (existing.rows.length === 0) {
      return next(new AppError('Knowledge set not found or user not authorized.', 404));
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (name != null) {
      updates.push(`name = $${idx++}`);
      values.push(name.trim());
    }

    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description || null);
    }

    if (schemaMetadata !== undefined) {
      updates.push(`schema_metadata = $${idx++}`);
      values.push(schemaMetadata || null);
    }

    if (!updates.length) {
      return res.json(existing.rows[0]);
    }

    values.push(id, userId);
    const result = await db.query(
      `
        UPDATE knowledge_sets
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${idx++} AND user_id = $${idx}
        RETURNING id, name, description, schema_metadata, is_default, created_at
      `,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    const code = err.code === '23505' ? 409 : 500;
    const message = err.code === '23505' ? 'Knowledge set with the same name already exists.' : 'Failed to update knowledge set.';
    next(new AppError(message, code, { userId, setId: id, error: err.message }));
  }
});

router.delete('/:id', async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const setResult = await db.query('SELECT id, is_default FROM knowledge_sets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (setResult.rows.length === 0) {
      return next(new AppError('Knowledge set not found or user not authorized.', 404));
    }
    if (setResult.rows[0].is_default) {
      return next(new AppError('Default knowledge set cannot be deleted.', 400));
    }

    const docCountResult = await db.query(
      'SELECT COUNT(*)::int AS doc_count FROM documents WHERE knowledge_set_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (Number(docCountResult.rows[0]?.doc_count || 0) > 0) {
      return next(new AppError('Cannot delete knowledge set with existing documents. Please move documents first.', 400));
    }

    await db.query('DELETE FROM knowledge_sets WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json({ msg: 'Knowledge set deleted successfully.' });
  } catch (err) {
    next(new AppError('Failed to delete knowledge set.', 500, { userId, setId: id, error: err.message }));
  }
});

module.exports = router;
