#!/usr/bin/env node

/**
 * JWT Security Implementation Script
 *
 * This script implements comprehensive JWT security measures including:
 * - Token format validation
 * - Environment security checks
 * - Invalid token cleanup
 * - Security monitoring setup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class JWTSecurityImplementation {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.securityReport = {
      timestamp: new Date().toISOString(),
      checks: [],
      recommendations: [],
      criticalIssues: []
    };
  }

  // Generate secure JWT secret
  generateSecureSecret() {
    return crypto.randomBytes(64).toString('base64');
  }

  // Validate current JWT secret
  validateJWTSecret(secret) {
    const issues = [];

    if (!secret) {
      issues.push('JWT_SECRET is not set');
      return issues;
    }

    if (secret === 'your_jwt_secret' || secret === 'your-secret-key') {
      issues.push('JWT_SECRET is using default value - CRITICAL SECURITY RISK');
      this.securityReport.criticalIssues.push({
        type: 'DEFAULT_SECRET',
        severity: 'CRITICAL',
        description: 'JWT secret is using default value'
      });
    }

    if (secret.length < 32) {
      issues.push('JWT_SECRET is too short (minimum 32 characters recommended)');
      this.securityReport.criticalIssues.push({
        type: 'SHORT_SECRET',
        severity: 'HIGH',
        description: 'JWT secret is too short'
      });
    }

    // Check for common patterns
    const commonPatterns = [
      /secret/i,
      /jwt/i,
      /change/i,
      /me/i,
      /production/i,
      /test/i
    ];

    if (commonPatterns.some(pattern => pattern.test(secret))) {
      issues.push('JWT_SECRET contains predictable patterns');
    }

    return issues;
  }

  // Check environment configuration
  checkEnvironmentConfig() {
    const envFiles = [
      '.env',
      '.env.production',
      '.env.production.secure'
    ];

    const envChecks = envFiles.map(file => {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const jwtSecretMatch = content.match(/JWT_SECRET=([^\n\r]+)/);

        if (jwtSecretMatch) {
          const secret = jwtSecretMatch[1];
          const issues = this.validateJWTSecret(secret);

          this.securityReport.checks.push({
            file,
            secretSet: !!secret,
            secretLength: secret.length,
            issues,
            secure: issues.length === 0
          });

          return { file, secret, issues };
        }
      }
      return { file, secret: null, issues: ['File not found or JWT_SECRET not set'] };
    });

    return envChecks;
  }

  // Backup current configuration
  backupConfiguration() {
    const timestamp = Date.now();
    const backupDir = path.join(this.projectRoot, 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filesToBackup = [
      '.env',
      '.env.production',
      'middleware/auth.js'
    ];

    filesToBackup.forEach(file => {
      const sourcePath = path.join(this.projectRoot, file);
      if (fs.existsSync(sourcePath)) {
        const backupPath = path.join(backupDir, `${file}.backup.${timestamp}`);
        fs.copyFileSync(sourcePath, backupPath);
        console.log(`✅ Backed up: ${file} -> backup/${file}.backup.${timestamp}`);
      }
    });

    return timestamp;
  }

  // Update JWT secret in configuration files
  updateJWTSecret(newSecret) {
    const filesToUpdate = [
      '.env',
      '.env.production.secure'
    ];

    filesToUpdate.forEach(file => {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace JWT_SECRET line
        content = content.replace(
          /^JWT_SECRET=.*$/m,
          `JWT_SECRET=${newSecret}`
        );

        // Add JWT_EXPIRY if not present
        if (!content.includes('JWT_EXPIRY=')) {
          content += '\nJWT_EXPIRY=24h\n';
        }

        fs.writeFileSync(filePath, content);
        console.log(`✅ Updated JWT_SECRET in: ${file}`);
      }
    });
  }

  // Implement enhanced authentication middleware
  implementEnhancedAuth() {
    const enhancedAuthPath = path.join(this.projectRoot, 'middleware', 'enhanced-auth.js');
    const originalAuthPath = path.join(this.projectRoot, 'middleware', 'auth.js');

    if (fs.existsSync(enhancedAuthPath)) {
      // Backup original auth middleware
      if (fs.existsSync(originalAuthPath)) {
        fs.copyFileSync(originalAuthPath, `${originalAuthPath}.backup`);
      }

      // Replace with enhanced version
      fs.copyFileSync(enhancedAuthPath, originalAuthPath);
      console.log('✅ Implemented enhanced authentication middleware');

      this.securityReport.recommendations.push({
        type: 'ENHANCED_AUTH',
        implemented: true,
        description: 'Enhanced authentication middleware with token validation and security monitoring'
      });
    }
  }

  // Create token cleanup utility
  createTokenCleanupUtility() {
    const cleanupScript = `#!/usr/bin/env node

/**
 * Token Cleanup Utility
 *
 * This utility helps clean invalid tokens from localStorage and provides
 * tools for managing token security issues.
 */

const fs = require('fs');
const path = require('path');

class TokenCleanupUtility {
  static validateTokenFormat(token) {
    if (!token || typeof token !== 'string') return false;

    // Check basic JWT format
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Check token length
    if (token.length < 50 || token.length > 1000) return false;

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /^test_/i,
      /^invalid_/i,
      /^fake_/i,
      /^demo_/i
    ];

    return !suspiciousPatterns.some(pattern => pattern.test(token));
  }

  static generateCleanupScript() {
    return \`
// Browser Console Token Cleanup Script
// Paste this into browser console to clean invalid tokens

(function() {
  const storageKey = 'geo_auth';

  try {
    const authData = localStorage.getItem(storageKey);
    if (authData) {
      const parsed = JSON.parse(authData);

      if (parsed.token && !TokenCleanupUtility.validateTokenFormat(parsed.token)) {
        console.log('Removing invalid token:', parsed.token.substring(0, 20) + '...');
        localStorage.removeItem(storageKey);
        console.log('✅ Invalid token removed. Please log in again.');
        location.reload();
      } else if (parsed.token) {
        console.log('✅ Token format is valid:', parsed.token.substring(0, 20) + '...');
      } else {
        console.log('ℹ️  No token found in storage');
      }
    }
  } catch (error) {
    console.error('Error cleaning token:', error);
    localStorage.removeItem(storageKey);
    console.log('🔄 Storage cleared due to error. Please log in again.');
  }
})();
\`;
  }
}

// Export for use in other files
module.exports = TokenCleanupUtility;

// If run directly, generate cleanup script
if (require.main === module) {
  console.log(TokenCleanupUtility.generateCleanupScript());
}
`;

    const utilsDir = path.join(this.projectRoot, 'utils');
    if (!fs.existsSync(utilsDir)) {
      fs.mkdirSync(utilsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(utilsDir, 'token-cleanup.js'), cleanupScript);
    console.log('✅ Created token cleanup utility');
  }

  // Generate security monitoring dashboard
  generateSecurityMonitoring() {
    const monitoringScript = `
const JWTSecurityMonitor = {
  // Track authentication failures
  authFailures: new Map(),

  // Track suspicious activities
  suspiciousActivities: [],

  // Log authentication failure
  logFailure(ip, userAgent, error) {
    const key = ip;
    const now = Date.now();

    if (!this.authFailures.has(key)) {
      this.authFailures.set(key, {
        count: 0,
        firstFailure: now,
        lastFailure: now,
        userAgent
      });
    }

    const failure = this.authFailures.get(key);
    failure.count++;
    failure.lastFailure = now;

    // Alert if too many failures
    if (failure.count > 5) {
      this.suspiciousActivities.push({
        type: 'EXCESSIVE_FAILURES',
        ip,
        count: failure.count,
        userAgent,
        timestamp: new Date().toISOString()
      });
    }
  },

  // Get security report
  getSecurityReport() {
    return {
      timestamp: new Date().toISOString(),
      authFailures: Array.from(this.authFailures.entries()).map(([ip, data]) => ({
        ip,
        ...data
      })),
      suspiciousActivities: this.suspiciousActivities
    };
  }
};

module.exports = JWTSecurityMonitor;
`;

    const monitoringPath = path.join(this.projectRoot, 'utils', 'security-monitor.js');
    fs.writeFileSync(monitoringPath, monitoringScript);
    console.log('✅ Created security monitoring utility');
  }

  // Main implementation function
  async implementSecurity() {
    console.log('🔒 Starting JWT Security Implementation...\n');

    // 1. Check current environment
    console.log('1️⃣ Checking current environment configuration...');
    const envChecks = this.checkEnvironmentConfig();

    // 2. Backup current configuration
    console.log('\n2️⃣ Backing up current configuration...');
    const backupTimestamp = this.backupConfiguration();

    // 3. Generate and implement new JWT secret if needed
    console.log('\n3️⃣ Evaluating JWT secret security...');
    const needsNewSecret = envChecks.some(check =>
      check.issues.some(issue =>
        issue.includes('default') || issue.includes('short')
      )
    );

    if (needsNewSecret) {
      console.log('⚠️  Current JWT secret has security issues');
      const newSecret = this.generateSecureSecret();
      console.log('✅ Generated new secure JWT secret');

      this.updateJWTSecret(newSecret);
      this.securityReport.recommendations.push({
        type: 'NEW_SECRET',
        implemented: true,
        description: 'Generated new secure JWT secret to replace insecure default'
      });
    } else {
      console.log('✅ Current JWT secret appears secure');
    }

    // 4. Implement enhanced authentication
    console.log('\n4️⃣ Implementing enhanced authentication middleware...');
    this.implementEnhancedAuth();

    // 5. Create token cleanup utility
    console.log('\n5️⃣ Creating token cleanup utility...');
    this.createTokenCleanupUtility();

    // 6. Generate security monitoring
    console.log('\n6️⃣ Setting up security monitoring...');
    this.generateSecurityMonitoring();

    // 7. Generate final report
    console.log('\n7️⃣ Generating security implementation report...');
    const reportPath = path.join(this.projectRoot, 'jwt-security-implementation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.securityReport, null, 2));

    console.log('\n✅ JWT Security Implementation Complete!');
    console.log(`📋 Report saved to: jwt-security-implementation-report.json`);
    console.log(`💾 Backup timestamp: ${backupTimestamp}`);

    return this.securityReport;
  }
}

// Run implementation if this script is executed directly
if (require.main === module) {
  const implementation = new JWTSecurityImplementation();
  implementation.implementSecurity()
    .then(() => {
      console.log('\n🎉 Security implementation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Security implementation failed:', error);
      process.exit(1);
    });
}

module.exports = JWTSecurityImplementation;