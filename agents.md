## Phase 2 核心功能迭代

- **认证链路（前/后端）**  
  保留 `POST /api/auth/register`（默认关闭）、`POST /api/auth/login`、`GET /api/auth/me`，统一使用 bcryptjs + jsonwebtoken。前端提供登录页，“账号管理”页支持分页 / 搜索 / 创建 / 角色分配。
- **关键词管理**  
  `GET /api/keywords` 支持 `page/pageSize/search`；AI 扩展写入 `keyword_variations`（默认生成 2 条长尾词，并附带月搜索权重）；提供 `PUT/DELETE`、批量导入导出（JSON/CSV）、长尾词批量调整、排序、筛选、本地缓存以及“一键复制到内容生成”链路。
- **知识库与图片素材**  
  文档/图片上传、删除、编辑，磁盘路径自动兼容；`DocumentUploader`、`ImageUploader` 组件复用；新增 `knowledge_sets` 集合管理（后端 CRUD + 默认集合 + 文档归属 API，前端集合分页/筛选/绑定上传，Worker 可聚合整组知识上下文）。
- **生成规则与内容生成**  
  规则 CRUD、BullMQ 入队、Worker 生成（含 AI fallback）；`ContentGenerationPage` 展示规则洞察、生成进度、结果预览，支持榜单配置、自动竞品补齐、图片占位符提示，并能选择单文档或整组集合注入。
- **内容排期 & GEO Analytics（Mock）**  
  提供排期 API/表单交互；GEO 看板基于 Ant Design Charts 展示统计与分布。
## Phase 3 Backend Validation
- `backend/validation.js` 引入 Joi schema，覆盖认证、关键词、图片、规则、内容生成、排期。
- `AppError` + `errorHandler` 提供统一响应结构。
## Phase 4 Frontend UI/UX
- Ant Design 组件化，页面拆分重组。
- 新增 `AuthContext`、`LoadingContext`、`useApi`、`useAsyncAction`、`useGenerationJob`。
- Storybook 维护反馈组件、空态、信息提示等。
## Phase 5 Backend Optimizations
- 路由拆分：auth / keywords / documents / images / image-collections / rules / content / geo。
- BullMQ Worker 分阶段进度 + fallback + 事务写入。
- `config.js` 校验配置值并集中默认值。
- 日志：Winston 结构化输出 + 滚动文件。
- 测试：Jest + pg-mem + supertest 覆盖认证与关键词流程。
## Phase 6 优化焦点 & Backlog

### 已完成
- **Fix Frontend Encoding:** Fixed garbled Chinese characters in `frontend/src/pages/ContentGenerationPage.js` that were causing build errors.
- 管理员账号管理页面（分页 / 搜索 / 创建）。
- 配置校验 + fallback（Redis/AI 缺失会记录警告并回退模板）。
- 统一错误处理（移除 `console.error`，全部走 AppError/logger）。
- `useGenerationJob` 进度轮询 + 取消 + fallback 提示。
- 前端页面统一 EmptyState/InfoBanner；Storybook 同步更新。
- 后端集成测试覆盖注册关闭、管理员权限、关键词创建/分页/编辑。
- GEO 看板、内容排期、内容生成等页面中文体验补全。
- **修复数据库初始化**：修正 `images` 表结构落后导致 `image_collections` 创建失败的问题。
- **优化关键词库性能**：为 `keywords`、`keyword_variations` 增加索引，显著提升分页/搜索性能。
- **规则与生成升级**：新增排行榜配置、自动竞品补齐、规则洞察、图片占位符约束，修复素材库随机抽图失效问题。
- **关键词库增强**：实现批量导入导出、长尾词批量编辑、列表缓存诊断，“复制到内容生成”链路同步。
- **知识库集合联动**：上线 `knowledge_sets` 表及 CRUD，文档上传列表/生成页支持集合筛选，Worker 可按集合聚合片段并同步 schema 元数据。

### 待办
1. **认证收口**：保持注册关闭，引入账号审批流程。
2. **配置与韧性**：补齐 Docker/脚本启动 Redis 与 Postgres，增加启动自检。
3. **错误平台**：落地业务错误码、拓展日志字段。
4. **队列可靠性**：监控告警、失败任务回收策略。
5. **数据与测试**：事务化写入、完善 API 覆盖、接入 CI。
6. **前端体验**：抽象筛选/分页状态组件，沉淀实时进度与取消交互。
7. **部署运维**：Docker 化、Bootstrap 脚本、日志轮转策略。
8. **渠道分发**：对接百家号、搜狐号等账号（OAuth、发布 API、回调状态），支持排期任务自动分发并回写结果。

### 后续优化建议
- 关键词库后端增加缓存策略，前端补充排序/筛选组合。
- 长尾词编辑支持批量调整、复制到内容生成，提供历史记录。
- 分页接口添加索引与查询分析，保障高数据量性能。
- 多模型接入策略：按关键词主题自适应选择模型与 Prompt。
- 队列监控：告警面板跟踪失败率、处理时延。
- QA/体验：补齐 e2e/无障碍/移动端适配。
- DeepSeek OCR：`.env` 配置 `OCR_*`，上传解析失败后自动调用。
- `ranking_settings.auto_generate`：规则可开启自动补齐竞品，生成页提示人工复核。
- **Schema 智能补全**：在关键词/知识库的“Schema 元数据”弹窗增加“一键生成”按钮，由前端触发后端 LLM 接口生成建议 JSON 供用户确认。

### Schema 智能补全（新增 TODO）
- 在关键词/知识库的“Schema 元数据”弹窗增加“AI 一键生成”按钮，前端调用后端 LLM 接口生成推荐 JSON，再由用户确认写入。

### Schema 智能补全
- 关键词 Schema 弹窗支持“AI 一键生成”，前端调用后端 LLM 接口生成 JSON 建议，用户确认后写入。
- 长尾词 Schema 弹窗也支持“AI 一键生成”，便于快速补全问答/意图字段。
