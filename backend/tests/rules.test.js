const request = require('supertest');
const { newDb } = require('pg-mem');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const db = require('../db');

describe('Generation Rules Schema Config', () => {
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
      CREATE TABLE generation_rules (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rule_name VARCHAR(255) NOT NULL,
        source_settings JSONB,
        style_settings JSONB,
        seo_settings JSONB,
        media_settings JSONB,
        ranking_settings JSONB,
        schema_config JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE generated_content (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rule_id INTEGER REFERENCES generation_rules(id),
        title VARCHAR(255) NOT NULL,
        meta_description TEXT,
        body TEXT,
        image_ids INTEGER[],
        schema_payload JSONB,
        schema_types TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const hashed = await bcrypt.hash('SchemaPass!123', 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['schema-user', 'schema@example.com', hashed, 'admin']
    );

    app = createApp();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'schema@example.com', password: 'SchemaPass!123' });

    token = loginRes.body.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates and updates schema configuration on rules', async () => {
    const schemaConfig = {
      enabled: true,
      enabledTypes: ['Product', 'FAQ'],
      schemaTemplates: {
        Product: {
          type: 'Product',
          description: 'Product schema',
          fields: [
            { key: 'name', type: 'string', required: true },
            { key: 'brand', type: 'string' },
          ],
        },
      },
      customFields: {
        brand: 'GEO Optimizer',
      },
    };

    const createRes = await request(app)
      .post('/api/rules')
      .set('x-auth-token', token)
      .send({
        rule_name: 'Schema Rule',
        source_settings: {},
        style_settings: {},
        seo_settings: {},
        media_settings: {},
        schemaConfig,
      })
      .expect(200);

    expect(createRes.body.schema_config).toMatchObject({
      enabledTypes: ['Product', 'FAQ'],
      customFields: { brand: 'GEO Optimizer' },
    });

    const updateRes = await request(app)
      .put(`/api/rules/${createRes.body.id}`)
      .set('x-auth-token', token)
      .send({
        schemaConfig: {
          enabledTypes: ['FAQ'],
          customFields: { faqCount: 3 },
        },
      })
      .expect(200);

    expect(updateRes.body.schema_config.enabledTypes).toEqual(['FAQ']);
    expect(updateRes.body.schema_config.customFields).toMatchObject({ faqCount: 3 });
  });

  it('returns schema payload for generated content', async () => {
    const schemaPayload = {
      types: ['Product'],
      payloads: {
        Product: {
          name: 'GEO Optimizer',
          brand: 'GEO Lab',
        },
      },
    };

    const insert = await db.query(
      `INSERT INTO generated_content
        (user_id, rule_id, title, meta_description, body, image_ids, schema_payload, schema_types)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [1, null, 'Schema title', 'Schema desc', 'Body', [], schemaPayload, ['Product']]
    );

    const res = await request(app)
      .get(`/api/content/${insert.rows[0].id}/schema`)
      .set('x-auth-token', token)
      .expect(200);

    expect(res.body.schemaTypes).toEqual(['Product']);
    expect(res.body.schemaPayload.payloads.Product.name).toBe('GEO Optimizer');
  });
});
