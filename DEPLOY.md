# muse-Mail - 部署指南

## 1. Docker 部署 (推荐)

最简单快捷的部署方式，无需复杂的环境配置。

### 前置要求
*   安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)。

### 部署步骤
1.  **上传代码**: 将整个项目目录上传到服务器。
2.  **配置环境**: 直接编辑根目录 `.env`，至少确认以下变量：
    - `SERVER_ORIGIN=https://你的域名`
    - `WEB_APP_ORIGIN=https://你的域名`
    - `GOOGLE_OAUTH_REDIRECT_URI=https://你的域名/api/oauth/google/callback`
    - `OPENAI_OAUTH_REDIRECT_URI=https://你的域名/api/oauth/openai/callback`
    - `ADMIN_GOOGLE_OAUTH_REDIRECT_URI=https://你的域名/api/auth/google/callback`
    - `ACCESS_PASSWORD=你的访问密码`（建议开启）
3.  **启动服务**:
    ```bash
    docker-compose up -d --build
    ```
4.  **访问**: 通过你反代后的正式域名访问，例如 `https://你的域名`。不建议继续直接暴露 `http://服务器IP:3000`。
5.  **上线前回归**:
    ```bash
    npm run verify:newspaper
    ```
    这条命令会验证报纸模块的健康检查、列表接口、阅读页接口、AI 总编台和文章 AI 导读链路。没有可用 AI 账号时，它会验证 `Fallback` 降级路径；有 AI 账号时，会验证真实 AI 输出或结构化降级结果。

### 数据持久化
所有数据（数据库文件）存储在项目目录下的 `server/data/` 文件夹中，`docker-compose.yml` 已经把它挂载到容器内的 `/app/server/data`，所以重启容器不会丢失数据。

### CRS 转发
Muse 内置了轻量 CRS 转发区块，不需要单独部署 New API / sub2api / claude-relay-service。进入「Codex」页面后，在「Codex CRS 转发」区块里配置：

- 上游 Base URL，例如 `https://api.openai.com/v1`
- 上游 API Key
- Muse 对外 CRS Key
- 是否启用转发
- 候选来源：`oauth`、`token_api`、`ai_api`、`manual`

本地也可以直接写入 Codex Desktop 配置：
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-codex-crs.ps1 `
  -RelayBaseUrl "http://127.0.0.1:3000/api/crs/v1" `
  -Model "gpt-5.5" `
  -EnabledSources "oauth"
```

客户端使用：
```bash
Base URL: https://你的域名/api/crs/v1
Authorization: Bearer cr_xxx
```

示例：
```bash
curl https://你的域名/api/crs/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"hello"}]}'
```

CRS 配置文件保存在：
```bash
server/data/crs-relay.json
```

这个能力只用于转发你有权使用的上游 key，不用于规避上游平台的限额、风控或账号规则。

### 反向代理建议
建议在 VPS 前面挂 Nginx / Caddy / 宝塔站点反代，把 `80/443` 转到容器的 `3000` 端口。这个项目默认就是前后端同服务部署，域名只需要指向这一台服务即可。

---

## 2. API 自动化集成

如果您需要在本地脚本中调用服务器上的接口（例如获取验证码），请参考以下步骤。

### 认证机制
*   如果未设置 `ACCESS_PASSWORD`，则无需认证。
*   如果设置了密码，Token 格式为: `Bearer <SHA256(password)>`。

### 接口说明
*   **Endpoint**: `POST /api/mails/fetch-new`
*   **Headers**: `Authorization: Bearer <SHA256_TOKEN>`
*   **Body**:
    ```json
    {
      "account_id": 1,
      "mailbox": "INBOX" // 或 "Junk"
    }
    ```
*   **Response**: 返回这类邮件对象，包含 `text_content` 和 `html_content`。

### Python 示例脚本
我们在 `scripts/fetch_code_example.py` 提供了一个示例脚本，用于演示如何远程获取验证码。

---

## 3. 手动部署 (传统方式)

如果不使用 Docker，请按以下步骤操作。

### 环境要求
*   Node.js >= 18
*   npm >= 9

### 步骤
1.  **安装依赖**:
    ```bash
    npm run install:all
    ```
2.  **构建前后端**:
    ```bash
    npm run build
    ```
3.  **启动服务**:
    ```bash
    # 在 server 目录下
    node dist/server.js
    ```
    或者使用 PM2 守护进程:
    ```bash
    npm install -g pm2
    pm2 start dist/server.js --name "muse-mail"
    ```

### 生产环境配置重点
- 不要保留 `localhost` 作为 OAuth 回调地址，统一换成正式域名。
- `SERVER_ORIGIN` 和 `WEB_APP_ORIGIN` 在生产环境下都应指向 VPS 上的正式访问域名。
- 如果你只用一个域名反代整站，前端接口会自动走相对路径 `/api`，不需要额外再写本地地址。
- 如果你用 `npm start` 或 PM2 启动，请先执行根目录的 `npm run build`，它现在会同时构建前端和后端；生产环境应运行 `server/dist/server.js`，不要依赖 `tsx` 直接跑源码。
- 建议每次部署后执行一次 `npm run verify:newspaper`，确认报纸模块没有被路由、账号池状态或 AI 上游变动影响。
