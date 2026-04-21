# muse-Mail

`muse-Mail` 是一个面向邮箱运营与验证码收件场景的邮件工作台，聚焦多账户集中管理、代理切换、双协议拉信与本地缓存。项目以你给的新 README 目标为基线，当前已覆盖 Outlook / Microsoft 与 Gmail 两条 OAuth 邮箱接入链路，同时保留扩展到更多邮箱供应商的空间。

## 产品定位

- 邮箱账户集中管理：统一维护邮箱、密码、客户端 ID、刷新令牌与备注
- 收件工作台：查看收件箱 / 垃圾箱邮件，快速定位验证码与最近消息
- 代理调度：支持 SOCKS5 / HTTP 代理，便于不同网络出口下收信与测试
- 本地优先：SQLite 存储账户、标签、代理与邮件缓存，便于备份与迁移
- 运维友好：支持访问密码、批量导入导出、数据库备份恢复
- OAuth 接入：支持 Microsoft 刷新令牌模式，以及 Gmail 的 Google OAuth 2.0 授权回填

## 当前技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Koa 3 + TypeScript + SQLite (better-sqlite3) |
| 前端 | React 19 + Tailwind CSS 3 + Zustand 5 + Framer Motion 11 |
| UI 组件 | Radix UI 原语 + 自定义 Glassmorphism 组件 |
| 邮件协议 | Microsoft Graph API / IMAP (XOAUTH2) / Gmail IMAP XOAUTH2 |
| 代理 | SOCKS5 (socks-proxy-agent) / HTTP (undici ProxyAgent) |

## 已实现能力

- 仪表盘：账户总数、最近邮件、代理状态、异常与即将过期项
- 邮箱管理：新增、编辑、删除、批量导入、批量导出、分页与搜索
- 标签系统：为账户分组，便于切换不同任务池
- 邮件查看：三栏式查看账户、邮件列表与正文
- 代理设置：新增代理、编辑代理、测试连通性、设置默认代理
- 收信链路：Microsoft 账户走 Graph API 优先并可降级到 IMAP；Gmail 账户走 Google OAuth 2.0 + IMAP XOAUTH2
- 安全保护：可选访问密码，避免公开部署时被未授权访问
- 备份恢复：支持 SQLite 数据库打包备份与恢复

## 目录结构

```text
muse-Mail/
├── server/                  # Koa + TypeScript 服务端
│   └── src/
│       ├── config/          # 环境配置
│       ├── controllers/     # 控制器
│       ├── database/        # SQLite 初始化与迁移
│       ├── middlewares/     # 日志、认证、异常
│       ├── models/          # 数据访问层
│       ├── routes/          # API 路由
│       ├── services/        # Graph / IMAP / OAuth / 代理服务
│       ├── types/           # 后端类型
│       └── utils/           # 工具函数
├── web/                     # React 前端
│   └── src/
│       ├── components/      # 页面组件
│       ├── lib/             # API 客户端与工具
│       ├── pages/           # 页面入口
│       ├── stores/          # Zustand 状态管理
│       └── types/           # 前端类型
├── .env.example             # 环境变量模板
├── DEPLOY.md                # 部署说明
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm run install:all
```

### 环境变量

复制 `.env.example` 为 `.env`，常用项如下：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 后端端口 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DB_PATH` | `./data/muse-mail.db` | SQLite 数据库路径，相对于 `server/` |
| `ACCESS_PASSWORD` | 空 | 访问密码，留空则不启用 |
| `DEFAULT_GITHUB_TOKEN` | 空 | 默认 GitHub Token，仅建议放本地 `.env` |
| `DEFAULT_CLOUDFLARE_TOKEN` | 空 | 默认 Cloudflare Token，仅建议放本地 `.env` |
| `DEFAULT_NOTION_TOKEN` | 空 | 默认 Notion integration token，仅建议放本地 `.env` |
| `SERVER_ORIGIN` | 空 | 服务对外访问地址，生产环境建议写成 `https://你的域名` |
| `WEB_APP_ORIGIN` | 空 | 前端对外访问地址；前后端同域部署时通常与 `SERVER_ORIGIN` 相同 |
| `GOOGLE_OAUTH_REDIRECT_URI` | `SERVER_ORIGIN/api/oauth/google/callback` | Google OAuth 回调地址 |

为了兼容旧数据，如果没有显式设置 `DB_PATH` 且本地已有 `server/data/outlook.db`，服务会自动继续使用旧数据库。

### 开发模式

```bash
npm run dev
```

- 前端默认运行在 `http://localhost:5173`
- 后端默认运行在 `http://localhost:3000`

### Gmail OAuth 配置

1. 在 Google Cloud Console 创建 OAuth 2.0 Client。
2. 把回调地址加入允许列表，默认使用：
   `SERVER_ORIGIN/api/oauth/google/callback`
3. 在“新增邮箱”弹窗中选择 `Google / Gmail`。
4. 填入 `Client ID` 和 `Client Secret`，点击“连接 Gmail”。
5. 完成 Google 授权后，应用会自动回填邮箱地址与刷新令牌。

### Notion Integration 配置

1. 登录 Notion 并打开 Integrations 管理页面。
2. 创建一个 integration，并复制生成的 token。
3. 把需要读取的页面或数据库共享给这个 integration。
4. 在 `Notion` 页面里粘贴 token，或写入本地 `.env` 的 `DEFAULT_NOTION_TOKEN`。
5. 保存后即可同步 Bot、页面和数据库列表。

### 生产构建

```bash
npm run build
npm start
```

生产环境建议先执行根目录的 `npm run build`，它会同时构建前端和后端，然后再启动已经编译好的 `server/dist/server.js`。

生产部署到 VPS 时，务必把 `.env` 里的 `SERVER_ORIGIN`、`WEB_APP_ORIGIN` 和各类 OAuth 回调地址改成正式域名；前端构建后会通过同域 `/api` 访问后端，不需要再保留本地开发地址。

## 账户导入格式

支持文本批量导入，每行一个账户，默认格式：

```text
provider----邮箱----密码----客户端ID----客户端Secret----刷新令牌
```

- `provider` 可选：支持 `microsoft`、`gmail`

分隔符和字段顺序都可以在导入弹窗中自定义。

## 参考项目

这版 `muse-Mail` 的需求整理参考了这些方向：

- [Email-Manager](https://github.com/jkcDD/Email-Manager)
- [Outlook-Mail-Manager](https://github.com/aa1125573296-svg/Outlook-Mail-Manager)
- [cloudflaremail](https://github.com/dingdingpw/cloudflaremail)
- [Microsoft-Mail-Manager](https://github.com/vag-Zhao/Microsoft-Mail-Manager)
- [gmail_manage](https://github.com/LiLinyyds/gmail_manage)

## 后续扩展建议

- 将当前 Web 应用嵌入 Tauri，补齐桌面端打包与本地能力
- 抽象邮件提供商接口，逐步支持 Gmail / iCloud / 临时邮箱
- 增加验证码规则提取、自动轮询与 webhook / bot 通知

## License

MIT
