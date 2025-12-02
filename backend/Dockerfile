FROM node:18-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p uploads logs

# 暴露端口 - Render使用动态端口
EXPOSE $PORT

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/api/health || exit 1

# 启动应用
CMD ["npm", "start"]