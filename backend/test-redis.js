/**
 * Redis Connection Test Script for GEO Optimization Backend
 *
 * This script tests both local Redis configuration and Upstash Redis configuration
 * to verify connectivity and basic operations. Suitable for local development
 * and Render deployment testing.
 *
 * Usage:
 *   node test-redis.js                    # Test both configurations
 *   node test-redis.js --local-only      # Test local only
 *   node test-redis.js --upstash-only    # Test Upstash only
 *   node test-redis.js --verbose         # Detailed output
 */

const Redis = require('ioredis');
const crypto = require('crypto');

// Configuration
const REDIS_CONFIG = {
  // Local Redis configuration (current failing setup)
  local: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    database: process.env.REDIS_DB || 0,
    connectTimeout: 5000,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },

  // Upstash Redis configuration (fixed setup)
  upstash: {
    url: 'redis://default:ATN5AAIncDJlOWY4OGM4ODE4YTQ0MDc4Yjc2Nzc4Yjk2OWRhNTNiYXAyMTMxNzc@smooth-sawfish-13177.upstash.io:6379',
    socket: {
      tls: true,
      rejectUnauthorized: false, // Upstash uses custom certificates
      connectTimeout: 10000,
      lazyConnect: true,
      keepAlive: 30000,
    },
    database: 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    name: 'geo-optimization-upstash'
  }
};

// Test configuration
const TEST_CONFIG = {
  testKey: 'geo:redis:test:' + Date.now(),
  testValue: JSON.stringify({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    source: 'redis-test-script',
    random: crypto.randomBytes(16).toString('hex')
  }),
  testExpiry: 60 // seconds
};

// Command line arguments
const args = process.argv.slice(2);
const options = {
  localOnly: args.includes('--local-only'),
  upstashOnly: args.includes('--upstash-only'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  quiet: args.includes('--quiet') || args.includes('-q')
};

if (options.localOnly && options.upstashOnly) {
  console.error('❌ Error: Cannot use --local-only and --upstash-only together');
  process.exit(1);
}

/**
 * Utility functions
 */
function log(level, message, data = null) {
  if (options.quiet && level === 'info') return;

  const timestamp = new Date().toISOString();
  const prefix = {
    'info': 'ℹ️',
    'success': '✅',
    'error': '❌',
    'warn': '⚠️',
    'debug': '🔍'
  }[level] || '📝';

  let output = `[${timestamp}] ${prefix} ${message}`;

  if (options.verbose && data) {
    output += '\n' + JSON.stringify(data, null, 2);
  }

  console.log(output);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Redis test functions
 */
async function testRedisConnection(name, config) {
  log('info', `\n🔧 Testing ${name} Redis configuration...`);
  log('info', `Configuration: ${JSON.stringify(
    config.url ? { url: config.url.split('@')[1], tls: config.socket?.tls } : config,
    null,
    options.verbose ? 2 : 0
  )}`);

  const client = new Redis(config);
  const results = {
    name,
    config: config.url ? { url: config.url.split('@')[1] } : config,
    connected: false,
    ping: false,
    set: false,
    get: false,
    delete: false,
    error: null,
    duration: 0,
    info: {}
  };

  const startTime = Date.now();

  try {
    // Event listeners for debugging
    client.on('error', (err) => {
      results.error = err.message;
      if (options.verbose) {
        log('debug', `Redis client error for ${name}:`, err);
      }
    });

    client.on('connect', () => {
      log('info', `✓ Connected to ${name} Redis`);
    });

    client.on('ready', () => {
      log('info', `✓ ${name} Redis client ready`);
    });

    client.on('reconnecting', () => {
      log('warn', `⚠️ Reconnecting to ${name} Redis...`);
    });

    // Test connection (ioredis connects automatically)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, config.socket?.connectTimeout || config.connectTimeout || 10000);

      client.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    results.connected = true;

    // Get Redis info
    try {
      const infoString = await client.info();
      results.info = infoString.split('\r\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      }, {});

      if (options.verbose) {
        log('debug', `Redis server info for ${name}:`, Object.keys(results.info).slice(0, 10));
      }
    } catch (err) {
      log('warn', `Could not get Redis info for ${name}: ${err.message}`);
    }

    // Test PING
    try {
      const pingResult = await client.ping();
      results.ping = pingResult === 'PONG';
      log('success', `✓ PING successful: ${pingResult}`);
    } catch (err) {
      log('error', `✗ PING failed: ${err.message}`);
    }

    // Test SET operation
    try {
      const setResult = await client.set(
        TEST_CONFIG.testKey,
        TEST_CONFIG.testValue,
        'EX',
        TEST_CONFIG.testExpiry
      );
      results.set = setResult === 'OK';
      log('success', `✓ SET successful: ${setResult}`);
    } catch (err) {
      log('error', `✗ SET failed: ${err.message}`);
    }

    // Test GET operation
    try {
      const getValue = await client.get(TEST_CONFIG.testKey);
      results.get = getValue === TEST_CONFIG.testValue;

      if (results.get) {
        log('success', `✓ GET successful: Retrieved correct value`);

        if (options.verbose) {
          const parsed = JSON.parse(getValue);
          log('debug', 'Retrieved test data:', parsed);
        }
      } else {
        log('error', '✗ GET failed: Value mismatch or null');
      }
    } catch (err) {
      log('error', `✗ GET failed: ${err.message}`);
    }

    // Test DEL operation
    try {
      const deleteResult = await client.del(TEST_CONFIG.testKey);
      results.delete = deleteResult > 0;
      log('success', `✓ DELETE successful: ${deleteResult} key(s) deleted`);
    } catch (err) {
      log('error', `✗ DELETE failed: ${err.message}`);
    }

    // Test TTL (Time To Live) functionality
    try {
      const ttlKey = `geo:redis:ttl:${Date.now()}`;
      await client.set(ttlKey, 'ttl-test', 'EX', 5);
      const ttl = await client.ttl(ttlKey);
      log('info', `✓ TTL test: Key expires in ${ttl} seconds`);
      await client.del(ttlKey);
    } catch (err) {
      log('warn', `⚠️ TTL test failed: ${err.message}`);
    }

  } catch (err) {
    results.error = err.message;
    log('error', `❌ Connection to ${name} Redis failed: ${err.message}`);

    if (options.verbose) {
      log('debug', 'Full error details:', err);
    }
  } finally {
    try {
      await client.quit();
    } catch (err) {
      // Ignore quit errors
    }
    results.duration = Date.now() - startTime;
  }

  return results;
}

/**
 * Environment detection
 */
function detectEnvironment() {
  const env = {
    isRender: process.env.RENDER === 'true',
    isProduction: process.env.NODE_ENV === 'production',
    platform: process.platform,
    nodeVersion: process.version,
    redisEnvVars: Object.keys(process.env).filter(key => key.toLowerCase().includes('redis')),
    hasLocalRedis: false // We'll test this
  };

  log('info', `🌍 Environment: ${env.isRender ? 'Render' : 'Local'} (${env.platform})`);
  log('info', `📦 Node.js version: ${env.nodeVersion}`);

  if (env.redisEnvVars.length > 0) {
    log('info', `🔧 Redis environment variables: ${env.redisEnvVars.join(', ')}`);
  }

  return env;
}

/**
 * Results summary
 */
function printSummary(results) {
  const allResults = Array.isArray(results) ? results : [results];

  console.log('\n' + '='.repeat(80));
  console.log('📊 REDIS CONNECTION TEST SUMMARY');
  console.log('='.repeat(80));

  allResults.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.name} Configuration:`);
    console.log(`   Connection: ${result.connected ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   PING: ${result.ping ? '✅ Success' : '❌ Failed'}`);
    console.log(`   SET: ${result.set ? '✅ Success' : '❌ Failed'}`);
    console.log(`   GET: ${result.get ? '✅ Success' : '❌ Failed'}`);
    console.log(`   DELETE: ${result.delete ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Duration: ${result.duration}ms`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.info.redis_version) {
      console.log(`   Redis Version: ${result.info.redis_version}`);
    } else if (result.info.server && result.info.server.redis_version) {
      console.log(`   Redis Version: ${result.info.server.redis_version}`);
    }
  });

  const successCount = allResults.filter(r => r.connected && r.ping && r.set && r.get).length;
  const totalCount = allResults.length;

  console.log(`\n🎯 Overall Results: ${successCount}/${totalCount} configurations working`);

  if (successCount === totalCount) {
    console.log('🎉 All Redis configurations are working correctly!');
  } else if (successCount === 0) {
    console.log('💥 No Redis configurations are working. Check your setup.');
  } else {
    console.log('⚠️ Some Redis configurations are working, others are not.');
  }

  console.log('\n📋 Recommendations:');
  if (allResults.find(r => r.name.includes('Local') && !r.connected)) {
    console.log('   - Local Redis is not accessible. Install Redis or use Docker: docker run -p 6379:6379 redis:alpine');
  }
  if (allResults.find(r => r.name.includes('Upstash') && r.connected)) {
    console.log('   - Upstash Redis is working! Use this for production deployment.');
  }
  if (allResults.find(r => r.name.includes('Upstash') && !r.connected)) {
    console.log('   - Upstash Redis failed. Check the URL and network connectivity.');
    console.log('   - Verify the Upstash URL and token are correct.');
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 GEO Optimization - Redis Connection Test');
  console.log('=' .repeat(50));

  const environment = detectEnvironment();

  const tests = [];

  if (!options.upstashOnly) {
    tests.push(testRedisConnection('Local', REDIS_CONFIG.local));
  }

  if (!options.localOnly) {
    tests.push(testRedisConnection('Upstash', REDIS_CONFIG.upstash));
  }

  const results = await Promise.allSettled(tests);

  const successfulResults = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failedResults = results
    .filter(r => r.status === 'rejected')
    .map(r => ({
      name: 'Unknown',
      error: r.reason.message,
      connected: false,
      ping: false,
      set: false,
      get: false,
      delete: false,
      duration: 0
    }));

  const allResults = [...successfulResults, ...failedResults];

  printSummary(allResults);

  // Exit with appropriate code
  const hasWorkingConfig = allResults.some(r => r.connected && r.ping && r.set && r.get);
  process.exit(hasWorkingConfig ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('\n💥 Uncaught Exception:', err.message);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection:', reason);
  if (options.verbose) {
    console.error('Promise:', promise);
  }
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  main().catch(err => {
    console.error('\n💥 Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = {
  testRedisConnection,
  REDIS_CONFIG,
  TEST_CONFIG
};