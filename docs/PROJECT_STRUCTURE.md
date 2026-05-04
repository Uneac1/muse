# Muse 目录结构

## 根目录

- `package.json` / `package-lock.json`: 顶层 npm 脚本与依赖锁定。
- `Dockerfile` / `docker-compose.yml` / `.dockerignore`: 容器部署配置。
- `DEPLOY.md`: 部署说明。
- `muse.bat` / `Muse.vbs`: Windows 本地启动入口。

## 应用代码

- `server/`: 后端服务、数据库、代理内核与服务端脚本。
- `web/`: 前端应用、组件、页面和静态资源。
- `integrations/`: 外部集成项目，目前包含 `openteams`。
- `scripts/`: 根项目级脚本、验证脚本和示例脚本。

## 文档与设计

- `docs/`: 项目文档、UI 规范、预览 HTML、截图和进展记录。
- `.stitch/`: Stitch 设计上下文和生成规格。
- `工作计划/`: 中文工作计划与模块规划。

## 运行产物

- `logs/`: 本地运行日志归档目录，已被 `.gitignore` 忽略。
- `tmp/`: 临时截图、外部仓库缓存和验证产物。
- `artifacts/`: 验证报告、生成产物和 UI smoke 结果。
- `node_modules/`, `server/dist/`, `web/dist/`: 依赖与构建输出，按忽略规则处理。
