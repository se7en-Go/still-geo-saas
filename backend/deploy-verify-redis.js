require('dotenv').config();
const { createUpstashConnection, validateRedisConnection } = require('./config-redis-production');
const logger = require('./logger');
const Redis = require('ioredis');

/**
 * Redis Deployment Verification Script
 * Run this script to verify Redis connectivity before and after deployment
 */

async function testUpstashConnection() {
  console.log('\n🔍 Testing Upstash Redis Connection...\n');

  const connection = createUpstashConnection();

  if (!connection) {
    console.log('❌ No Redis connection configuration found');
    return false;
  }

  console.log('📋 Connection Configuration:');
  console.log(`   URL: ${connection.url || 'N/A (using individual parameters)'}`);
  console.log(`   Host: ${connection.host || 'N/A'}`);
  console.log(`   Port: ${connection.port || 'N/A'}`);
  console.log(`   TLS: ${connection.tls ? 'Enabled' : 'Disabled'}`);
  console.log(`   Connect Timeout: ${connection.connectTimeout}ms`);

  if (!validateRedisConnection(connection)) {
    console.log('❌ Redis connection configuration is invalid');
    return false;
  }

  let redis;
  try {
    console.log('\n🔌 Connecting to Redis...');
    redis = new Redis(connection);

    // Test basic connectivity
    console.log('📊 Testing PING command...');
    const pong = await redis.ping();
    console.log(`   ✅ PING response: ${pong}`);

    // Test read/write operations
    console.log('📝 Testing read/write operations...');
    const testKey = `test_${Date.now()}`;
    const testValue = 'deployment_verification_test';

    await redis.set(testKey, testValue, 'EX', 60);
    console.log('   ✅ SET operation successful');

    const retrieved = await redis.get(testKey);
    console.log(`   ✅ GET operation: ${retrieved}`);

    await redis.del(testKey);
    console.log('   ✅ DEL operation successful');

    // Test connection info
    console.log('ℹ️  Connection Information:');
    const info = await redis.info('server');
    const lines = info.split('\r\n');
    const serverInfo = lines
      .filter(line => line.startsWith('redis_version') || line.startsWith('redis_mode'))
      .map(line => `   ${line}`)
      .join('\n');
    console.log(serverInfo);

    console.log('\n✅ All Redis tests passed successfully!');
    return true;

  } catch (error) {
    console.log('\n❌ Redis connection test failed:');
    console.log(`   Error: ${error.message}`);

    if (error.code === 'ETIMEDOUT') {
      console.log('   Cause: Connection timeout - check network connectivity and firewall settings');
      console.log('   Solution: Verify Upstash domain and port accessibility');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('   Cause: Connection refused - Redis server not reachable');
      console.log('   Solution: Check Upstash service status and credentials');
    } else if (error.code === 'ENOTFOUND') {
      console.log('   Cause: Host not found - DNS resolution failed');
      console.log('   Solution: Verify Upstash domain name in configuration');
    } else if (error.message.includes('AUTH')) {
      console.log('   Cause: Authentication failed');
      console.log('   Solution: Check Redis password in REDIS_PASSWORD');
    }

    return false;
  } finally {
    if (redis) {
      await redis.quit().catch(() => {});
    }
  }
}

async function testQueueConnection() {
  console.log('\n🔄 Testing Queue Connection...\n');

  try {
    const { getQueueHealth } = require('./queue-production');
    const health = await getQueueHealth();

    console.log('📊 Queue Health Status:');
    console.log(`   Status: ${health.status}`);
    console.log(`   Redis Available: ${health.redisAvailable}`);
    console.log(`   Using Fallback: ${health.useFallback}`);
    console.log(`   Healthy: ${health.healthy}`);
    console.log(`   Uptime: ${Math.floor(health.uptime)}s`);

    if (health.jobCounts) {
      console.log('\n📈 Job Counts:');
      Object.entries(health.jobCounts).forEach(([state, count]) => {
        console.log(`   ${state}: ${count}`);
      });
    }

    if (health.error) {
      console.log(`\n⚠️  Error: ${health.error}`);
    }

    return health.healthy;

  } catch (error) {
    console.log(`\n❌ Queue health check failed: ${error.message}`);
    return false;
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🔧 Checking Environment Variables...\n');

  const requiredVars = [
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'REDIS_TLS',
    'REDIS_AVAILABLE',
    'REDIS_FALLBACK_ENABLED'
  ];

  const optionalVars = [
    'REDIS_URL',
    'REDIS_CONNECT_TIMEOUT',
    'REDIS_RETRY_DELAY_ON_FAILOVER',
    'REDIS_MAX_RETRIES_PER_REQUEST'
  ];

  console.log('📋 Required Variables:');
  let allRequiredPresent = true;

  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      // Mask sensitive values
      const displayValue = varName.includes('PASSWORD') ?
        '***configured***' : value;
      console.log(`   ✅ ${varName}: ${displayValue}`);
    } else {
      console.log(`   ❌ ${varName}: Not set`);
      allRequiredPresent = false;
    }
  });

  console.log('\n📋 Optional Variables:');
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      const displayValue = varName.includes('PASSWORD') || varName.includes('URL') ?
        '***configured***' : value;
      console.log(`   ✅ ${varName}: ${displayValue}`);
    } else {
      console.log(`   ⚪ ${varName}: Not set (using default)`);
    }
  });

  // Check for problematic configurations
  console.log('\n⚠️  Configuration Warnings:');

  if (process.env.REDIS_URL) {
    if (process.env.REDIS_URL.includes('192.168.0.207') || process.env.REDIS_URL.includes('127.0.0.1')) {
      console.log('   ❌ REDIS_URL contains local IP address');
      console.log('      This will not work in cloud deployment');
    }
    if (!process.env.REDIS_URL.includes('upstash.io')) {
      console.log('   ⚠️  REDIS_URL is not pointing to Upstash');
      console.log('      Consider using Upstash Redis Cloud for production');
    }
  } else if (process.env.REDIS_HOST === '192.168.0.207') {
    console.log('   ❌ REDIS_HOST is set to local IP (192.168.0.207)');
    console.log('      This will not work in cloud deployment');
    console.log('      Consider setting REDIS_URL for Upstash configuration');
  } else if (process.env.REDIS_HOST === '127.0.0.1') {
    console.log('   ❌ REDIS_HOST is set to localhost (127.0.0.1)');
    console.log('      This will not work in cloud deployment');
    console.log('      Consider setting REDIS_URL for Upstash configuration');
  }

  return allRequiredPresent;
}

async function runFullVerification() {
  console.log('🚀 Starting Redis Deployment Verification\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const results = {
    environment: await checkEnvironmentVariables(),
    connection: await testUpstashConnection(),
    queue: await testQueueConnection()
  };

  console.log('\n📊 VERIFICATION SUMMARY:');
  console.log(`   Environment Variables: ${results.environment ? '✅' : '❌'}`);
  console.log(`   Redis Connection: ${results.connection ? '✅' : '❌'}`);
  console.log(`   Queue Health: ${results.queue ? '✅' : '❌'}`);

  const allPassed = Object.values(results).every(result => result === true);

  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);

  if (!allPassed) {
    console.log('\n💡 Recommendations:');
    if (!results.environment) {
      console.log('   - Set all required environment variables');
    }
    if (!results.connection) {
      console.log('   - Check Redis credentials and network connectivity');
      console.log('   - Verify Upstash service status');
      console.log('   - Ensure TLS is enabled for production');
    }
    if (!results.queue) {
      console.log('   - Check queue configuration');
      console.log('   - Verify Redis connection for queue operations');
    }
  }

  return allPassed;
}

// Run verification if called directly
if (require.main === module) {
  runFullVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification failed with error:', error);
      process.exit(1);
    });
}

module.exports = {
  testUpstashConnection,
  testQueueConnection,
  checkEnvironmentVariables,
  runFullVerification
};