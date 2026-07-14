export const chatStrings = {
  actions: {
    copy: "复制",
    menu: "更多操作",
    menuTooltip: "更多",
    regenerate: "重新生成",
    thumbsDown: "回答不佳",
    thumbsUp: "回答有帮助",
  },
  assistant: {
    avatarAlt: "智能助手",
    avatarFallback: "AI",
  },
  composer: {
    attach: "添加附件",
    model: "模型",
    removeAttachment: "移除附件",
    send: "发送消息",
    stop: "停止生成",
  },
  conversation: {
    scrollToBottom: "滚动到底部",
  },
  disclaimer: "AI 可能会出错，请核实重要信息。",
  loading: {
    pending: "正在加载回答",
    thinking: "思考中...",
  },
  source: {
    sources: (count: number) => `${count} 个来源`,
  },
  tool: {
    approvalNeeded: "需要批准：",
    approve: "批准",
    args: "参数",
    failed: "工具执行失败：",
    reject: "拒绝",
    result: "结果",
    running: "正在运行工具：",
    toolCalls: (count: number) => `${count} 次工具调用`,
    used: "已使用工具：",
  },
} as const;

export type ChatStrings = typeof chatStrings;
