# muse-Mail - 部署指南

## 1. Docker 部署 (推荐)

最简单快捷的部署方式，无需复杂的环境配置。

### 前置要求
*   安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)。

### 部署步骤
1.  **上传代码**: 将整个项目目录上传到服务器。
2.  **配置环境**: 编辑 `docker-compose.yml`，如果需要密码保护，请修改 `ACCESS_PASSWORD`。
3.  **启动服务**:
    ```bash
    docker-compose up -d --build
    ```
4.  **访问**: 打开浏览器访问 `http://服务器IP:3000`。

### 数据持久化
所有数据（数据库文件）存储在项目目录下的 `data/` 文件夹中，重启容器不会丢失数据。

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
我们在根目录下提供了一个 `fetch_code_example.py` 示例脚本，用于演示如何远程获取验证码。

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
2.  **构建前端**:
    ```bash
    npm run build
    ```
3.  **编译后端**:
    ```bash
    cd server
    npm run build
    ```
4.  **启动服务**:
    ```bash
    # 在 server 目录下
    node dist/server.js
    ```
    或者使用 PM2 守护进程:
    ```bash
    npm install -g pm2
    pm2 start dist/server.js --name "muse-mail"
    ```
