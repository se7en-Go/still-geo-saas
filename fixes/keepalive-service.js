// 保活服务 - 防止Render实例休眠
// 文件: frontend/src/services/keepaliveService.js

import { API_BASE_URL } from '../config';

class KeepaliveService {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.failureCount = 0;
    this.maxFailures = 3;
  }

  start() {
    if (this.isRunning) {
      console.log('Keepalive service already running');
      return;
    }

    console.log('Starting keepalive service...');
    this.isRunning = true;
    this.failureCount = 0;

    // 立即执行一次
    this.pingServer();

    // 每10分钟ping一次
    this.interval = setInterval(() => {
      this.pingServer();
    }, 10 * 60 * 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('Keepalive service stopped');
  }

  async pingServer() {
    try {
      console.log('Pinging server to keep it alive...');

      // 使用简单的健康检查端点
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // 30秒超时
        signal: AbortSignal.timeout(30000)
      });

      if (response.ok) {
        console.log('Keepalive ping successful');
        this.failureCount = 0;
      } else {
        console.warn('Keepalive ping failed:', response.status);
        this.handleFailure();
      }
    } catch (error) {
      console.warn('Keepalive ping error:', error.message);
      this.handleFailure();
    }
  }

  handleFailure() {
    this.failureCount++;

    if (this.failureCount >= this.maxFailures) {
      console.error('Keepalive service failed too many times, stopping...');
      this.stop();
    } else {
      console.log(`Keepalive failure ${this.failureCount}/${this.maxFailures}`);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      failureCount: this.failureCount,
      maxFailures: this.maxFailures
    };
  }
}

// 创建全局实例
const keepaliveService = new KeepaliveService();

export default keepaliveService;