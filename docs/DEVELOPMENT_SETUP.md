# GEO优化平台 - 开发环境设置指南

## 🚀 快速开始

### 系统要求
- Node.js 16+
- Git
- 代码编辑器 (推荐 VS Code)

### 开发工具
- **Claude Code**: AI代码助手
- **Claude Flow**: 多代理协调工具
- **Render CLI**: 后端部署
- **Vercel CLI**: 前端部署

## 📁 项目结构

```
GEO优化/
├── backend/                 # Node.js后端
│   ├── src/                # 源代码
│   ├── middleware/         # 中间件
│   ├── routes/            # API路由
│   ├── tests/             # 测试文件
│   └── uploads/           # 文件上传目录
├── frontend/               # React前端
│   ├── src/
│   │   ├── components/    # 组件
│   │   ├── pages/         # 页面
│   │   ├── contexts/      # 上下文
│   │   └── hooks/         # 自定义Hooks
│   └── public/            # 静态资源
├── docs/                   # 文档
├── .claude/               # Claude Code配置
└── .gitignore
```

## 🛠️ 本地开发环境设置

### 1. 克隆项目
```bash
git clone https://github.com/your-username/geo-optimization.git
cd GEO优化
```

### 2. 后端设置
```bash
cd backend
npm install

# 创建环境变量文件
cp .env.example .env

# 配置本地环境变量
nano .env
```

本地 `.env` 配置：
```env
# 数据库配置 (本地开发可使用SQLite)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_DATABASE=geo_optimization

# Redis配置 (本地开发)
REDIS_HOST=localhost
REDIS_PORT=6379

# 服务器配置
PORT=4000
JWT_SECRET=your_local_jwt_secret

# AI服务 (可选)
AI_API_KEY=your_ai_api_key
```

### 3. 前端设置
```bash
cd frontend
npm install

# 创建环境变量文件
echo "REACT_APP_API_BASE_URL=http://localhost:4000/api" > .env.local
```

### 4. 启动开发服务器
```bash
# 启动后端 (终端1)
cd backend
npm start

# 启动前端 (终端2)
cd frontend
npm start
```

访问: http://localhost:3000

## 🤖 Claude Code + Claude Flow 集成

### 安装Claude Flow
```bash
npm install -g claude-flow@alpha
```

### 项目初始化
```bash
# 初始化Claude Flow
claude-flow init --force

# 复制SPARC配置
cp "D:\unove\.claude\sparc-modes.json" ".\.claude\"
```

### 常用Claude Flow命令
```bash
# 查看可用模式
claude-flow sparc modes

# 运行TDD开发
claude-flow sparc tdd "用户认证功能"

# 记忆存储
claude-flow memory store "项目信息" "GEO优化平台开发中" --namespace project

# 记忆查询
claude-flow memory query "GEO优化" --namespace project
```

## 🗄️ 数据库设置

### 本地PostgreSQL
```bash
# 创建数据库
createdb geo_optimization

# 运行数据库初始化脚本
node db_setup.js

# 创建管理员账号
node create_admin.js
```

### 数据库迁移
```bash
# 生成迁移文件
npm run migration:create add_new_table

# 运行迁移
npm run migration:up
```

## 🔧 开发工作流

### 1. 功能开发
```bash
# 使用SPARC方法开发
claude-flow sparc run architect "设计新功能架构"
claude-flow sparc run tdd "实现用户认证"
```

### 2. 代码质量
```bash
# 代码检查
npm run lint

# 类型检查
npm run typecheck

# 运行测试
npm test
```

### 3. Git工作流
```bash
# 创建功能分支
git checkout -b feature/new-feature

# 提交代码
git add .
git commit -m "feat: add new feature"

# 推送分支
git push origin feature/new-feature

# 创建Pull Request
```

## 🧪 测试

### 单元测试
```bash
# 运行所有测试
npm test

# 监听模式
npm test -- --watch

# 覆盖率报告
npm run test:coverage
```

### 集成测试
```bash
# API测试
npm run test:integration

# E2E测试
npm run test:e2e
```

## 🐛 调试指南

### 后端调试
```javascript
// 使用debug模块
const debug = require('debug')('app:auth');
debug('用户登录请求: %s', email);

// 日志记录
const logger = require('./logger');
logger.info('用户登录成功', { userId });
```

### 前端调试
```javascript
// React DevTools
// Redux DevTools
// 浏览器开发者工具

// 自定义调试Hook
const useDebug = (componentName) => {
  useEffect(() => {
    console.log(`${componentName} mounted`);
  }, [componentName]);
};
```

## 📦 构建和部署

### 本地构建
```bash
# 后端构建
cd backend
npm run build

# 前端构建
cd frontend
npm run build
```

### 部署到云端
```bash
# 后端部署到Render
cd backend
git push origin main
# Render自动部署

# 前端部署到Vercel
cd frontend
vercel --prod
```

## 🔧 常用开发脚本

### package.json 脚本示例
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm start",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm test",
    "test:frontend": "cd frontend && npm test",
    "lint": "npm run lint:backend && npm run lint:frontend",
    "build": "npm run build:backend && npm run build:frontend"
  }
}
```

## 📚 API文档

### 本地API文档
```bash
# 启动API文档服务器
npm run docs:serve

# 访问API文档
# http://localhost:3001/docs
```

### Postman集合
导入 `docs/api/postman_collection.json` 到Postman

## 🎯 开发最佳实践

### 代码规范
- 使用ESLint和Prettier
- 遵循React Hooks最佳实践
- 使用TypeScript类型检查

### 安全考虑
- 输入验证和清理
- SQL注入防护
- XSS防护
- CSRF保护

### 性能优化
- 数据库查询优化
- Redis缓存策略
- 前端代码分割
- 图片懒加载

## 🔗 相关资源

### 文档链接
- [项目状态文档](../agents.md)
- [云端部署指南](./CLOUD_DEPLOYMENT_GUIDE.md)
- [API参考文档](./API_REFERENCE.md)

### 工具文档
- [Claude Code文档](https://claude.com/claude-code)
- [Claude Flow文档](https://github.com/ruvnet/claude-flow)
- [Render文档](https://render.com/docs)
- [Vercel文档](https://vercel.com/docs)

---
**最后更新**: 2025-12-02
**维护者**: GEO优化团队