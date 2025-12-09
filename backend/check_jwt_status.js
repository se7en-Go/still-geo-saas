const fs = require('fs');
const path = require('path');

// 模拟检查当前配置状态
require('dotenv').config();

console.log('=== 当前JWT配置状态检查 ===');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 20) + '...' : 'NOT_SET');
console.log('JWT_EXPIRY:', process.env.JWT_EXPIRY || 'NOT_SET');
console.log('ALLOW_USER_REGISTRATION:', process.env.ALLOW_USER_REGISTRATION || 'NOT_SET');

// 检查配置文件存在性
const files = ['.env', '.env.production', '.env.fixed', '.env.production.secure'];
files.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const jwtMatch = content.match(/JWT_SECRET=(.+)/);
    if (jwtMatch) {
      console.log(file + ': ' + jwtMatch[1].substring(0, 20) + '...');
    }
  } else {
    console.log(file + ': FILE_NOT_FOUND');
  }
});

// 检查token格式验证
const jwt = require('jsonwebtoken');
const testTokens = [
  'test_token_invalid',
  'invalid_token_12345',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
];

console.log('\n=== Token验证测试 ===');
testTokens.forEach(token => {
  try {
    // 尝试用当前secret验证
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test_secret');
    console.log('Token valid:', token.substring(0, 20) + '...');
  } catch (error) {
    console.log('Token INVALID:', token.substring(0, 20) + '... -', error.message);
  }
});