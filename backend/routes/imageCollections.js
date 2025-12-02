const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, imageCollectionSchemas } = require('../validation');
const AppError = require('../utils/appError');
const logger = require('../logger');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  const { search } = req.query;
  const values = [req.user.id];
  const conditions = ['ic.user_id = $1'];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`ic.name ILIKE $${values.length}`);
  }

  try {
    const collections = await db.query(
      `
        SELECT ic.*, COALESCE(img_counts.count, 0) AS image_count
        FROM public.image_collections ic
        LEFT JOIN (
          SELECT collection_id, COUNT(*) AS count
          FROM public.images
          WHERE user_id = $1
          GROUP BY collection_id
        ) img_counts ON img_counts.collection_id = ic.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ic.created_at DESC, ic.id DESC
      `,
      values
    );

    const uncategorized = await db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM public.images WHERE user_id = $1 AND collection_id IS NULL',
      [req.user.id]
    );

    res.json({
      collections: collections.rows,
      uncategorizedCount: uncategorized.rows[0].count,
    });
  } catch (err) {
    logger.error('Failed to fetch image collections', { error: err, userId: req.user.id });
    next(new AppError('Failed to fetch image collections.', 500, { userId: req.user.id }));
  }
});

router.post('/', auth, validate(imageCollectionSchemas.create), async (req, res, next) => {
  const { name, description } = req.body;

  try {
    const result = await db.withTransaction(async (client) => {
      const insert = await client.query(
        `
          INSERT INTO public.image_collections (user_id, name, description)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [req.user.id, name, description || null]
      );
      return insert.rows[0];
    });

    res.status(201).json(result);
  } catch (err) {
    logger.error('Failed to create image collection', { error: err, userId: req.user.id });
    next(new AppError('Failed to create image collection.', 500, { userId: req.user.id }));
  }
});

router.put('/:id', auth, validate(imageCollectionSchemas.update), async (req, res, next) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const result = await db.withTransaction(async (client) => {
      const update = await client.query(
        `
          UPDATE public.image_collections
          SET
            name = COALESCE($1, name),
            description = COALESCE($2, description)
          WHERE id = $3 AND user_id = $4
          RETURNING *
        `,
        [name, description, id, req.user.id]
      );
      return update.rows[0];
    });

    if (!result) {
      return next(new AppError('Image collection not found or user not authorized.', 404, { collectionId: id }));
    }

    res.json(result);
  } catch (err) {
    logger.error('Failed to update image collection', { error: err, userId: req.user.id, collectionId: id });
    next(new AppError('Failed to update image collection.', 500, { userId: req.user.id, collectionId: id }));
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  const { id } = req.params;

  try {
    await db.withTransaction(async (client) => {
      await client.query(
        `
          UPDATE public.images
          SET collection_id = NULL
          WHERE collection_id = $1 AND user_id = $2
        `,
        [id, req.user.id]
      );

      const deleted = await client.query(
        'DELETE FROM public.image_collections WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.user.id]
      );

      if (deleted.rows.length === 0) {
        throw new AppError('Image collection not found or user not authorized.', 404, { collectionId: id });
      }
    });

    res.json({ msg: 'Image collection deleted successfully.' });
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    logger.error('Failed to delete image collection', { error: err, userId: req.user.id, collectionId: id });
    next(new AppError('Failed to delete image collection.', 500, { userId: req.user.id, collectionId: id }));
  }
});

module.exports = router;
