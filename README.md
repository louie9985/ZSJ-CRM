# AI-CRM V3.0

> 内部 CRM 系统。工程宪法与规范见 [`.claude/CLAUDE.md`](.claude/CLAUDE.md)，事实源文档在 [`docs/`](docs/)。
> 本 README 只做**本地开发命令速查**。当前进度：X 极简骨架 + Web 壳已搭建（见 [`docs/骨架搭建范围-V3.1.md`](docs/骨架搭建范围-V3.1.md)），业务模块与鉴权尚未实现。

## 最快跑起来（骨架阶段，两个终端）

```bash
# 首次：装 pnpm（已装可跳过）→ 新开终端 → 装依赖
npm install -g pnpm@9.15.0
pnpm install
pnpm --filter @zsj/shared-core build            # 供 server/web 引用

# 终端 A：后端（骨架阶段无需起 pg，直接跑）
pnpm --filter @zsj/server dev                   # → http://localhost:3000/api/v1/health

# 终端 B：Web
pnpm --filter @zsj/web dev                      # → http://localhost:5173
```

看到 `/api/v1/health` 返回 `{"code":0,"message":"ok",...}` 即启动成功。细节见下文。

## 技术栈

| 包 | 角色 | 栈 |
|---|---|---|
| `apps/server` | 后端 | NestJS 10 + Prisma 6，全局前缀 `api/v1` |
| `packages/shared-core` | 前后端共享 | 类型 / zod / API client / OpenAPI 生成类型（逻辑 single source） |
| `packages/web` | PC Web（内部员工） | Vite 6 + React 19 + HeroUI Pro（CollectUI）+ Tailwind CSS 4 + react-router 7 |

> `packages/mobile`（企微 H5）与 `packages/h5-partner`（外部小程序+H5）尚未建。

## 环境要求

- Node ≥ 22（容器 pin `node:22-slim`；本机 node 24 亦可）
- pnpm 9.15（安装见下方「安装 pnpm」）
- Docker（起 pg/redis/rabbitmq/nginx）

## 安装 pnpm（PowerShell / CMD / Git Bash 通用）

本机若 `pnpm` 命令不认（`无法将"pnpm"项识别为…` / `command not found`），用 npm 全局装一次，装到用户目录、无需管理员：

```bash
npm install -g pnpm@9.15.0
```

> **装完必须新开一个终端**，PATH 才会刷新（旧窗口仍找不到 pnpm）。新窗口跑 `pnpm -v` 应显示 `9.15.0`。
> 三种终端都能用；日常开发推荐 Git Bash 或 PowerShell 择一固定。

## 首次准备

```bash
pnpm install                                   # 安装全部 workspace 依赖
cp .env.example .env                           # 按需改（PowerShell 用 copy .env.example .env）
pnpm --filter @zsj/server exec prisma generate # 生成 Prisma Client
```

HeroUI Pro 是授权包。首次配置在本地临时设置 `HEROUI_KEY` 后执行 `pnpm dlx hpsetup@latest --auto`；CI 需在仓库 Secrets 中配置同名的 `HEROUI_KEY`，不要把密钥写进仓库文件。

## 本地开发

需两个终端：先起后端，再起 web（web 的 dev proxy 把 `/api/v1` 转发到 server `:3000`）。

### 终端 A —— 起后端（下面两种方式二选一）

**方式一：全套容器（一键，适合跑起来看/验证部署）**

```bash
docker compose up          # pg + redis + rabbitmq + nginx + app(server) 全用 Docker 起
```

改后端代码需重建镜像才生效，不适合边写边调。

**方式二：本机 watch 起 server（适合日常开发，改代码热重载）**

```bash
pnpm --filter @zsj/server dev   # NestJS watch，监听 :3000
```

这条**只起后端本身**，不含 pg/redis/rabbitmq。若后端逻辑需要连基础设施，另开一个终端只起基础设施容器（不起 app/nginx）：

```bash
docker compose up postgres redis rabbitmq   # 只起基础设施
```

> **骨架阶段可省基础设施**：当前 Prisma 只接入未建表、后端未连库，直接 `pnpm --filter @zsj/server dev` 即可起后端、访问 `/health` 与 Swagger，无需起 pg。等到 B1 建表那轮才必须先起基础设施。

### 终端 B —— 起 Web

```bash
pnpm --filter @zsj/web dev     # Vite，http://localhost:5173
```

**访问入口**

| 地址 | 说明 |
|---|---|
| http://localhost:5173 | Web 壳（dev） |
| http://localhost:5173/api/v1/health | 经 web dev proxy → server |
| http://localhost:8080/api/v1/health | 经 nginx（`docker compose up` 时） |
| http://localhost:3000/api/v1/docs | Swagger UI（本地起 server 时；容器内 3000 未映射到宿主） |
| http://localhost:3000/api/v1/docs-json | OpenAPI JSON |

## OpenAPI 出码管道

改了 server 的接口 DTO 后，刷新 shared-core 里的生成类型（两步，需 server 先 build）：

```bash
pnpm --filter @zsj/server build                # 出 dist/main.js
OPENAPI_EXPORT="$PWD/packages/shared-core/openapi.json" \
  pnpm --filter @zsj/server run openapi:export # 导出模式：写 openapi.json 后退出，不 listen
pnpm --filter @zsj/shared-core run openapi:gen # 生成 packages/shared-core/src/api/schema.ts
```

- `openapi.json` 是中间产物，**不入库**；生成的 `schema.ts` **入库**（可复现类型源）。
- web 通过 `@zsj/shared-core` 的 `components['schemas'][...]` 消费这些类型。

## 全量门禁（对齐 CI）

```bash
pnpm -w lint    # ESLint + boundary 边界检查（含 web 禁 import 后端）
pnpm -w tsc     # 全包类型检查
pnpm -w test    # node:test 单测
pnpm -w build   # 全包构建（含 web 产物）
```

CI 门禁全绿 + 1 名人工评审方可合入（见 CLAUDE.md 第 6 节）。

## 构建产物

```bash
pnpm --filter @zsj/server build   # → apps/server/dist
pnpm --filter @zsj/web build      # → packages/web/dist（静态资源）
```
