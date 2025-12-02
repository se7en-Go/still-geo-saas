const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, imageSchemas } = require('../validation');
const logger = require('../logger');
const AppError = require('../utils/appError');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage: storage });

async function ensureCollectionAccess(collectionId, userId) {
  if (!collectionId) {
    return null;
  }
  const result = await db.query('SELECT id FROM public.image_collections WHERE id = $1 AND user_id = $2', [
    collectionId,
    userId,
  ]);
  if (result.rows.length === 0) {
    throw new AppError('Image collection not found.', 404, { collectionId, userId });
  }
  return collectionId;
}

// Upload an image
router.post('/upload', auth, upload.single('image'), async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded.', 400));
  }

  const { filename: storedFilename, originalname } = req.file;
  const storedPath = path.posix.join('uploads', storedFilename);
  const collectionId = req.body.collectionId ? parseInt(req.body.collectionId, 10) : null;

  try {
    if (collectionId) {
      await ensureCollectionAccess(collectionId, req.user.id);
    }

    const newImage = await db.withTransaction(async (client) => {
      const result = await client.query(
        'INSERT INTO public.images (user_id, image_name, image_path, collection_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.id, originalname, storedPath, collectionId]
      );
      return result.rows[0];
    });
    res.json(newImage);
  } catch (err) {
    logger.error('Failed to upload image', { error: err, userId: req.user.id });
    next(new AppError('Failed to upload image.', 500, { userId: req.user.id }));
  }
});

// Get all images for the logged-in user
router.get('/', auth, async (req, res, next) => {
  const { collectionId, search } = req.query;
  const rawTags = req.query.tags;
  const values = [req.user.id];
  const conditions = ['user_id = $1'];
  const tagFilters = Array.isArray(rawTags)
    ? rawTags.flatMap((tag) => tag.split(','))
    : typeof rawTags === 'string'
    ? rawTags.split(',')
    : [];
  const normalizedTags = tagFilters.map((tag) => tag.trim()).filter(Boolean);

  if (collectionId === 'uncategorized') {
    conditions.push('collection_id IS NULL');
  } else if (collectionId) {
    const parsed = parseInt(collectionId, 10);
    if (!Number.isNaN(parsed)) {
      values.push(parsed);
      conditions.push(`collection_id = $${values.length}`);
    }
  }

  if (search) {
    values.push(`%${search}%`);
    const idx = values.length;
    conditions.push(`(image_name ILIKE $${idx})`);
  }

  if (normalizedTags.length > 0) {
    values.push(normalizedTags);
    conditions.push(`tags && $${values.length}::text[]`);
  }

  try {
    const images = await db.query(`SELECT * FROM public.images WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, values);
    const normalized = images.rows.map((img) => ({
      ...img,
      image_path: img.image_path ? img.image_path.replace(/\\/g, '/') : img.image_path,
    }));
    res.json(normalized);
  } catch (err) {
    logger.error('Failed to fetch images', { error: err, userId: req.user.id });
    next(new AppError('Failed to fetch images.', 500, { userId: req.user.id }));
  }
});

// Update an image's metadata (name, tags)
router.put('/:id', auth, validate(imageSchemas.updateImage), async (req, res, next) => {
  const { id } = req.params;
  const { image_name, tags, collection_id } = req.body;

  try {
    if (collection_id !== undefined) {
      if (collection_id === null) {
        // allow clearing
      } else {
        await ensureCollectionAccess(collection_id, req.user.id);
      }
    }

    const updated = await db.withTransaction(async (client) => {
      const setParts = [
        'image_name = COALESCE($1, image_name)',
        'tags = COALESCE($2, tags)',
      ];
      const params = [image_name, tags, id, req.user.id];

      if (collection_id !== undefined) {
        setParts.push(`collection_id = $${params.length + 1}`);
        params.push(collection_id);
      }

      const query = `
        UPDATE public.images
        SET ${setParts.join(', ')}
        WHERE id = $3 AND user_id = $4
        RETURNING *
      `;

      const result = await client.query(query, params);
      return result.rows[0];
    });

    if (!updated) {
      return next(new AppError('Image not found or user not authorized.', 404, { imageId: id }));
    }

    res.json(updated);
  } catch (err) {
    logger.error('Failed to update image metadata', { error: err, imageId: id, userId: req.user.id });
    next(new AppError('Failed to update image.', 500, { imageId: id, userId: req.user.id }));
  }
});

// Delete an image
router.delete('/:id', auth, async (req, res, next) => {
  const { id } = req.params;

  try {
    // First, get the file path to delete it from the filesystem
    const imgResult = await db.query('SELECT image_path FROM public.images WHERE id = $1 AND user_id = $2', [id, req.user.id]);

    if (imgResult.rows.length === 0) {
      return next(new AppError('Image not found or user not authorized.', 404, { imageId: id }));
    }

    const filePath = imgResult.rows[0].image_path;

    // Delete the file
    if (filePath) {
      try {
        const absoluteFilePath = path.resolve(__dirname, '..', filePath);
        await fs.promises.unlink(absoluteFilePath);
      } catch (fsErr) {
        // Log the error but don't block deletion from DB if file is already gone
        logger.warn(`Failed to delete file from filesystem: ${filePath}`, { error: fsErr });
      }
    }

    // Then, delete the record from the database
    await db.query('DELETE FROM public.images WHERE id = $1 AND user_id = $2', [id, req.user.id]);

    res.json({ msg: 'Image deleted successfully.' });
  } catch (err) {
    logger.error('Failed to delete image', { error: err, imageId: id, userId: req.user.id });
    next(new AppError('Failed to delete image.', 500, { imageId: id, userId: req.user.id }));
  }
});

module.exports = router;
