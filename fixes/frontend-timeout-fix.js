// 前端超时修复方案
// 文件: frontend/src/hooks/useApi.js

import { useCallback } from 'react';
import axios from 'axios';
import { message } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';

export const useApi = () => {
  const { token, logout } = useAuth();

  return useCallback(
    async ({ method = 'get', url, data, params, headers = {}, responseType }) => {
      try {
        // 调试信息
        if (process.env.NODE_ENV === 'development') {
          console.log('API Request:', {
            method,
            url: `${API_BASE_URL}${url}`,
            hasToken: !!token,
            tokenLength: token?.length,
            tokenPrefix: token?.substring(0, 10) + '...'
          });
        }

        // 修复1: 增加超时时间到120秒
        const response = await axios({
          method,
          url: `${API_BASE_URL}${url}`,
          data,
          params,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            ...(token ? { 'x-auth-token': token } : {}),
          },
          responseType,
          withCredentials: true,
          timeout: 120000, // 从60秒增加到120秒
        });

        return response.data;
      } catch (error) {
        // 增强错误处理
        console.error('API Error:', {
          status: error?.response?.status,
          statusText: error?.response?.statusText,
          data: error?.response?.data,
          url: `${API_BASE_URL}${url}`,
          method
        });

        // 修复2: 更详细的错误处理
        if (error?.code === 'ECONNABORTED') {
          message.error('请求超时，可能由于服务器启动中，请稍后重试。');
        } else if (error?.response?.status === 401) {
          message.warning('登录状态已失效，请重新登录。');
          logout();
        } else if (error?.response?.status === 403) {
          message.error('权限不足，无法访问此资源。');
        } else if (error?.response?.status >= 500) {
          message.error('服务器内部错误，请稍后重试。');
        } else if (error?.code === 'NETWORK_ERROR' || !error.response) {
          message.error('网络连接失败，可能是服务器正在启动，请稍后重试。');
        } else if (error?.code === 'ECONNREFUSED') {
          message.error('无法连接到服务器，请稍后重试。');
        }

        const friendlyMessage = getFriendlyErrorMessage(error);
        if (friendlyMessage !== message.error) {
          message.error(friendlyMessage);
        }
        throw error;
      }
    },
    [token, logout]
  );
};

function getFriendlyErrorMessage(error) {
  // 如果error字段包含敏感信息模式，使用通用错误消息
  if (error?.response?.data?.error) {
    const errorMsg = error.response.data.error;

    // 检测敏感信息模式 (密码、token等)
    const sensitivePatterns = [
      /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/, // 密码模式
      /^[A-Za-z0-9._-]+$/, // token模式
    ];

    const isSensitive = sensitivePatterns.some(pattern => pattern.test(errorMsg));

    if (isSensitive) {
      return '登录失败，请检查邮箱和密码';
    }

    // 已知的后端错误消息映射
    const knownErrors = {
      'Invalid credentials.': '邮箱或密码错误',
      'User not found.': '用户不存在',
      'Token has expired.': '登录已过期，请重新登录',
      'Token is not valid.': '登录状态无效，请重新登录',
    };

    if (knownErrors[errorMsg]) {
      return knownErrors[errorMsg];
    }

    // 其他情况截断过长的错误消息
    if (errorMsg.length > 100) {
      return errorMsg.substring(0, 100) + '...';
    }
  }

  return error?.response?.data?.error || error?.message || '请求失败，请重试';
}