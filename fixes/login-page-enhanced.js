// 增强版登录页面
// 文件: frontend/src/pages/LoginPage.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message, Typography, Progress, Alert } from 'antd';
import { useLoading } from '../contexts/LoadingContext';
import { useAuth } from '../contexts/AuthContext';
import keepaliveService from '../services/keepaliveService';

const LoginPage = () => {
  const navigate = useNavigate();
  const { showLoading, hideLoading } = useLoading();
  const { login } = useAuth();
  const [loginStartTime, setLoginStartTime] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // 启动保活服务
  useEffect(() => {
    keepaliveService.start();

    return () => {
      // 组件卸载时停止保活服务
      keepaliveService.stop();
    };
  }, []);

  // 计算加载进度
  useEffect(() => {
    if (loginStartTime) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - loginStartTime;
        let progress = 0;

        if (elapsed < 10000) {
          progress = 20;
        } else if (elapsed < 30000) {
          progress = 40;
        } else if (elapsed < 60000) {
          progress = 60;
        } else if (elapsed < 90000) {
          progress = 80;
        } else {
          progress = 95;
        }

        setLoadingProgress(progress);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [loginStartTime]);

  const getLoadingMessage = () => {
    if (!loginStartTime) return '正在登录...';

    const elapsed = Date.now() - loginStartTime;

    if (elapsed < 5000) {
      return '正在验证登录信息...';
    } else if (elapsed < 15000) {
      return '连接服务器中...';
    } else if (elapsed < 30000) {
      return '服务器正在启动，请稍候...';
    } else if (elapsed < 60000) {
      return '系统启动中，预计需要30-90秒...';
    } else if (elapsed < 90000) {
      return '即将完成启动，请耐心等待...';
    } else {
      return '启动时间较长，如问题持续请联系技术支持...';
    }
  };

  const handleSubmit = async (values) => {
    setLoginStartTime(Date.now());
    setLoadingProgress(10);
    showLoading(getLoadingMessage());

    try {
      await login(values);
      setLoadingProgress(100);
      message.success('登录成功！');
      navigate('/keywords', { replace: true });
    } catch (error) {
      // 更详细的错误处理
      let errorMessage = '登录失败，请重试。';

      if (error?.response?.data?.error === 'Invalid credentials.') {
        errorMessage = '邮箱或密码错误，请检查后重试。';
      } else if (error?.response?.status === 401) {
        errorMessage = '登录失败，请检查邮箱和密码。';
      } else if (error?.response?.status >= 500) {
        errorMessage = '服务器启动中，请稍后重试。';
      } else if (error?.code === 'NETWORK_ERROR') {
        errorMessage = '网络连接失败，可能是服务器正在启动中，请稍后重试。';
      } else if (error?.code === 'ECONNABORTED') {
        errorMessage = '登录超时，可能是服务器启动较慢，请稍后重试。';
      } else if (error?.message?.includes('启动中')) {
        errorMessage = error.message;
      } else if (error?.message) {
        // 避免显示可能的敏感信息
        errorMessage = error.message.length > 50 ? '登录失败，请检查信息后重试。' : error.message;
      }

      message.error(errorMessage);
    } finally {
      setLoginStartTime(null);
      setLoadingProgress(0);
      hideLoading();
    }
  };

  const LoadingIndicator = () => {
    if (!loginStartTime) return null;

    return (
      <div style={{ marginTop: 16 }}>
        <Progress
          percent={loadingProgress}
          status="active"
          showInfo={false}
          strokeColor={{
            '0%': '#108ee9',
            '100%': '#87d068',
          }}
        />
        <Typography.Text type="secondary" style={{ fontSize: '12px', marginTop: 8, display: 'block' }}>
          {getLoadingMessage()}
        </Typography.Text>
        {loadingProgress > 60 && (
          <Alert
            message="系统启动提示"
            description="免费版服务器首次启动需要较长时间，请耐心等待。如需快速启动，请联系管理员升级服务器。"
            type="info"
            style={{ marginTop: 12 }}
          />
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Card style={{ width: 450, paddingTop: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/stillgrouplogo.jpg" alt="StillGroup Logo" style={{ height: 80, marginBottom: 16 }} />
          <Typography.Title level={4} style={{ marginBottom: 4 }}>StillGroup-依然集团</Typography.Title>
        </div>

        <Typography.Title level={5} type="secondary" style={{ textAlign: 'center', marginBottom: 24 }}>
          登录 GEO 平台
        </Typography.Title>

        {/* 系统状态提示 */}
        <Alert
          message="系统启动状态"
          description="服务器可能处于休眠状态，首次访问需要等待30-90秒启动时间。"
          type="warning"
          style={{ marginBottom: 20 }}
          closable
        />

        <Form name="login" onFinish={handleSubmit} autoComplete="off" layout="vertical">
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ required: true, message: '请输入邮箱地址', type: 'email' }]}
          >
            <Input placeholder="your.name@example.com" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              登录
            </Button>
          </Form.Item>

          <LoadingIndicator />
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          没有账号？请联系IT组创建内部账户。
        </div>

        {/* 技术支持信息 */}
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: '12px', color: '#999' }}>
          如遇登录问题，请联系技术支持
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;