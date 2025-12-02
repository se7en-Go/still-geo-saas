require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: true,
});

const setupDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user';`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS keywords (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        base_keyword VARCHAR(255) NOT NULL,
        long_tail_keywords TEXT[],
        schema_metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(
      `ALTER TABLE keywords ADD COLUMN IF NOT EXISTS schema_metadata JSONB;`
    );

    await client.query(`CREATE INDEX IF NOT EXISTS idx_keywords_user_id ON keywords(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_keywords_base_keyword_gin ON keywords USING gin (base_keyword gin_trgm_ops);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_keywords_user_created_id ON keywords(user_id, created_at DESC, id DESC);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS keyword_variations (
        id SERIAL PRIMARY KEY,
        keyword_id INTEGER REFERENCES keywords(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        monthly_search_volume INTEGER,
        weight INTEGER,
        schema_metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(
      `ALTER TABLE keyword_variations ADD COLUMN IF NOT EXISTS schema_metadata JSONB;`
    );

    await client.query(`CREATE INDEX IF NOT EXISTS idx_keyword_variations_keyword_created_id ON keyword_variations(keyword_id, created_at DESC, id DESC);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_sets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        schema_metadata JSONB,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`ALTER TABLE knowledge_sets ADD COLUMN IF NOT EXISTS description TEXT;`);
    await client.query(`ALTER TABLE knowledge_sets ADD COLUMN IF NOT EXISTS schema_metadata JSONB;`);
    await client.query(`ALTER TABLE knowledge_sets ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;`);
    await client.query(`ALTER TABLE knowledge_sets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_sets_user_name ON knowledge_sets(user_id, LOWER(name));`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_sets_user_default ON knowledge_sets(user_id) WHERE is_default = true;`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_knowledge_sets_user_created_id ON knowledge_sets(user_id, created_at DESC, id DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        embedding VECTOR(1024),
        schema_metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS schema_metadata JSONB;`
    );
    await client.query(
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS knowledge_set_id INTEGER REFERENCES knowledge_sets(id) ON DELETE SET NULL;`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_documents_user_created_id ON documents(user_id, created_at DESC, id DESC);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_documents_user_set ON documents(user_id, knowledge_set_id, created_at DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(1024),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id, chunk_index);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS image_collections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        image_name VARCHAR(255) NOT NULL,
        tags TEXT[],
        image_path VARCHAR(255) NOT NULL,
        collection_id INTEGER REFERENCES image_collections(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES image_collections(id) ON DELETE SET NULL;`);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_images_user_collection ON images(user_id, collection_id);
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_images_user_created_id ON images(user_id, created_at DESC, id DESC);`
    );

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_image_collections_user ON image_collections(user_id, name);
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_image_collections_user_created_id ON image_collections(user_id, created_at DESC, id DESC);`
    );


    await client.query(`
      CREATE TABLE IF NOT EXISTS generation_rules (
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
    await client.query(`
      ALTER TABLE generation_rules
      ADD COLUMN IF NOT EXISTS ranking_settings JSONB;
    `);
    await client.query(`
      ALTER TABLE generation_rules
      ADD COLUMN IF NOT EXISTS schema_config JSONB;
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_generation_rules_user_created_id ON generation_rules(user_id, created_at DESC, id DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS generated_content (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        rule_id INTEGER REFERENCES generation_rules(id),
        title VARCHAR(255) NOT NULL,
        meta_description TEXT,
        body TEXT,
        thumbnail_suggestion TEXT,
        image_ids INTEGER[],
        published_url TEXT,
        schema_payload JSONB,
        schema_types TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS published_url TEXT;`);
    await client.query(`ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS schema_payload JSONB;`);
    await client.query(`ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS schema_types TEXT[];`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_generated_content_user_created_id ON generated_content(user_id, created_at DESC, id DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS content_schedules (
        id SERIAL PRIMARY KEY,
        content_id INTEGER REFERENCES generated_content(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        publish_at TIMESTAMP WITH TIME ZONE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_content_schedules_publish ON content_schedules(content_id, publish_at DESC, id DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_analytics (
        id SERIAL PRIMARY KEY,
        content_id INTEGER REFERENCES generated_content(id) ON DELETE CASCADE,
        platform VARCHAR(50) NOT NULL,
        included_at TIMESTAMP WITH TIME ZONE,
        performance_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO knowledge_sets (user_id, name, description, is_default)
      SELECT u.id,
             'Default Knowledge Set',
             'System generated default knowledge set',
             true
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1
        FROM knowledge_sets ks
        WHERE ks.user_id = u.id
          AND ks.is_default = true
      );
    `);

    await client.query(`
      UPDATE documents d
      SET knowledge_set_id = ks.id
      FROM knowledge_sets ks
      WHERE ks.user_id = d.user_id
        AND ks.is_default = true
        AND d.knowledge_set_id IS NULL;
    `);

    await client.query('COMMIT');
    logger.info('Database tables created or updated successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Error setting up database', { error: err.message });
  } finally {
    client.release();
    await pool.end();
  }
};

setupDatabase();
