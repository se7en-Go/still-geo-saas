# JWT Key Rotation Strategy

## Executive Summary

This document outlines a comprehensive JWT key rotation strategy for the GEO SaaS platform that ensures continuous service availability while maintaining security standards.

## 🔄 Key Rotation Overview

### Current State
- **Active Secret**: `geo_optimization_jwt_secret_32VHgtlzJhor6CVRC9y9cJQs8vGqWC0p7VFsS2WwcQhETvHsHrH8SEUpy0Do7U3`
- **Security Level**: Strong (98 characters, non-default)
- **Rotation Need**: Immediate due to historical inconsistencies

### Rotation Goals
1. **Zero Downtime**: Users remain logged in during rotation
2. **Security Enhancement**: Regular secret updates prevent compromise
3. **Gradual Transition**: Support multiple valid secrets simultaneously
4. **Automated Process**: Minimize manual intervention and errors

## 🛠️ Multi-Secret Verification System

### Implementation Strategy

#### Phase 1: Multi-Secret Support (Immediate)
```javascript
// Enhanced JWT verification with rotation support
class JWTKeyRotation {
  constructor() {
    this.secrets = {
      current: process.env.JWT_SECRET,
      previous: process.env.JWT_SECRET_PREV,
      next: process.env.JWT_SECRET_NEXT
    };
  }

  verifyToken(token) {
    const secrets = [
      this.secrets.current,    // Primary secret
      this.secrets.previous,   // Previous secret (grace period)
      this.secrets.next        // Next secret (pre-deployment)
    ].filter(Boolean);

    for (const secret of secrets) {
      try {
        return jwt.verify(token, secret);
      } catch (err) {
        continue; // Try next secret
      }
    }

    throw new Error('Token verification failed with all secrets');
  }

  signToken(payload, options = {}) {
    return jwt.sign(payload, this.secrets.current, options);
  }
}
```

#### Phase 2: Token Versioning (Week 1)
```javascript
// Token versioning for rotation tracking
const createVersionedToken = (payload, version = 'v1') => {
  const versionedPayload = {
    ...payload,
    version,
    createdAt: Date.now()
  };

  return jwt.sign(versionedPayload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiry,
    algorithm: 'HS256'
  });
};

const verifyVersionedToken = (token) => {
  const decoded = jwt.verify(token, config.auth.jwtSecret);

  // Handle different token versions
  switch (decoded.version) {
    case 'v1':
      return decoded;
    case 'v2':
      // Handle v2 specific logic
      return decoded;
    default:
      throw new Error(`Unsupported token version: ${decoded.version}`);
  }
};
```

## 📅 Rotation Timeline

### Pre-Rotation Preparation (Day 0)
1. **Generate New Secret**:
   ```javascript
   const generateRotationSecret = () => {
     return crypto.randomBytes(64).toString('base64');
   };
   ```

2. **Environment Setup**:
   ```bash
   # Current secret (primary)
   JWT_SECRET=current_secret_here

   # Previous secret (fallback, 30 days)
   JWT_SECRET_PREV=previous_secret_here

   # Next secret (prepared for rotation)
   JWT_SECRET_NEXT=next_secret_here

   # Rotation tracking
   JWT_ROTATION_ENABLED=true
   JWT_SECRET_VERSION=2025_01
   ```

### Rotation Execution (Day 1-7)

#### Day 1: Pre-Rotation
- [ ] Generate new secret
- [ ] Set `JWT_SECRET_NEXT` environment variable
- [ ] Deploy multi-secret verification system
- [ ] Monitor authentication success rates

#### Day 2-3: Testing Phase
- [ ] Deploy new secret to staging environment
- [ ] Test token generation and verification
- [ ] Validate multi-secret support
- [ ] Monitor for authentication failures

#### Day 4: Graceful Transition
- [ ] Promote `JWT_SECRET_NEXT` to `JWT_SECRET`
- [ ] Move current secret to `JWT_SECRET_PREV`
- [ ] Clear `JWT_SECRET_NEXT`
- [ ] Monitor for issues (24-hour observation period)

#### Day 5-7: Validation Period
- [ ] Verify all authentication flows work correctly
- [ ] Check for any legacy token issues
- [ ] Monitor performance impact
- [ ] Prepare for next rotation cycle

### Post-Rotation Cleanup (Day 30)
- [ ] Remove `JWT_SECRET_PREV` after 30 days
- [ ] Archive old secrets securely
- [ ] Document rotation success
- [ ] Schedule next rotation

## 🔧 Automated Rotation System

### Rotation Automation Script
```javascript
// scripts/rotate-jwt-secret.js
class JWTRotationManager {
  constructor() {
    this.rotationInterval = 90 * 24 * 60 * 60 * 1000; // 90 days
    this.gracePeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  async executeRotation() {
    console.log('🔄 Starting JWT key rotation...');

    try {
      // 1. Generate new secret
      const newSecret = await this.generateNewSecret();

      // 2. Update environment variables
      await this.updateEnvironmentVariables(newSecret);

      // 3. Test new configuration
      await this.testNewConfiguration();

      // 4. Deploy to production
      await this.deployRotation();

      // 5. Monitor post-rotation
      await this.monitorPostRotation();

      console.log('✅ JWT key rotation completed successfully');
    } catch (error) {
      console.error('❌ JWT key rotation failed:', error);
      await this.rollbackRotation();
      throw error;
    }
  }

  async generateNewSecret() {
    return crypto.randomBytes(64).toString('base64');
  }

  async updateEnvironmentVariables(newSecret) {
    // Update Render environment variables
    const renderApi = require('./render-api');

    await renderApi.updateEnvironmentVariable('JWT_SECRET_NEXT', newSecret);
    await renderApi.updateEnvironmentVariable('JWT_ROTATION_TIMESTAMP', Date.now().toString());
  }

  async testNewConfiguration() {
    // Test token generation and verification
    const testPayload = { user: { id: 'test', role: 'user' } };
    const testToken = jwt.sign(testPayload, process.env.JWT_SECRET_NEXT);

    // Verify with multi-secret system
    const verified = this.verifyWithAllSecrets(testToken);
    if (!verified) {
      throw new Error('New secret verification failed');
    }
  }
}
```

### Monitoring and Alerting
```javascript
// utils/rotation-monitor.js
class RotationMonitor {
  constructor() {
    this.metrics = {
      authenticationSuccess: 0,
      authenticationFailure: 0,
      secretUsage: {
        current: 0,
        previous: 0,
        next: 0
      }
    };
  }

  trackAuthenticationAttempt(token, success, usedSecret) {
    if (success) {
      this.metrics.authenticationSuccess++;
      this.metrics.secretUsage[usedSecret]++;
    } else {
      this.metrics.authenticationFailure++;
    }

    // Alert if failure rate > 1%
    const failureRate = this.metrics.authenticationFailure /
      (this.metrics.authenticationSuccess + this.metrics.authenticationFailure);

    if (failureRate > 0.01) {
      this.sendAlert('High authentication failure rate detected', {
        failureRate,
        timestamp: new Date().toISOString()
      });
    }
  }

  sendAlert(message, details) {
    // Send to monitoring system (Slack, email, etc.)
    console.warn('🚨 JWT Rotation Alert:', message, details);
  }
}
```

## 🚨 Emergency Rollback Plan

### Rollback Triggers
1. **High Failure Rate**: >5% authentication failures
2. **Performance Impact**: >200ms increase in auth time
3. **Security Incidents**: Suspected secret compromise

### Rollback Procedure
```javascript
// scripts/emergency-rollback.js
class EmergencyRollback {
  async execute() {
    console.log('🚨 Emergency JWT rollback initiated...');

    try {
      // 1. Restore previous secret
      await this.restorePreviousSecret();

      // 2. Clear problematic secrets
      await this.clearProblematicSecrets();

      // 3. Restart authentication services
      await this.restartAuthServices();

      // 4. Verify rollback success
      await this.verifyRollback();

      console.log('✅ Emergency rollback completed');
    } catch (error) {
      console.error('❌ Emergency rollback failed:', error);
      // Implement manual intervention procedure
    }
  }

  async restorePreviousSecret() {
    const previousSecret = process.env.JWT_SECRET_PREV;
    if (!previousSecret) {
      throw new Error('No previous secret available for rollback');
    }

    await this.updateEnvironmentVariable('JWT_SECRET', previousSecret);
  }
}
```

## 📊 Success Metrics

### Security Metrics
- [ ] 0% secret compromise incidents
- [ ] 100% rotation completion without downtime
- [ ] <1% authentication failure rate during rotation
- [ ] <100ms authentication time impact

### Operational Metrics
- [ ] Automated rotation success rate >99%
- [ ] Rollback availability within 5 minutes
- [ ] Monitoring alert response time <1 minute
- [ ] Documentation completeness and accuracy

## 🔒 Security Best Practices

### Secret Management
1. **Environment Variables**: Never commit secrets to code
2. **Access Control**: Limit secret access to authorized personnel
3. **Secure Storage**: Use secure secret management systems
4. **Audit Trail**: Log all secret changes and access

### Rotation Security
1. **Pre-Generate**: Generate next secret before rotation
2. **Gradual Phase-Out**: Keep previous secret for grace period
3. **Validation**: Thoroughly test before production deployment
4. **Monitoring**: Continuous monitoring during and after rotation

### Compliance Requirements
1. **Documentation**: Maintain rotation logs and timestamps
2. **Audit**: Regular security audits of rotation process
3. **Testing**: Periodic rotation testing and validation
4. **Incident Response**: Documented rollback procedures

---

## Implementation Checklist

### Pre-Rotation
- [ ] Generate new secure secret
- [ ] Update environment variables safely
- [ ] Implement multi-secret verification
- [ ] Set up monitoring and alerting
- [ ] Test rotation procedure in staging

### During Rotation
- [ ] Deploy new secret configuration
- [ ] Monitor authentication metrics
- [ ] Validate all authentication flows
- [ ] Check for performance impact
- [ ] Document any issues encountered

### Post-Rotation
- [ ] Verify rotation success
- [ ] Remove old secrets after grace period
- [ ] Update documentation
- [ ] Schedule next rotation
- [ ] Review and improve process

---

**Implementation Timeline**: 90-day rotation cycle
**Success Criteria**: Zero downtime, <1% failure rate
**Next Rotation**: Automated execution scheduled
**Emergency Contact**: Security team notified on failure

This strategy ensures secure, reliable JWT key rotation with minimal impact on user experience and maximum security assurance.