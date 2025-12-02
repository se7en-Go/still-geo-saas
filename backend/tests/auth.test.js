const request = require('supertest');
const { newDb } = require('pg-mem');
const { createApp } = require('../app');
const db = require('../db');
const { config } = require('../config');

describe('Authentication API', () => {
  let app;
  let pool;

  beforeAll(async () => {
    const mem = newDb({
      autoCreateForeignKeyIndices: true,
    });
    const { Pool } = mem.adapters.createPg();
    pool = new Pool();
    db.setPool(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    config.auth.allowRegistration = true;
    app = createApp();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registers a new user when registration is open', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'tester',
        email: 'tester@example.com',
        password: 'StrongPass!234',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(Number),
      username: 'tester',
      email: 'tester@example.com',
      role: 'user',
    });
  });

  it('allows admin to create another user', async () => {
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash('AdminPass!234', 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['admin', 'admin@example.com', hashed, 'admin']
    );

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass!234' })
      .expect(200);

    const token = loginRes.body.token;
    expect(token).toBeDefined();

    const createRes = await request(app)
      .post('/api/auth/admin/users')
      .set('x-auth-token', token)
      .send({
        username: 'second',
        email: 'second@example.com',
        password: 'SecondPass!234',
        role: 'user',
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      username: 'second',
      email: 'second@example.com',
      role: 'user',
    });
  });

  it('rejects login with invalid credentials', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@example.com', password: 'doesnotmatter' })
      .expect(401);
  });

  it('prevents registration when registration is disabled', async () => {
    config.auth.allowRegistration = false;
    app = createApp();

    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'blocked',
        email: 'blocked@example.com',
        password: 'BlockedPass!234',
      })
      .expect(403);
  });

  it('prevents non-admin users from creating accounts', async () => {
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash('UserPass!234', 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['normal', 'normal@example.com', hashed, 'user']
    );

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'normal@example.com', password: 'UserPass!234' })
      .expect(200);

    const token = loginRes.body.token;

    await request(app)
      .post('/api/auth/admin/users')
      .set('x-auth-token', token)
      .send({
        username: 'shouldfail',
        email: 'shouldfail@example.com',
        password: 'FailPass!234',
        role: 'user',
      })
      .expect(403);
  });

  it('allows admins to list existing users', async () => {
    const bcrypt = require('bcryptjs');
    const hashedAdmin = await bcrypt.hash('AdminPass!234', 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['admin', 'admin@example.com', hashedAdmin, 'admin']
    );

    const hashedUser = await bcrypt.hash('UserPass!234', 10);
    await db.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['normal', 'normal@example.com', hashedUser, 'user']
    );

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'AdminPass!234' })
      .expect(200);

    const token = loginRes.body.token;

    const listRes = await request(app)
      .get('/api/auth/admin/users')
      .set('x-auth-token', token)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(2);
    expect(listRes.body[0]).toHaveProperty('email');
    expect(listRes.body[0]).toHaveProperty('role');
  });
});
