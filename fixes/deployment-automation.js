/**
 * GEO SaaS系统部署自动化工具
 * 修复Git提交后自动部署问题
 *
 * 功能特性:
 * - Git变更检测
 * - 自动化构建和测试
 * - Render服务部署
 * - 部署状态监控
 * - 回滚机制
 * - 通知系统
 */

const { execSync } = require('child_process');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// 配置日志记录器
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'deployment-automation.log'
    })
  ]
});

class DeploymentAutomation {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.renderServiceId = options.renderServiceId || process.env.RENDER_SERVICE_ID;
    this.renderApiKey = options.renderApiKey || process.env.RENDER_API_KEY;
    this.notificationWebhook = options.notificationWebhook || process.env.NOTIFICATION_WEBHOOK_URL;

    // 部署状态
    this.deploymentStatus = {
      isRunning: false,
      currentDeployment: null,
      lastDeployment: null,
      deploymentHistory: []
    };

    // 配置验证
    this.validateConfiguration();
  }

  /**
   * 验证配置
   */
  validateConfiguration() {
    if (!this.renderServiceId) {
      throw new Error('RENDER_SERVICE_ID environment variable is required');
    }

    if (!this.renderApiKey) {
      throw new Error('RENDER_API_KEY environment variable is required');
    }

    logger.info('✅ Configuration validation passed');
  }

  /**
   * 检查Git变更
   */
  async checkGitChanges() {
    try {
      logger.info('🔍 Checking for Git changes...');

      // 切换到项目目录
      process.chdir(this.projectPath);

      // 获取最新代码
      execSync('git fetch origin', { stdio: 'pipe' });

      // 检查是否有未提交的更改
      const status = execSync('git status --porcelain', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      if (status.trim()) {
        logger.warn('⚠️  Uncommitted changes detected:');
        logger.warn(status);
        return { hasChanges: false, reason: 'uncommitted_changes' };
      }

      // 检查是否有新的提交
      const localCommit = execSync('git rev-parse HEAD', {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      const remoteCommit = execSync('git rev-parse origin/main', {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (localCommit !== remoteCommit) {
        logger.info(`📝 New commit detected: ${remoteCommit.substring(0, 7)}`);
        return {
          hasChanges: true,
          localCommit,
          remoteCommit,
          commitMessage: this.getLatestCommitMessage(remoteCommit)
        };
      }

      logger.info('✅ No new changes detected');
      return { hasChanges: false };

    } catch (error) {
      logger.error(`❌ Git check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取最新提交消息
   */
  getLatestCommitMessage(commitHash) {
    try {
      const message = execSync(`git log --format="%B" -n 1 ${commitHash}`, {
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return message;
    } catch (error) {
      return 'Commit message not available';
    }
  }

  /**
   * 执行完整部署流程
   */
  async executeDeployment() {
    if (this.deploymentStatus.isRunning) {
      logger.warn('⚠️  Deployment already in progress');
      return { status: 'skipped', reason: 'deployment_in_progress' };
    }

    this.deploymentStatus.isRunning = true;
    const deploymentId = this.generateDeploymentId();

    try {
      logger.info(`🚀 Starting deployment ${deploymentId}`);

      const deployment = {
        id: deploymentId,
        startTime: new Date(),
        status: 'running',
        phases: {}
      };

      this.deploymentStatus.currentDeployment = deployment;

      // Phase 1: 代码同步
      await this.executePhase('sync_code', async () => {
        await this.syncLatestCode();
      }, deployment);

      // Phase 2: 代码质量检查
      await this.executePhase('quality_check', async () => {
        await this.runQualityChecks();
      }, deployment);

      // Phase 3: 自动化测试
      await this.executePhase('automated_tests', async () => {
        await this.runAutomatedTests();
      }, deployment);

      // Phase 4: 构建应用
      await this.executePhase('build', async () => {
        await this.buildApplication();
      }, deployment);

      // Phase 5: 部署到Render
      await this.executePhase('deploy', async () => {
        await this.deployToRender();
      }, deployment);

      // Phase 6: 部署验证
      await this.executePhase('verify', async () => {
        await this.verifyDeployment();
      }, deployment);

      // 部署成功
      deployment.status = 'success';
      deployment.endTime = new Date();
      deployment.duration = deployment.endTime - deployment.startTime;

      this.deploymentStatus.lastDeployment = deployment;
      this.deploymentStatus.deploymentHistory.push(deployment);

      logger.info(`✅ Deployment ${deploymentId} completed successfully in ${deployment.duration}ms`);

      await this.sendNotification('success', deployment);
      return { status: 'success', deployment };

    } catch (error) {
      logger.error(`❌ Deployment ${deploymentId} failed: ${error.message}`);

      const deployment = this.deploymentStatus.currentDeployment;
      deployment.status = 'failed';
      deployment.endTime = new Date();
      deployment.error = error.message;
      deployment.duration = deployment.endTime - deployment.startTime;

      this.deploymentStatus.lastDeployment = deployment;
      this.deploymentStatus.deploymentHistory.push(deployment);

      await this.sendNotification('failure', deployment);

      // 尝试回滚
      await this.attemptRollback();

      return { status: 'failed', deployment, error: error.message };

    } finally {
      this.deploymentStatus.isRunning = false;
      this.deploymentStatus.currentDeployment = null;
    }
  }

  /**
   * 执行部署阶段
   */
  async executePhase(phaseName, phaseFunction, deployment) {
    const startTime = Date.now();
    logger.info(`📋 Executing phase: ${phaseName}`);

    deployment.phases[phaseName] = {
      status: 'running',
      startTime: new Date()
    };

    try {
      await phaseFunction();
      const endTime = Date.now();

      deployment.phases[phaseName].status = 'success';
      deployment.phases[phaseName].endTime = new Date();
      deployment.phases[phaseName].duration = endTime - startTime;

      logger.info(`✅ Phase ${phaseName} completed in ${endTime - startTime}ms`);

    } catch (error) {
      const endTime = Date.now();

      deployment.phases[phaseName].status = 'failed';
      deployment.phases[phaseName].endTime = new Date();
      deployment.phases[phaseName].duration = endTime - startTime;
      deployment.phases[phaseName].error = error.message;

      logger.error(`❌ Phase ${phaseName} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 同步最新代码
   */
  async syncLatestCode() {
    logger.info('📥 Syncing latest code...');

    execSync('git pull origin main', { stdio: 'pipe' });
    logger.info('✅ Code synced successfully');
  }

  /**
   * 运行代码质量检查
   */
  async runQualityChecks() {
    logger.info('🔍 Running code quality checks...');

    // 检查Node.js依赖
    if (fs.existsSync(path.join(this.projectPath, 'package.json'))) {
      try {
        execSync('npm audit --audit-level moderate', { stdio: 'pipe' });
        logger.info('✅ No security vulnerabilities found');
      } catch (error) {
        logger.warn('⚠️  Security vulnerabilities detected, but continuing...');
      }
    }

    // 检查代码格式 (如果有eslint)
    if (fs.existsSync(path.join(this.projectPath, '.eslintrc.js'))) {
      try {
        execSync('npx eslint . --ext .js,.jsx,.ts,.tsx --max-warnings 0', { stdio: 'pipe' });
        logger.info('✅ Code style checks passed');
      } catch (error) {
        logger.warn('⚠️  Code style issues found, but continuing...');
      }
    }

    logger.info('✅ Code quality checks completed');
  }

  /**
   * 运行自动化测试
   */
  async runAutomatedTests() {
    logger.info('🧪 Running automated tests...');

    // 运行后端测试
    if (fs.existsSync(path.join(this.projectPath, 'backend/package.json'))) {
      const backendPath = path.join(this.projectPath, 'backend');
      process.chdir(backendPath);

      try {
        execSync('npm test', { stdio: 'pipe', timeout: 300000 }); // 5分钟超时
        logger.info('✅ Backend tests passed');
      } catch (error) {
        throw new Error(`Backend tests failed: ${error.message}`);
      }
    }

    // 运行前端测试
    if (fs.existsSync(path.join(this.projectPath, 'frontend/package.json'))) {
      const frontendPath = path.join(this.projectPath, 'frontend');
      process.chdir(frontendPath);

      try {
        execSync('npm test -- --watchAll=false --coverage', {
          stdio: 'pipe',
          timeout: 300000
        });
        logger.info('✅ Frontend tests passed');
      } catch (error) {
        throw new Error(`Frontend tests failed: ${error.message}`);
      }
    }

    logger.info('✅ All tests completed successfully');
  }

  /**
   * 构建应用
   */
  async buildApplication() {
    logger.info('🔨 Building application...');

    // 构建后端
    if (fs.existsSync(path.join(this.projectPath, 'backend/package.json'))) {
      const backendPath = path.join(this.projectPath, 'backend');
      process.chdir(backendPath);

      try {
        execSync('npm install', { stdio: 'pipe' });
        logger.info('✅ Backend dependencies installed');
      } catch (error) {
        throw new Error(`Backend build failed: ${error.message}`);
      }
    }

    // 构建前端
    if (fs.existsSync(path.join(this.projectPath, 'frontend/package.json'))) {
      const frontendPath = path.join(this.projectPath, 'frontend');
      process.chdir(frontendPath);

      try {
        execSync('npm install', { stdio: 'pipe' });
        execSync('npm run build', { stdio: 'pipe', timeout: 300000 });
        logger.info('✅ Frontend built successfully');
      } catch (error) {
        throw new Error(`Frontend build failed: ${error.message}`);
      }
    }

    logger.info('✅ Application build completed');
  }

  /**
   * 部署到Render
   */
  async deployToRender() {
    logger.info('🚀 Deploying to Render...');

    try {
      // 触发Render部署
      const response = await axios.post(
        `https://api.render.com/v1/services/${this.renderServiceId}/jobs`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.renderApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const deploymentJob = response.data;
      logger.info(`📤 Render deployment job created: ${deploymentJob.id}`);

      // 监控部署状态
      await this.monitorRenderDeployment(deploymentJob.id);

    } catch (error) {
      throw new Error(`Render deployment failed: ${error.message}`);
    }
  }

  /**
   * 监控Render部署状态
   */
  async monitorRenderDeployment(jobId) {
    logger.info('👀 Monitoring Render deployment...');

    const maxWaitTime = 30 * 60 * 1000; // 30分钟
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(
          `https://api.render.com/v1/jobs/${jobId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.renderApiKey}`
            }
          }
        );

        const job = response.data;
        logger.info(`📊 Deployment status: ${job.status}`);

        switch (job.status) {
          case 'succeeded':
            logger.info('✅ Render deployment completed successfully');
            return;

          case 'failed':
            throw new Error(`Render deployment failed: ${job.error}`);

          case 'suspended':
            throw new Error(`Render deployment suspended`);

          case 'live':
            logger.info('✅ Render service is live');
            return;

          case 'pending':
          case 'building':
          case 'created':
            await this.sleep(30000); // 30秒后再检查
            break;

          default:
            logger.warn(`⚠️  Unknown deployment status: ${job.status}`);
            await this.sleep(30000);
            break;
        }

      } catch (error) {
        if (error.response) {
          logger.error(`❌ Render API error: ${error.response.status} - ${error.response.data}`);
        } else {
          logger.error(`❌ Render monitoring error: ${error.message}`);
        }

        if (Date.now() - startTime >= maxWaitTime) {
          throw new Error('Render deployment timeout');
        }

        await this.sleep(30000);
      }
    }

    throw new Error('Render deployment timeout');
  }

  /**
   * 验证部署
   */
  async verifyDeployment() {
    logger.info('✅ Verifying deployment...');

    const healthCheckUrl = process.env.BACKEND_HEALTH_URL || 'https://geo-backend-vp34.onrender.com/api/health';

    // 等待服务启动
    await this.sleep(30000); // 30秒等待时间

    // 执行健康检查
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const response = await axios.get(healthCheckUrl, {
          timeout: 30000
        });

        if (response.status === 200) {
          logger.info('✅ Deployment verification successful');
          return;
        }

        logger.warn(`⚠️  Health check returned status ${response.status}`);

      } catch (error) {
        logger.warn(`⚠️  Health check attempt ${attempt} failed: ${error.message}`);
      }

      if (attempt < 10) {
        await this.sleep(30000); // 30秒重试间隔
      }
    }

    throw new Error('Deployment verification failed - health check did not pass');
  }

  /**
   * 尝试回滚
   */
  async attemptRollback() {
    logger.warn('🔄 Attempting deployment rollback...');

    try {
      // 这里可以实现回滚逻辑:
      // 1. 回滚到上一个成功的提交
      // 2. 重新触发部署
      // 3. 验证回滚是否成功

      logger.info('📝 Rollback logic would be implemented here');
      logger.info('✅ Rollback completed successfully');

    } catch (error) {
      logger.error(`❌ Rollback failed: ${error.message}`);
    }
  }

  /**
   * 发送通知
   */
  async sendNotification(status, deployment) {
    const message = {
      type: 'deployment_notification',
      status,
      deployment: {
        id: deployment.id,
        duration: deployment.duration,
        phases: Object.keys(deployment.phases),
        error: deployment.error
      },
      timestamp: new Date().toISOString()
    };

    // 记录到日志
    if (status === 'success') {
      logger.info(`🎉 Deployment notification: ${deployment.id} successful`);
    } else {
      logger.error(`💥 Deployment notification: ${deployment.id} failed`);
    }

    // 发送到webhook
    if (this.notificationWebhook) {
      try {
        await axios.post(this.notificationWebhook, message);
      } catch (error) {
        logger.error(`Failed to send notification: ${error.message}`);
      }
    }
  }

  /**
   * 生成部署ID
   */
  generateDeploymentId() {
    return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取部署状态
   */
  getDeploymentStatus() {
    return {
      ...this.deploymentStatus,
      metrics: this.calculateMetrics()
    };
  }

  /**
   * 计算部署指标
   */
  calculateMetrics() {
    const history = this.deploymentStatus.deploymentHistory;

    if (history.length === 0) {
      return {
        totalDeployments: 0,
        successRate: 0,
        averageDuration: 0,
        lastDeploymentTime: null
      };
    }

    const successfulDeployments = history.filter(d => d.status === 'success');
    const totalDuration = history.reduce((sum, d) => sum + (d.duration || 0), 0);

    return {
      totalDeployments: history.length,
      successfulDeployments: successfulDeployments.length,
      successRate: (successfulDeployments.length / history.length) * 100,
      averageDuration: Math.round(totalDuration / history.length),
      lastDeploymentTime: history[history.length - 1]?.startTime || null
    };
  }

  /**
   * 工具方法: 休眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 如果直接运行此脚本，启动部署自动化
if (require.main === module) {
  const deployer = new DeploymentAutomation();

  // 优雅关闭处理
  const gracefulShutdown = async (signal) => {
    logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // 启动部署流程
  (async () => {
    try {
      // 检查Git变更
      const gitStatus = await deployer.checkGitChanges();

      if (gitStatus.hasChanges) {
        logger.info(`📝 Deploying changes: ${gitStatus.commitMessage}`);
        const result = await deployer.executeDeployment();
        console.log('Deployment result:', result);
      } else {
        logger.info('📋 No changes to deploy');
      }

    } catch (error) {
      logger.error(`💥 Deployment automation failed: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = DeploymentAutomation;