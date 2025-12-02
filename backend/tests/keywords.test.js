const request = require('supertest');
const { newDb } = require('pg-mem');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const db = require('../db');

describe('Keyword API', () => {
  let app;
  let token;
  let pool;

  beforeAll(async () => {
    const mem = newDb({
      autoCreateForeignKeyIndices: true,
    });
    const { Pool } = mem.adapters.createPg();
    pool = new Pool();
    db.setPool(pool);

    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE keywords (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        base_keyword VARCHAR(255) NOT NULL,
        long_tail_keywords TEXT[],
        schema_metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE keyword_variations (
        id SERIAL PRIMARY KEY,
        keyword_id INTEGER REFERENCES keywords(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        monthly_search_volume INTEGER,
        weight INTEGER,
        schema_metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const hashed = await bcrypt.hash('StrongPass!234', 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['keyword-user', 'keyword@example.com', hashed, 'user']
    );

    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'keyword@example.com', password: 'StrongPass!234' });

    token = loginRes.body.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('supports pagination and long-tail keyword management', async () => {
    const createRes = await request(app)
      .post('/api/keywords')
      .set('x-auth-token', token)
      .send({ base_keyword: 'geo marketing' })
      .expect(201);

    const keywordId = createRes.body.id;
    expect(keywordId).toBeDefined();

    const variationInsert = await db.query(
      `INSERT INTO keyword_variations (keyword_id, name, monthly_search_volume, weight)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name`,
      [keywordId, 'geo marketing tips', 120, 70]
    );
    const variationId = variationInsert.rows[0].id;

    await db.query('UPDATE keywords SET long_tail_keywords = ARRAY[$1] WHERE id = $2', [
      'geo marketing tips',
      keywordId,
    ]);

    const listRes = await request(app)
      .get('/api/keywords')
      .set('x-auth-token', token)
      .expect(200);

    expect(listRes.body).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
    });
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items[0].variations).toHaveLength(1);

    const updateRes = await request(app)
      .put(`/api/keywords/${keywordId}/variations/${variationId}`)
      .set('x-auth-token', token)
      .send({ name: 'Geo marketing guide', weight: 80 })
      .expect(200);

    expect(updateRes.body).toMatchObject({
      id: variationId,
      name: 'Geo marketing guide',
      weight: 80,
    });

    const afterUpdate = await request(app)
      .get('/api/keywords')
      .query({ search: 'geo marketing' })
      .set('x-auth-token', token)
      .expect(200);

    expect(afterUpdate.body.total).toBeGreaterThanOrEqual(1);
    const updatedItem = afterUpdate.body.items.find((item) => item.id === keywordId);
    expect(updatedItem).toBeDefined();
    expect(updatedItem.variations[0]).toMatchObject({
      id: variationId,
      name: 'Geo marketing guide',
      weight: 80,
    });
    expect(updatedItem.long_tail_keywords).toContain('Geo marketing guide');

    await request(app)
      .delete(`/api/keywords/${keywordId}/variations/${variationId}`)
      .set('x-auth-token', token)
      .expect(204);

    const afterVariationDelete = await request(app)
      .get('/api/keywords')
      .query({ search: 'geo marketing' })
      .set('x-auth-token', token)
      .expect(200);

    const itemAfterDelete = afterVariationDelete.body.items.find((item) => item.id === keywordId);
    expect(itemAfterDelete.variations).toHaveLength(0);

    for (let i = 0; i < 12; i += 1) {
      await request(app)
        .post('/api/keywords')
        .set('x-auth-token', token)
        .send({ base_keyword: `keyword-${i}` })
        .expect(201);
    }

    const paged = await request(app)
      .get('/api/keywords')
      .query({ page: 2, pageSize: 5 })
      .set('x-auth-token', token)
      .expect(200);

    expect(paged.body.page).toBe(2);
    expect(paged.body.pageSize).toBe(5);
    expect(paged.body.total).toBeGreaterThan(5);
    expect(Array.isArray(paged.body.items)).toBe(true);
    expect(paged.body.items.length).toBeLessThanOrEqual(5);

    await request(app)
      .delete(`/api/keywords/${keywordId}`)
      .set('x-auth-token', token)
      .expect(204);
  });

  it('allows schema metadata maintenance', async () => {
    const createRes = await request(app)
      .post('/api/keywords')
      .set('x-auth-token', token)
      .send({ base_keyword: 'schema keyword' })
      .expect(201);

    const keywordId = createRes.body.id;
    const schemaMetadata = {
      brand: 'GEO Lab',
      sku: 'SKU-42',
      faq: [
        { question: 'What is GEO?', answer: 'An internal SEO automation suite.' },
        { question: 'Supported regions?', answer: 'CN / APAC' },
      ],
    };

    const schemaRes = await request(app)
      .put(`/api/keywords/${keywordId}/schema`)
      .set('x-auth-token', token)
      .send({ schemaMetadata })
      .expect(200);

    expect(schemaRes.body.schema_metadata).toMatchObject({ brand: 'GEO Lab', sku: 'SKU-42' });

    const variationInsert = await db.query(
      `INSERT INTO keyword_variations (keyword_id, name, monthly_search_volume, weight)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [keywordId, 'schema variation', 50, 25]
    );
    const variationId = variationInsert.rows[0].id;

    const variationSchema = {
      offerId: 'OFF-1',
      highlights: ['Auto Pilot', 'AI writer'],
    };

    const variationSchemaRes = await request(app)
      .put(`/api/keywords/${keywordId}/variations/${variationId}/schema`)
      .set('x-auth-token', token)
      .send({ schemaMetadata: variationSchema })
      .expect(200);

    expect(variationSchemaRes.body.schema_metadata).toMatchObject({
      offerId: 'OFF-1',
    });

    const listRes = await request(app)
      .get('/api/keywords')
      .query({ search: 'schema keyword' })
      .set('x-auth-token', token)
      .expect(200);

    const schemaItem = listRes.body.items.find((item) => item.id === keywordId);
    expect(schemaItem.schema_metadata.brand).toBe('GEO Lab');
    expect(schemaItem.variations[0].schema_metadata.offerId).toBe('OFF-1');
  });

  it('supports bulk import/export and batch updates with diagnostics', async () => {
    const bulkPayload = {
      keywords: [
        {
          base_keyword: 'bulk-keyword-1',
          variations: [
            { name: 'bulk variation a', monthly_search_volume: 120, weight: 55 },
            { name: 'bulk variation b', monthly_search_volume: 90, weight: 40 },
          ],
        },
        {
          base_keyword: 'bulk-keyword-2',
          variations: [{ name: 'bulk variation c', monthly_search_volume: 60, weight: 30 }],
        },
      ],
      overrideExisting: false,
    };

    const importRes = await request(app)
      .post('/api/keywords/bulk/import')
      .set('x-auth-token', token)
      .send(bulkPayload)
      .expect(200);

    expect(importRes.body).toMatchObject({ imported: 2, skipped: 0 });
    expect(importRes.body.variations).toBeGreaterThanOrEqual(3);

    const duplicateRes = await request(app)
      .post('/api/keywords/bulk/import')
      .set('x-auth-token', token)
      .send(bulkPayload)
      .expect(200);

    expect(duplicateRes.body.skipped).toBe(2);

    const overridePayload = {
      ...bulkPayload,
      overrideExisting: true,
      keywords: bulkPayload.keywords.map((item) => ({
        ...item,
        variations: item.variations.slice(0, 1),
      })),
    };

    const overrideRes = await request(app)
      .post('/api/keywords/bulk/import')
      .set('x-auth-token', token)
      .send(overridePayload)
      .expect(200);

    expect(overrideRes.body.updated).toBe(2);

    const exportRes = await request(app)
      .get('/api/keywords/export')
      .set('x-auth-token', token)
      .expect(200);

    expect(exportRes.body.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(exportRes.body.items)).toBe(true);

    const csvRes = await request(app)
      .get('/api/keywords/export?format=csv')
      .set('x-auth-token', token)
      .expect(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');

    const keywordRows = await db.query(
      'SELECT id FROM keywords WHERE base_keyword = $1',
      ['bulk-keyword-1']
    );
    const keywordId = keywordRows.rows[0].id;
    const variationRows = await db.query(
      'SELECT id FROM keyword_variations WHERE keyword_id = $1',
      [keywordId]
    );
    const variationIds = variationRows.rows.map((row) => row.id);

    await request(app)
      .patch(`/api/keywords/${keywordId}/variations/bulk`)
      .set('x-auth-token', token)
      .send({ variationIds, weight: 88 })
      .expect(200);

    const updatedVariations = await db.query(
      'SELECT weight FROM keyword_variations WHERE id = ANY($1::int[])',
      [variationIds]
    );
    updatedVariations.rows.forEach((row) => expect(Number(row.weight)).toBe(88));

    const metricsRes = await request(app)
      .get('/api/keywords/metrics')
      .set('x-auth-token', token)
      .expect(200);

    expect(metricsRes.body.cache).toBeDefined();
    expect(metricsRes.body.profiler).toBeDefined();
  });
});
