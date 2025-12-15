// 认证上下文修复方案
// 文件: frontend/src/contexts/AuthContext.js

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { message } from 'antd';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://geo-backend-vp34.onrender.com/api';

const AuthContext = createContext();

const storageKey = 'geo_auth';

function loadStoredAuth() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => loadStoredAuth().token);
  const [user, setUser] = useState(() => loadStoredAuth().user);
  const [initializing, setInitializing] = useState(true);

  const persist = useCallback((nextToken, nextUser) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ token: nextToken, user: nextUser })
      );
    } catch {
      // ignore storage issues
    }
  }, []);

  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore storage issues
    }
  }, []);

  useEffect(() => {
    const hydrateUser = async () => {
      if (!token || user) {
        setInitializing(false);
        return;
      }
      try {
        const res = await axios.get(`${API_BASE_URL}/auth/me`, {
          headers: { 'x-auth-token': token },
          timeout: 120000 // 修复: 增加到120秒
        });
        setUser(res.data);
        persist(token, res.data);
      } catch (err) {
        // 更温和的错误处理
        if (err.code === 'ECONNABORTED') {
          console.warn('用户验证超时，可能是服务器启动中');
          message.warning('连接服务器超时，请稍后重试');
        } else {
          message.warning('会话已过期，请重新登录。');
          setToken(null);
          setUser(null);
          clearStorage();
        }
      } finally {
        setInitializing(false);
      }
    };

    hydrateUser();
  }, [token, user, persist, clearStorage]);

  const login = useCallback(async (credentials) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/login`, credentials, {
        timeout: 120000, // 修复: 从60秒增加到120秒
        headers: {
          'Content-Type': 'application/json',
        }
      });
      const nextToken = res.data.token;
      const nextUser = res.data.user;
      setToken(nextToken);
      setUser(nextUser);
      persist(nextToken, nextUser);
      message.success('登录成功。');
      return nextUser;
    } catch (error) {
      // 修复: 更详细的错误处理
      if (error.code === 'ECONNABORTED') {
        throw new Error('登录请求超时，可能是服务器正在启动中，请稍后重试。');
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        throw new Error('网络连接失败，请检查网络连接或稍后重试。');
      } else if (error.response?.status === 401) {
        throw new Error('邮箱或密码错误，请检查后重试。');
      } else if (error.response?.status >= 500) {
        throw new Error('服务器暂时无法响应，请稍后重试。');
      } else {
        throw error;
      }
    }
  }, [persist]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearStorage();
    message.success('已安全退出。');
  }, [clearStorage]);

  const hasRole = useCallback((requiredRoles) => {
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    if (!user?.role) {
      return false;
    }
    return requiredRoles.includes(user.role);
  }, [user]);

  const value = useMemo(() => ({
    token,
    user,
    initializing,
    login,
    logout,
    hasRole,
  }), [token, user, initializing, login, logout, hasRole]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};