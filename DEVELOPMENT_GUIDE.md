## 1. 项目概览

### 1.1 简介
GEO（Generative Engine Optimization）是一套内部 AI 营销工作流平台，覆盖关键词管理、素材沉淀、AI 内容创建、排期分发以及 GEO 数据分析，目标是打通从数据准备到发布复盘的完整链路。

### 1.2 核心流程
1. **关键词管理**：收集、扩展、整理关键词与长尾词，并沉淀 Schema 元数据。
2. **素材沉淀**：文档、图片、知识集合（`knowledge_sets`）统一管理，支持 OCR / 向量化。
3. **AI 内容生成**：基于规则 + 关键词/长尾词 + 知识库上下文生成正文与结构化输出。
4. **内容排期与发布**：多渠道排期、Mock 数据监控。
5. **GEO 数据分析**：可视化内容表现，反哺下一轮关键词/内容策略。

## 2. 技术栈与模块
- 前端：React、React Router、Ant Design、@ant-design/charts、Storybook。
- 后端：Node.js、Express、BullMQ、Winston、Joi。
- 数据：PostgreSQL（pg-mem 用于测试）、Redis（BullMQ）。
- AI：Embedding + ChatCompletion（含 fallback），DeepSeek OCR。

**主要目录**
| 模块 | 职责 |
| --- | --- |
| `/frontend` | React SPA，承载 UI、交互、Storybook |
| `/backend` | Express API，包含业务路由、BullMQ 入口 |
| `/backend/worker.js` | BullMQ Worker，负责内容生成 |
| PostgreSQL | 存储用户、关键词、知识库、规则、生成内容、排期等 |
| Redis | BullMQ 队列 / 事件 |

## 3. 数据模型概览
- `users`：账号 + 角色。
- `keywords`：基础关键词，关联 `long_tail_keywords`、`schema_metadata`。
- `keyword_variations`：长尾词，带 `schema_metadata`。
- `knowledge_sets`：知识集合（名称、描述、`schema_metadata`、`is_default`），每个用户自动拥有默认集合，可关联多篇文档。
- `documents`：知识库文档（`knowledge_set_id`、`schema_metadata`、`document_chunks`）。
- `images` / `image_collections`：图片素材及分组。
- `generation_rules`：内容生成规则（`schema_config`、榜单配置、渠道策略等）。
- `generated_content`：生成记录（正文、摘要、图片、`schema_payload/schema_types`）。
- `content_schedules`：内容排期。

索引重点：`keywords` / `keyword_variations` / `documents` / `knowledge_sets` 均按 `user_id + created_at` 建索引；`documents` 额外索引 `knowledge_set_id`；`document_chunks` 关联 `document_id`、`user_id` 以优化向量检索。

## 4. API 概览
- **认证**：`POST /api/auth/login`、`POST /api/auth/admin/users`、`GET /api/auth/admin/users`、`GET /api/auth/me`。
- **关键词**：`GET /api/keywords`、`POST /api/keywords`、`POST /api/keywords/expand`、`PUT/DELETE /api/keywords/:id`、`PATCH /api/keywords/:id/variations/bulk`、`GET /api/keywords/metrics`、批量导入导出。
- **知识库文档**：`POST /api/documents/upload`（可携带 `knowledgeSetId`）、`GET /api/documents?knowledgeSetId=`、`DELETE /api/documents/:id`、`PUT /api/documents/:id/schema`、`PUT /api/documents/:id/knowledge-set`。
- **知识集合**：`GET /api/knowledge-sets?page=&pageSize=&search=`、`POST /api/knowledge-sets`、`PUT /api/knowledge-sets/:id`、`DELETE /api/knowledge-sets/:id`。
- **图片**：`/api/images`、`/api/image-collections` CRUD。
- **规则**：`/api/rules` CRUD，支持 `schema_config`、榜单配置、渠道策略。
- **内容生成**：`POST /api/content/generate`（`knowledgeBaseId` 或 `knowledgeSetId` 二选一）、`GET /api/content/jobs/:id`、`GET /api/content`、`DELETE /api/content/:id`。
- **排期**：`POST/GET/DELETE /api/content/schedules`。
- **GEO（Mock）**：`GET /api/geo/*`。

## 5. 开发工作流
```bash
# 后端
cd backend
npm install
cp .env.example .env
node db_setup.js      # 初始化数据（含 knowledge_sets 默认集合）
npm run dev           # 启动 Express API
npm run worker        # 启动 BullMQ Worker

# 前端
cd frontend
npm install
npm start

# Storybook
npm run storybook
```

测试：`cd backend && npm test`（Jest + pg-mem + supertest）。  
前端构建：`npm run build`；Storybook 构建：`npm run build-storybook`。

## 6. 权限与访问控制
- `ALLOW_USER_REGISTRATION=false`：注册默认关闭。
- 管理员通过 `POST /api/auth/admin/users` 创建账号；前端“账号管理”页提供分页、搜索、创建能力。
- `AuthContext` 管理 Token、过期提醒、权限判断；`ProtectedRoute` 实现路由守卫，菜单根据角色过滤。

## 7. 配置与环境
- `backend/config.js` 校验 DB / Redis / AI / JWT 等必填项并补全默认值。
- `ensureDirectories` 确保 `uploads/`、`logs/` 存在。
- `.env` 示例覆盖 Postgres、JWT、注册开关、AI、Redis、OCR 等配置。
- DeepSeek OCR：配置 `OCR_*` 环境变量，解析失败会自动回退调用。

## 8. 队列与内容生成
1. `queue.js` 初始化 BullMQ Queue / QueueScheduler / QueueEvents（处理重试、延迟、超时）。
2. Worker 流程：
   - 读取规则、关键词/长尾词、知识库文档或 `knowledge_set`、图片、Schema 元数据。
   - 构建 Prompt：按规则注入 Schema Block、榜单配置、图片占位、知识片段。
   - 根据 `knowledgeSetId`/`knowledgeBaseId` 聚合文档 snippet，超限会截断并记录 warning。
   - 调用模型生成 JSON/Markdown，失败时 fallback 至模板。
   - 写入 `generated_content`、`schema_payload`，记录进度、fallback 原因并返回预览。

## 9. 前端页面
- **KeywordPage**：左侧关键词列表 + 右侧长尾词表格，支持搜索、扩展、编辑、删除、批量导入导出、批量调整、Schema JSON 编辑以及复制链路。
- **KnowledgeBasePage**：集合与文档视图，可创建/编辑/删除 `knowledge_sets`，选择活跃集合、上传文档、重新分配集合、维护 Schema。
- **ContentGenerationPage**：规则配置、表单、实时进度、结果预览；支持选择关键词/长尾词/图片策略，自定义 Schema，选择单篇文档或整组集合，导出正文 + LD+JSON。
- **useGenerationJob Hook**：轮询 BullMQ 进度、处理取消、展示 fallback 信息。

## 10. 日志与错误处理
- Winston（`backend/logger.js`）结构化输出 + 滚动文件，非生产环境附加彩色日志。
- `AppError` + `middleware/errorHandler` 统一异常：业务 4xx/5xx 通过 `next(new AppError(...))` 透传。

## 11. 已完成能力
- **Fix Frontend Encoding:** 修复 `frontend/src/pages/ContentGenerationPage.js` 的中文编码问题，解决构建报错。
- 完成后端路由模块化 + BullMQ Worker。
- 配置校验、自检脚本、统一错误处理。
- 队列进度、AI fallback、内容入库链路。
- 前端权限控制、菜单过滤、统一反馈组件，Storybook 同步更新。
- 生成规则升级：品牌榜单、GEO/竞品策略、Schema & 图片占位。
- Worker Prompt 支持图片占位、榜单优先级、知识库摘要。
- DeepSeek OCR：上传 PDF/图片自动抽取文字写入 `document_chunks`。
- 管理员账号管理、关键词分页/编辑、内容页中文体验。
- 集成测试覆盖认证、关键词分页/编辑、权限校验。
- 知识库集合联动：`knowledge_sets` 表、索引、默认集合、文档归属 API、前端集合管理、内容页集合注入。

## 12. 待办路线图
1. **认证收口**：保持注册关闭，引入账号审批流程。
2. **配置与韧性**：完善 Docker/脚本启动 Redis & Postgres，自检工具。
3. **错误平台**：业务错误码、日志字段升级。
4. **队列可靠性**：监控告警、失败任务回收策略。
5. **数据与测试**：扩充 API 测试、事务化写入、接入 CI。
6. **前端体验**：封装筛选/分页状态，沉淀实时进度与取消交互。
7. **部署运维**：Docker 化、Bootstrap 脚本、日志滚动策略。
8. **渠道分发**：对接百家号、搜狐号等（OAuth、发布 API、回调状态），支持排期任务自动分发并回写结果。

## 13. Schema 智能补全
- 关键词页 Schema 弹窗新增“AI 生成建议”按钮，可输入品牌/SKU/商品链接后调用后端 LLM（`POST /api/keywords/:id/schema/ai`）生成建议 JSON，用户确认后再保存。
- 若已有 Schema，可随时编辑并再次触发 AI，生成的 JSON 会自动填入文本框，避免手动拼接结构。
- 长尾词 Schema 弹窗同样提供“AI 生成建议”，可输入品牌/SKU/商品链接或备注后生成更贴近搜索意图的 JSON。
