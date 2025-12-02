const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, contentGenerationSchemas, contentScheduleSchemas } = require('../validation');
const { contentQueue } = require('../queue');
const AppError = require('../utils/appError');

const router = express.Router();

router.post('/generate', auth, validate(contentGenerationSchemas.generateContent), async (req, res, next) => {
  const {
    keyword,
    knowledgeBaseId,
    knowledgeSetId,
    imageIds,
    imageCollectionId,
    imageTags,
    imageCount,
    ruleId,
    schemaConfig,
    schemaEntities = {},
    schemaOverrides = null,
  } = req.body;
  const userId = req.user.id;

  if (knowledgeBaseId && knowledgeSetId) {
    return next(new AppError('Choose either a knowledge set or a single knowledge base document.', 400));
  }

  try {
    const job = await contentQueue.add('generate-content', {
      keyword,
      knowledgeBaseId,
      knowledgeSetId,
      imageIds,
      imageCollectionId,
      imageTags,
      imageCount,
      ruleId,
      userId,
      schemaConfig,
      schemaEntities,
      schemaOverrides,
    });
    await job.updateProgress({ stage: 'queued', percent: 10 });

    res.status(202).json({ jobId: job.id, progress: { stage: 'queued', percent: 10 } });
  } catch (err) {
    next(new AppError('Failed to start content generation job.', 500, { userId }));
  }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT gc.*, gr.rule_name
       FROM generated_content gc
       LEFT JOIN generation_rules gr ON gc.rule_id = gr.id
       WHERE gc.user_id = $1
       ORDER BY gc.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(new AppError('Failed to fetch generated content.', 500, { userId: req.user.id }));
  }
});

router.get('/jobs/:id', auth, async (req, res, next) => {
  const { id } = req.params;

  try {
    const job = await contentQueue.getJob(id);

    if (!job || !job.data || job.data.userId !== req.user.id) {
      return next(new AppError('Job not found.', 404));
    }

    const state = await job.getState();
    const progress = job.progress || {};
    const attempts = job.attemptsMade || 0;
    const timestamps = {
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
    const result = state === 'completed' ? job.returnvalue : undefined;

    res.json({ id: job.id, state, progress, attempts, timestamps, result });
  } catch (err) {
    next(new AppError('Failed to fetch job status.', 500, { jobId: id, userId: req.user.id }));
  }
});

router.post('/schedule', auth, validate(contentScheduleSchemas.createSchedule), async (req, res, next) => {
  const { content_id, platform, publish_at } = req.body;
  const userId = req.user.id;

  try {
    const newSchedule = await db.query(
      `INSERT INTO content_schedules (content_id, platform, publish_at)
       SELECT id, $2, $3
       FROM generated_content
       WHERE id = $1 AND user_id = $4
       RETURNING *`,
      [content_id, platform, publish_at, userId]
    );

    if (newSchedule.rows.length === 0) {
      return next(new AppError('Content not found or user not authorized.', 404));
    }

    res.status(201).json(newSchedule.rows[0]);
  } catch (err) {
    next(new AppError('Failed to create schedule.', 500, { userId }));
  }
});

router.get('/schedules', auth, async (req, res, next) => {
  try {
    const schedules = await db.query(
      'SELECT cs.*, gc.title FROM content_schedules cs JOIN generated_content gc ON cs.content_id = gc.id WHERE gc.user_id = $1',
      [req.user.id]
    );
    res.json(schedules.rows);
  } catch (err) {
    next(new AppError('Failed to fetch schedules.', 500, { userId: req.user.id }));
  }
});

router.delete('/schedules/:id', auth, async (req, res, next) => {
  try {
    const deletedSchedule = await db.query(
      'DELETE FROM content_schedules WHERE id = $1 AND content_id IN (SELECT id FROM generated_content WHERE user_id = $2) RETURNING * ',
      [req.params.id, req.user.id]
    );
    if (deletedSchedule.rows.length === 0) {
      return next(new AppError('Schedule not found or user not authorized.', 404));
    }
    res.json({ msg: 'Schedule deleted successfully.' });
  } catch (err) {
    next(new AppError('Failed to delete schedule.', 500, { scheduleId: req.params.id, userId: req.user.id }));
  }
});

router.get('/:id/schema', auth, async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT schema_payload, schema_types
       FROM generated_content
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return next(new AppError('Content not found or user not authorized.', 404));
    }
    const row = result.rows[0];
    res.json({
      schemaPayload: row.schema_payload || null,
      schemaTypes: row.schema_types || [],
    });
  } catch (err) {
    next(new AppError('Failed to fetch schema payload.', 500, { contentId: id, userId: req.user.id }));
  }
});


router.delete('/:id', auth, async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await db.query(
      'DELETE FROM generated_content WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Content not found or user not authorized.', 404));
    }

    res.json({ msg: 'Content deleted successfully.' });
  } catch (err) {
    next(new AppError('Failed to delete content.', 500, { contentId: id, userId }));
  }
});

module.exports = router;
