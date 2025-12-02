const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validate, ruleSchemas } = require('../validation');
const logger = require('../logger');
const AppError = require('../utils/appError');

const router = express.Router();

// Create a new generation rule
router.post('/', auth, validate(ruleSchemas.createRule), async (req, res, next) => {
  const {
    rule_name,
    source_settings,
    style_settings,
    seo_settings,
    media_settings,
    ranking_settings,
    schemaConfig,
  } = req.body;
  try {
    const newRule = await db.withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO public.generation_rules
          (user_id, rule_name, source_settings, style_settings, seo_settings, media_settings, ranking_settings, schema_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          req.user.id,
          rule_name,
          source_settings,
          style_settings,
          seo_settings,
          media_settings,
          ranking_settings || null,
          schemaConfig || null,
        ]
      );
      return result.rows[0];
    });

    res.json(newRule);
  } catch (err) {
    logger.error('Failed to create generation rule', { error: err, userId: req.user.id });
    next(new AppError('Failed to create rule.', 500, { userId: req.user.id }));
  }
});

// Get all rules for the logged-in user
router.get('/', auth, async (req, res, next) => {
  try {
    const rules = await db.query('SELECT * FROM public.generation_rules WHERE user_id = $1', [req.user.id]);
    res.json(rules.rows);
  } catch (err) {
    logger.error('Failed to fetch generation rules', { error: err, userId: req.user.id });
    next(new AppError('Failed to fetch rules.', 500, { userId: req.user.id }));
  }
});

// Get a specific rule by ID
router.get('/:id', auth, async (req, res, next) => {
  try {
    const rule = await db.query('SELECT * FROM public.generation_rules WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (rule.rows.length === 0) {
      return next(new AppError('Rule not found.', 404, { ruleId: req.params.id }));
    }
    res.json(rule.rows[0]);
  } catch (err) {
    logger.error('Failed to fetch generation rule', { error: err, ruleId: req.params.id, userId: req.user.id });
    next(new AppError('Failed to fetch rule.', 500, { ruleId: req.params.id, userId: req.user.id }));
  }
});

// Update a generation rule
router.put('/:id', auth, validate(ruleSchemas.updateRule), async (req, res, next) => {
  const { id } = req.params;
  const {
    rule_name,
    source_settings,
    style_settings,
    seo_settings,
    media_settings,
    ranking_settings,
    schemaConfig,
  } = req.body;
  try {
    const updatedRule = await db.withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE public.generation_rules
         SET
          rule_name = COALESCE($1, rule_name),
          source_settings = COALESCE($2, source_settings),
          style_settings = COALESCE($3, style_settings),
          seo_settings = COALESCE($4, seo_settings),
          media_settings = COALESCE($5, media_settings),
          ranking_settings = COALESCE($6, ranking_settings),
          schema_config = COALESCE($7, schema_config)
         WHERE id = $8 AND user_id = $9
         RETURNING *`,
        [
          rule_name,
          source_settings,
          style_settings,
          seo_settings,
          media_settings,
          ranking_settings,
          schemaConfig,
          id,
          req.user.id,
        ]
      );
      return result.rows[0];
    });
    if (!updatedRule) {
      return next(new AppError('Rule not found or user not authorized.', 404, { ruleId: id }));
    }
    res.json(updatedRule);
  } catch (err) {
    logger.error('Failed to update generation rule', { error: err, ruleId: id, userId: req.user.id });
    next(new AppError('Failed to update rule.', 500, { ruleId: id, userId: req.user.id }));
  }
});

// Delete a generation rule
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const deletedRule = await db.query('DELETE FROM public.generation_rules WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
    if (deletedRule.rows.length === 0) {
      return next(new AppError('Rule not found or user not authorized.', 404, { ruleId: req.params.id }));
    }
    res.json({ msg: 'Rule deleted successfully.' });
  } catch (err) {
    logger.error('Failed to delete generation rule', { error: err, ruleId: req.params.id, userId: req.user.id });
    next(new AppError('Failed to delete rule.', 500, { ruleId: req.params.id, userId: req.user.id }));
  }
});

module.exports = router;
