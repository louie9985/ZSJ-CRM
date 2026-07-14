import type {ChatThread} from "./chat";

export const SHOWCASE_MARKDOWN = `下面是支持 **Markdown** 的简洁回答：

\`\`\`ts
export type ChatStatus = "ready" | "streaming" | "submitted";
\`\`\`

- Pro 组件只负责界面呈现
- 应用负责消息数组与 SDK 接入
- 显式组合 \`ChatMessage\`、\`Markdown\` 和 \`ChainOfThought\``;

export const SHOWCASE_THREAD: ChatThread = {
  id: "pro-ai-showcase",
  messages: [
    {
      id: "showcase-1",
      role: "user",
      text: "介绍一下 HeroUI Pro 的 AI 对话组件。",
    },
    {
      id: "showcase-2",
      loaderLabel: "思考中...",
      role: "assistant",
      status: "streaming",
      text: "思考中...",
    },
    {
      id: "showcase-3",
      role: "user",
      text: "展示推理过程、Markdown 和代码高亮。",
    },
    {
      actions: "full",
      avatar: {
        alt: "智能助手",
        fallback: "AI",
      },
      id: "showcase-4",
      markdown: SHOWCASE_MARKDOWN,
      reasoning: {
        defaultExpanded: false,
        steps: [
          {
            content:
              "已检查 Pro 示例中的 Markdown 区块缓存和基于 Shiki 的代码块渲染。",
            label: "检索",
          },
          {
            content:
              "将推理界面映射到 ChainOfThought，并使用 TextShimmer 与 ChatLoader 表示加载状态。",
            label: "计划",
          },
        ],
        trigger: "思考了 4 秒",
      },
      role: "assistant",
      showAvatar: true,
    },
    {
      id: "showcase-5",
      role: "user",
      text: "展示流式、分组和需要批准的工具调用。",
    },
    {
      id: "showcase-5b",
      role: "assistant",
      toolGroup: {
        label: "2 次工具调用",
        tools: [
          {
            argsText: '{"query":"HeroUI Pro chat components"}',
            output: {hits: 12, top: "ChatTool"},
            state: "output-available",
            toolName: "searchDocs",
          },
          {
            argsText: '{"path":"/components/chat-tool"}',
            output: {title: "ChatTool", words: 420},
            state: "output-available",
            toolName: "fetchPage",
          },
        ],
      },
    },
    {
      id: "showcase-5c",
      role: "user",
      text: "如果工具需要批准呢？",
    },
    {
      id: "showcase-5d",
      role: "assistant",
      tools: [
        {
          argsText: '{"to":"team@acme.com","subject":"Launch update"}',
          state: "requires-action",
          toolName: "sendEmail",
        },
      ],
    },
    {
      id: "showcase-6",
      role: "user",
      text: "等待回答时，骨架屏是什么样？",
    },
    {
      id: "showcase-6b",
      loaderLabel: "正在加载回答",
      role: "assistant",
      status: "skeleton",
    },
    {
      id: "showcase-7",
      role: "user",
      text: "也展示一下媒体内容和紧凑操作。",
    },
    {
      actions: "minimal",
      id: "showcase-8",
      image: {
        alt: "Component architecture diagram placeholder",
        src: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/images/egg.webp",
      },
      role: "assistant",
      showAvatar: true,
      text: "助手消息可以包含媒体内容，并在正文下方显示精简操作。",
    },
    {
      id: "showcase-9",
      role: "user",
      text: "展示来源和文件附件。",
    },
    {
      attachments: [
        {
          mimeType: "image/png",
          name: "dashboard-wireframe.png",
          src: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/images/egg.webp",
        },
      ],
      id: "showcase-9b",
      role: "user",
      text: "你能从这个线框图中看出什么？",
    },
    {
      id: "showcase-9c",
      role: "assistant",
      sourceGroup: {
        label: "3 个来源",
        sources: [
          {
            description: "HeroUI Pro ships presentation-only AI chat compounds for React.",
            sourceType: "url",
            title: "HeroUI Pro",
            url: "https://heroui.com",
          },
          {
            description: "Slot-based styling utilities used across Pro components.",
            sourceType: "url",
            title: "Tailwind Variants",
            url: "https://tailwind-variants.org",
          },
          {
            sourceType: "document",
            title: "design-system-audit.pdf",
          },
        ],
      },
      text: "这个线框图采用常见的数据看板框架，包含固定侧栏、顶部栏，以及用于卡片和图表的可滚动内容区域。",
    },
  ],
  modelId: "gpt-5.4",
  preview:
    "展示 Markdown、推理链、工具调用、来源、附件、加载状态和消息操作。",
  searchModeId: "deep-search",
  title: "Pro AI 组件展示",
  updatedAt: "刚刚",
  user: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue-light.jpg",
    email: "darnell@email.com",
    name: "Darnell Howe",
  },
};
