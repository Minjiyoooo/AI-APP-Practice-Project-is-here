# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 析文应用架构

- 主界面：`src/app/page.tsx`，包含上传、分析中、结果页三步流程；视觉规范见 `DESIGN.md`。
- 共享类型与前端校验：`src/lib/document-types.ts`、`src/lib/file-validation.ts`；前后端共用 20MB 与扩展名校验规则。
- 文档解析：`src/server/document-parser.ts`。DOCX 使用 mammoth + Cheerio 保留标题、段落和表格；PDF 使用 pdf-parse；DOC 使用 word-extractor。
- AI 分析：`src/server/ai-analysis.ts`，摘要关键词、图表判断、内容解析分别使用独立 prompt，均通过 SDK 流式调用并校验 JSON；图表数值必须能回溯原文。
- 文档切块与检索：`src/server/document-chunker.ts`、`src/server/rag.ts`。按段落聚合为 500–800 字并保留重叠，向量使用 coze-coding-dev-sdk，检索返回 Top 4。
- 会话存储：`src/server/document-store.ts`，使用服务端内存 Map，闲置 2 小时过期；多实例部署时需替换为共享会话存储。
- Word 报告：`src/server/report-generator.ts`，使用 docx 生成，前端 ECharts PNG 通过 ImageRun 嵌入。
- 流式协议：`src/server/sse.ts`、`src/lib/client-api.ts`。分析和问答均为 SSE，前端使用 Reader 增量消费，不得改为一次性伪造流式输出。

## API 路由

- `POST /api/documents/upload`：multipart 字段 `file`，完成双重校验和结构解析。
- `POST /api/documents/[id]/analyze`：建立向量索引并依次完成三个 AI 阶段，SSE 返回 `progress`、`result`、`error`。
- `POST /api/documents/[id]/qa`：JSON 字段 `question`，SSE 返回 `delta`、`done`（含引用）、`error`。
- `POST /api/documents/[id]/report`：JSON 字段 `chartImage`（PNG Data URL，可空），返回 DOCX 二进制。

## 检查与排障

- 静态检查：`pnpm lint`、`pnpm ts-check`；生产构建：`pnpm build`。
- 修改接口后必须使用 `test_run` 对每个路由发送真实请求，禁止用 shell 绕过。
- SDK 的 LLM 与 Embedding 客户端均使用 `new Config()` 和 `HeaderUtils.extractForwardHeaders(request.headers)`；Embedding 按小批次并发调用 `embedText`，不要依据旧示例改用类型不符的 `embedTexts`。
- 预期用户输入错误不应被当作服务故障；外部模型或向量额度错误需保留真实错误，不得用本地假数据替代。
