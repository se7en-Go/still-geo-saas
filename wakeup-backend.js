#!/usr/bin/env node

/**
 * GEO SaaS 后端唤醒脚本
 * 解决 Render 免费实例冷启动问题
 */

const axios = require('axios');

class BackendWakeupService {
    constructor() {
        this.backendUrl = 'https://geo-backend-vp34.onrender.com';
        this.healthEndpoint = '/api/health';
        this.maxRetries = 10;
        this.baseDelay = 5000; // 5秒基础延迟
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async wakeUpBackend() {
        console.log('🚀 开始唤醒 GEO 后端服务...');
        console.log(`📍 后端地址: ${this.backendUrl}`);

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🔄 第 ${attempt}/${this.maxRetries} 次尝试唤醒服务...`);

                const response = await axios.get(`${this.backendUrl}${this.healthEndpoint}`, {
                    timeout: 30000, // 30秒超时
                    headers: {
                        'User-Agent': 'GEO-Wakeup-Service/1.0'
                    }
                });

                if (response.status === 200) {
                    console.log('✅ 后端服务唤醒成功！');
                    console.log(`📊 响应状态: ${response.status}`);
                    console.log(`🏥 健康检查: ${JSON.stringify(response.data, null, 2)}`);
                    return true;
                }
            } catch (error) {
                console.log(`❌ 第 ${attempt} 次尝试失败: ${error.message}`);

                if (error.code === 'ECONNABORTED') {
                    console.log('⏱️ 连接超时，服务可能正在启动中...');
                } else if (error.response) {
                    console.log(`📡 HTTP ${error.response.status}: ${error.response.statusText}`);
                    if (error.response.status === 404) {
                        console.log('🔍 服务已启动但路由未找到，继续尝试...');
                    }
                } else {
                    console.log('🌐 网络连接问题，继续尝试...');
                }
            }

            if (attempt < this.maxRetries) {
                const delay = this.baseDelay * Math.pow(2, attempt - 1); // 指数退避
                console.log(`⏳ 等待 ${delay/1000} 秒后重试...`);
                await this.sleep(delay);
            }
        }

        console.log('💥 所有唤醒尝试均失败！');
        console.log('📝 建议检查:');
        console.log('   1. Render 控制台中的服务状态');
        console.log('   2. 环境变量配置');
        console.log('   3. 服务日志中的错误信息');
        return false;
    }

    async testLoginEndpoint() {
        console.log('\n🔐 测试登录端点...');

        try {
            const testLogin = {
                email: 'lml1140490403@163.com',
                password: 'Zwj#1234567890'
            };

            const response = await axios.post(`${this.backendUrl}/api/auth/login`, testLogin, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                console.log('✅ 登录端点测试成功！');
                console.log(`🎫 JWT Token: ${response.data.token?.substring(0, 50)}...`);
                return true;
            }
        } catch (error) {
            console.log(`❌ 登录测试失败: ${error.message}`);
            if (error.response?.status === 401) {
                console.log('🔑 服务响应正常，但认证失败（这是预期的）');
                return true;
            }
        }
        return false;
    }

    async startKeepAlivePing() {
        console.log('\n💓 启动保活ping服务...');

        const pingInterval = 14 * 60 * 1000; // 14分钟间隔

        const ping = async () => {
            try {
                const response = await axios.get(`${this.backendUrl}${this.healthEndpoint}`, {
                    timeout: 10000
                });
                console.log(`💓 保活ping成功: ${new Date().toLocaleString()} - Status: ${response.status}`);
            } catch (error) {
                console.log(`💔 保活ping失败: ${new Date().toLocaleString()} - ${error.message}`);
            }
        };

        // 立即ping一次
        await ping();

        // 设置定期ping
        setInterval(ping, pingInterval);
        console.log(`💓 保活服务已启动，每14分钟ping一次`);
    }

    async run() {
        console.log('🌍 GEO SaaS 后端唤醒服务启动');
        console.log('=' .repeat(50));

        // 1. 唤醒后端服务
        const wakeUpSuccess = await this.wakeUpBackend();

        if (!wakeUpSuccess) {
            console.log('\n❌ 后端唤醒失败，请检查 Render 服务状态');
            return;
        }

        // 2. 测试登录功能
        await this.testLoginEndpoint();

        // 3. 启动保活服务
        console.log('\n🎯 启动保活服务防止休眠...');
        await this.startKeepAlivePing();

        console.log('\n✅ 所有任务完成！');
        console.log('📱 现在可以尝试登录: https://still-geo.gocdn.dpdns.org/');
        console.log('👤 测试账号: lml1140490403@163.com');
        console.log('🔑 密码: Zwj#1234567890');
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const wakeupService = new BackendWakeupService();
    wakeupService.run().catch(console.error);
}

module.exports = BackendWakeupService;