process.env.NODE_ENV = 'test';
process.env.DB_USER = 'test_user';
process.env.DB_HOST = 'localhost';
process.env.DB_DATABASE = 'test_db';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_PORT = '5432';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '0';
process.env.ALLOW_USER_REGISTRATION = 'true';

jest.mock('../queue', () => ({
  contentQueue: {
    add: jest.fn().mockResolvedValue({ id: 'test-job' }),
    getJob: jest.fn().mockResolvedValue(null),
  },
}));
