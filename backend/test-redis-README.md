# Redis Connection Test Script

## Overview

The `test-redis.js` script is designed to verify Redis connectivity for the GEO optimization backend. It tests both local and Upstash Redis configurations to ensure proper setup before and after deployment.

## Features

- **Dual Configuration Testing**: Tests both local Redis and Upstash Redis configurations
- **Comprehensive Operations**: Tests PING, SET, GET, DELETE, and TTL operations
- **Error Reporting**: Detailed error messages and debugging information
- **Environment Detection**: Automatically detects local vs. Render deployment environments
- **Flexible Options**: Command-line flags for selective testing and verbosity control
- **Performance Metrics**: Measures connection duration and response times

## Usage

### Basic Usage

```bash
# Test both configurations
node test-redis.js

# Test only local Redis
node test-redis.js --local-only

# Test only Upstash Redis
node test-redis.js --upstash-only

# Verbose output with detailed debugging
node test-redis.js --verbose

# Quiet mode (minimal output)
node test-redis.js --quiet
```

### Command Line Options

| Option | Description |
|--------|-------------|
| `--local-only` | Test only local Redis configuration |
| `--upstash-only` | Test only Upstash Redis configuration |
| `--verbose` or `-v` | Enable detailed debugging output |
| `--quiet` or `-q` | Suppress informational messages |

## Configurations

### Local Redis Configuration
```javascript
{
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  database: process.env.REDIS_DB || 0,
  connectTimeout: 5000,
  lazyConnect: true,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
}
```

### Upstash Redis Configuration
```javascript
{
  url: 'redis://default:ATN5AAIncDJlOWY4OGM4ODE4YTQ0MDc4Yjc2Nzc4Yjk2OWRhNTNiYXAyMTMxNzc@smooth-sawfish-13177.upstash.io:6379',
  socket: {
    tls: true,
    rejectUnauthorized: false,
    connectTimeout: 10000,
    lazyConnect: true,
    keepAlive: 30000
  },
  database: 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  name: 'geo-optimization-upstash'
}
```

## Test Operations

The script performs the following Redis operations:

1. **Connection Test**: Establishes connection and verifies client readiness
2. **Server Info**: Retrieves Redis server information
3. **PING**: Tests basic connectivity
4. **SET Operation**: Stores test data with expiration
5. **GET Operation**: Retrieves and verifies stored data
6. **DELETE Operation**: Cleans up test data
7. **TTL Test**: Tests time-to-live functionality

## Sample Output

### Successful Upstash Connection
```
🚀 GEO Optimization - Redis Connection Test
==================================================
🌍 Environment: Local (win32)
📦 Node.js version: v22.14.0

🔧 Testing Upstash Redis configuration...
✓ Connected to Upstash Redis
✓ Upstash Redis client ready
✅ ✓ PING successful: PONG
✅ ✓ SET successful: OK
✅ ✓ GET successful: Retrieved correct value
✅ ✓ DELETE successful: 1 key(s) deleted
✓ TTL test: Key expires in 5 seconds

================================================================================
📊 REDIS CONNECTION TEST SUMMARY
================================================================================

1. Upstash Configuration:
   Connection: ✅ Connected
   PING: ✅ Success
   SET: ✅ Success
   GET: ✅ Success
   DELETE: ✅ Success
   Duration: 67ms
   Redis Version: 5.0.14.1

🎯 Overall Results: 1/1 configurations working
🎉 All Redis configurations are working correctly!
```

### Failed Local Connection
```
🔧 Testing Local Redis configuration...
❌ Connection to Local Redis failed: Connection timeout

================================================================================
📊 REDIS CONNECTION TEST SUMMARY
================================================================================

1. Local Configuration:
   Connection: ❌ Failed
   PING: ❌ Failed
   SET: ❌ Failed
   GET: ❌ Failed
   DELETE: ❌ Failed
   Duration: 5006ms
   Error: Connection timeout

📋 Recommendations:
   - Local Redis is not accessible. Install Redis or use Docker: docker run -p 6379:6379 redis:alpine
```

## Environment Variables

The script respects the following environment variables:

- `REDIS_HOST`: Local Redis host (default: localhost)
- `REDIS_PORT`: Local Redis port (default: 6379)
- `REDIS_PASSWORD`: Local Redis password
- `REDIS_DB`: Local Redis database number (default: 0)
- `NODE_ENV`: Environment (development/production)
- `RENDER`: Set to 'true' when running on Render

## Troubleshooting

### Local Redis Fails
- Install Redis locally or use Docker
- Run: `docker run -p 6379:6379 redis:alpine`
- Check if Redis server is running: `redis-cli ping`

### Upstash Redis Fails
- Verify the Upstash URL and credentials
- Check network connectivity
- Ensure TLS configuration is correct
- Verify the token is valid and not expired

### Script Errors
- Check that Node.js is installed
- Verify ioredis dependency: `npm list ioredis`
- Ensure script has execute permissions

## Integration with CI/CD

This script is designed to work seamlessly in CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Test Redis Connection
  run: |
    cd backend
    node test-redis.js --upstash-only
```

The script exits with:
- **Exit code 0**: At least one Redis configuration is working
- **Exit code 1**: No Redis configurations are working

## Security Notes

- The Upstash Redis URL contains credentials - keep it secure
- The script tests with temporary keys that are automatically cleaned up
- TLS is enabled for Upstash connections
- Error messages are sanitized to avoid exposing sensitive information

## Dependencies

- Node.js (v14+ recommended)
- ioredis package
- crypto package (built-in)

## File Location

- Script: `D:\GEO优化\backend\test-redis.js`
- Documentation: `D:\GEO优化\backend\test-redis-README.md`