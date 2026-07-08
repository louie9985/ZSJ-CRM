# AI-Agents 配置目录

> 本目录是 AI-CRM V3.0 多 Agent 协作机制的可落地配置。设计文档见 `../AI多Agent协作机制-V1.0.md`。

## 使用方式

1. 把本目录复制/重命名为仓库根目录的 `.claude/`（Claude Code / Agent SDK 约定路径）。
2. `CLAUDE.md` 会自动注入每个会话与子 Agent 的上下文（项目宪法 + 工程规范）。
3. `agents/*.md` 是各角色子 Agent 定义，由组长（主会话）按需调用。

## 目录结构

```
.claude/
  CLAUDE.md              项目宪法与工程规范（注入每个上下文）
  agents/
    orchestrator.md      组长/编排者     — fable5 / opus4.8
    product-manager.md   产品经理        — opus4.8 / fable5
    architect.md         架构师          — opus4.8
    implementer.md       实现者（可并行） — codex / sonnet-5
    reviewer.md          审查员          — opus4.8 / fable5
    bug-hunter.md        找 bug 员       — opus4.8 / sonnet-5
    test-writer.md       测试编写        — sonnet-5 / codex
```

## 模型字段说明

每个 agent 的 frontmatter `model` 字段用通用名（opus/sonnet 等）占位，实际部署时按可用模型与成本替换。角色是稳定的，模型可替换——见设计文档第 2.3 节角色↔模型映射。

**关键约束**：审查员不得与实现者用同一模型实例（避免自审盲区）；红类代码审查员建议用比实现者更强的模型。

## 协作流程速览

```
人 → 组长：下任务
组长 → 产品经理：AC        →（人评审口径）
组长 → 架构师：设计         →（人确认边界，跨模块改动先开工单）
组长 → 测试编写：红类测试先行
组长 → 实现者×N：并行写代码 + 自审
组长 → 审查员：宪法打勾 + 红类逐行
组长 → 找 bug 员：对抗测试
实现者：修复循环
组长 → 人：汇总 + 红类放行请求  →（人逐行评审后合入）
```
