import type {ComponentType} from "react";

import {
  Archive,
  FileText,
  House,
  PaperPlane,
  SquareExclamation,
  Star,
  Stopwatch,
  TrashBin,
  Tray,
} from "@gravity-ui/icons";

/* --------------------------------------------------------------------------
 * Types
 * ----------------------------------------------------------------------- */

export type EmailFolderId =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "snoozed"
  | "archive"
  | "spam"
  | "trash";

export type EmailLabelTone = "accent" | "default" | "success" | "warning" | "danger";

export type EmailFolder = {
  id: EmailFolderId;
  label: string;
  icon: ComponentType<{className?: string}>;
};

export type EmailLabel = {
  id: string;
  label: string;
  tone: EmailLabelTone;
};

export type EmailAddress = {
  name: string;
  email: string;
  avatar?: string;
};

export type EmailAttachment = {
  id: string;
  name: string;
  size: string;
  kind: "pdf" | "image" | "spreadsheet" | "doc" | "other";
};

export type EmailMessage = {
  id: string;
  from: EmailAddress;
  to: readonly EmailAddress[];
  cc?: readonly EmailAddress[];
  /** Display-friendly timestamp (mock data, so no Date). */
  receivedAt: string;
  body: readonly string[];
  attachments?: readonly EmailAttachment[];
};

export type EmailThread = {
  id: string;
  folderId: EmailFolderId;
  subject: string;
  preview: string;
  updatedAt: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant?: boolean;
  labelIds: readonly string[];
  participants: readonly EmailAddress[];
  messages: readonly EmailMessage[];
};

/* --------------------------------------------------------------------------
 * Folders
 * ----------------------------------------------------------------------- */

export const FOLDERS: readonly EmailFolder[] = [
  {icon: Tray, id: "inbox", label: "收件箱"},
  {icon: Star, id: "starred", label: "星标邮件"},
  {icon: PaperPlane, id: "sent", label: "已发送"},
  {icon: FileText, id: "drafts", label: "草稿箱"},
  {icon: Stopwatch, id: "snoozed", label: "稍后处理"},
  {icon: Archive, id: "archive", label: "归档"},
  {icon: SquareExclamation, id: "spam", label: "垃圾邮件"},
  {icon: TrashBin, id: "trash", label: "回收站"},
] as const;

export const DEFAULT_FOLDER_ID: EmailFolderId = "inbox";

export const HOME_ICON: ComponentType<{className?: string}> = House;

/* --------------------------------------------------------------------------
 * Labels
 * ----------------------------------------------------------------------- */

export const LABELS: readonly EmailLabel[] = [
  {id: "work", label: "工作", tone: "accent"},
  {id: "personal", label: "个人", tone: "default"},
  {id: "billing", label: "账单", tone: "warning"},
  {id: "travel", label: "出行", tone: "success"},
  {id: "urgent", label: "紧急", tone: "danger"},
] as const;

export function getLabel(id: string): EmailLabel | undefined {
  return LABELS.find((label) => label.id === id);
}

/* --------------------------------------------------------------------------
 * Addresses (reusable participants)
 * ----------------------------------------------------------------------- */

const CURRENT_USER: EmailAddress = {
  avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue-light.jpg",
  email: "you@heroui.dev",
  name: "我",
};

const CONTACTS = {
  amelia: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/emerald.jpg",
    email: "amelia@linear.app",
    name: "Linear 助手 Amelia",
  },
  carlos: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/green-dark.jpg",
    email: "carlos@heroui.dev",
    name: "Carlos Iglesias",
  },
  emma: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/red.jpg",
    email: "emma@conf-summit.com",
    name: "Emma Park",
  },
  github: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/black.jpg",
    email: "notifications@github.com",
    name: "GitHub",
  },
  maya: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/sky.jpg",
    email: "maya@heroui.dev",
    name: "Maya Okafor",
  },
  parker: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/indigo.jpg",
    email: "parker@heroui.dev",
    name: "Parker Wren",
  },
  ravi: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/purple.jpg",
    email: "ravi@heroui.dev",
    name: "Ravi Anand",
  },
  stripe: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/blue-dark.jpg",
    email: "receipts@stripe.com",
    name: "Stripe",
  },
  travel: {
    avatar: "https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/avatars/orange.jpg",
    email: "itinerary@flights.heroui.dev",
    name: "航班服务",
  },
} as const satisfies Record<string, EmailAddress>;

/* --------------------------------------------------------------------------
 * Threads
 * ----------------------------------------------------------------------- */

export const THREADS: readonly EmailThread[] = [
  {
    folderId: "inbox",
    id: "launch-recap-next-steps",
    isImportant: true,
    isRead: false,
    isStarred: true,
    labelIds: ["work", "urgent"],
    messages: [
      {
        body: [
          "把今天上午发布评审的结论简单整理如下，方便留档。",
          "我们已确定最终发布日期为 24 日周二，必须上线的三项内容是：新手引导、账单更新流程和新版数据分析看板。",
          "Parker 和我会共同负责上线检查清单。明天 10:30 可以和我、Maya 一起同步吗？",
        ],
        from: CONTACTS.carlos,
        id: "msg-1",
        receivedAt: "上午 10:21",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.carlos],
    preview:
      "我们已确认最终发布日期，以及 24 日周二前必须上线的三项内容。",
    subject: "发布复盘与下一步安排",
    updatedAt: "上午 10:21",
  },
  {
    folderId: "inbox",
    id: "invoice-inv-0241-due-tomorrow",
    isRead: false,
    isStarred: true,
    labelIds: ["billing"],
    messages: [
      {
        attachments: [{id: "att-inv", kind: "pdf", name: "INV-0241.pdf", size: "184 KB"}],
        body: [
          "提醒：金额为 $2,450.00 的发票 INV-0241 将于明天到期。",
          "你可以下载上方 PDF，或直接从控制台付款。如需调整付款条款，请回复此邮件。",
        ],
        from: CONTACTS.stripe,
        id: "msg-1",
        receivedAt: "昨天",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.stripe],
    preview:
      "发票 INV-0241 金额为 $2,450.00，将于明天到期，可下载 PDF 或从控制台付款。",
    subject: "发票 INV-0241 明天到期",
    updatedAt: "昨天",
  },
  {
    folderId: "inbox",
    id: "flight-itinerary-sfo-nrt",
    isRead: true,
    isStarred: false,
    labelIds: ["travel"],
    messages: [
      {
        body: [
          "你已预订 4 月 29 日从旧金山（SFO）飞往东京（NRT）的 FL-482 航班。",
          "起飞：上午 11:20 · 到达：次日下午 4:05 · 座位：14A。",
          "请在起飞前 24 小时在线值机，并随身携带纸质确认单。",
        ],
        from: CONTACTS.travel,
        id: "msg-1",
        receivedAt: "4 月 22 日 周二",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.travel],
    preview:
      "你已预订 4 月 29 日从 SFO 前往 NRT 的 FL-482 航班，座位 14A。",
    subject: "航班行程：SFO → NRT",
    updatedAt: "4 月 22 日",
  },
  {
    folderId: "inbox",
    id: "review-requested-heroui-pro-template-chat",
    isRead: false,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "@you requested your review on heroui/heroui.pro#242 — fix(template-chat): inverted scroll and bounded chat height.",
          "Changes touch 2 files in templates/chat/src/views. Tests pass on CI.",
          "Open on GitHub to review.",
        ],
        from: CONTACTS.github,
        id: "msg-1",
        receivedAt: "9:02 AM",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.github],
    preview:
      "PR #242 请求代码评审：修复对话模板的滚动方向与高度限制。",
    subject: "[heroui/heroui.pro] PR #242 请求评审",
    updatedAt: "上午 9:02",
  },
  {
    folderId: "inbox",
    id: "design-review-dashboard-v3",
    isImportant: true,
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Pinging ahead of Friday's design review — here's what we'll cover:",
          "1) Final dashboard home layout with the new KPI ordering.",
          "2) Updated chart colors to match the brand refresh.",
          "3) Responsive behavior for the employees table header.",
          "If you have comments, leave them on the Figma before Thursday EOD so we can address them live.",
        ],
        from: CONTACTS.maya,
        id: "msg-1",
        receivedAt: "Mon, 3:40 PM",
        to: [CURRENT_USER, CONTACTS.parker],
      },
      {
        body: [
          "Thanks Maya — I'll drop comments tomorrow morning.",
          "One early thought: can we keep the KPI row at two rows on mobile rather than stacking everything vertically? I think it scans better.",
        ],
        from: CURRENT_USER,
        id: "msg-2",
        receivedAt: "Mon, 4:18 PM",
        to: [CONTACTS.maya, CONTACTS.parker],
      },
    ],
    participants: [CONTACTS.maya, CURRENT_USER, CONTACTS.parker],
    preview:
      "周五设计评审前提醒：最终看板布局、图表颜色和响应式表格标题。",
    subject: "设计评审：数据看板 v3",
    updatedAt: "周一",
  },
  {
    folderId: "inbox",
    id: "weekly-summary-linear",
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Here's your weekly snapshot.",
          "· 8 issues closed this week (up 2 from last week).",
          "· 3 blocked issues need triage — all are on the templates project.",
          "· Your cycle is on track to finish Friday with 1 carry-over.",
          "Open Linear for the full report.",
        ],
        from: CONTACTS.amelia,
        id: "msg-1",
        receivedAt: "Mon, 9:00 AM",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.amelia],
    preview:
      "本周已关闭 8 个问题，3 个阻塞问题待处理，当前迭代预计周五完成。",
    subject: "你的每周摘要",
    updatedAt: "周一",
  },
  {
    folderId: "inbox",
    id: "dinner-plans-saturday",
    isRead: true,
    isStarred: false,
    labelIds: ["personal"],
    messages: [
      {
        body: [
          "Hey! Are we still on for dinner on Saturday?",
          "I was thinking the new ramen place on Mission. Around 7?",
        ],
        from: CONTACTS.ravi,
        id: "msg-1",
        receivedAt: "Sun, 7:12 PM",
        to: [CURRENT_USER],
      },
      {
        body: ["Yes! 7 works. I'll grab the reservation."],
        from: CURRENT_USER,
        id: "msg-2",
        receivedAt: "Sun, 7:18 PM",
        to: [CONTACTS.ravi],
      },
    ],
    participants: [CONTACTS.ravi, CURRENT_USER],
    preview:
      "周六晚餐计划不变吧？想去 Mission 那家新拉面店，晚上 7 点左右。",
    subject: "周六晚餐安排？",
    updatedAt: "周日",
  },
  {
    folderId: "inbox",
    id: "one-on-one-q2-growth-plan",
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Notes from our 1:1 so we remember what we agreed on.",
          "Growth plan: define the H1 north-star metric by end of the month, pick two experiments to run next cycle, and schedule a working session with product.",
          "I added the action items to our shared Notion doc.",
        ],
        from: CONTACTS.parker,
        id: "msg-1",
        receivedAt: "Fri, 2:05 PM",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.parker],
    preview:
      "成长计划：月底前明确上半年北极星指标、选择两项实验并安排工作会议。",
    subject: "1:1 记录：Q2 成长计划",
    updatedAt: "周五",
  },
  {
    folderId: "inbox",
    id: "stripe-deposit-2450",
    isRead: true,
    isStarred: false,
    labelIds: ["billing"],
    messages: [
      {
        body: [
          "A transfer of $2,450.00 landed in your bank account today.",
          "Fees for this period totaled $71.05. You can view the full payout breakdown in your Stripe dashboard.",
        ],
        from: CONTACTS.stripe,
        id: "msg-1",
        receivedAt: "Apr 18",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.stripe],
    preview:
      "$2,450.00 已转入你的银行账户，本期手续费共计 $71.05。",
    subject: "Stripe：$2,450 已到账",
    updatedAt: "4 月 18 日",
  },
  {
    folderId: "inbox",
    id: "conference-cfp-deadline",
    isRead: false,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Friendly reminder that the CFP for React Summit closes this Friday at midnight.",
          "Your draft on 'Design systems for product teams' is already saved in the portal — you just need to submit it.",
        ],
        from: CONTACTS.emma,
        id: "msg-1",
        receivedAt: "Apr 15",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.emma],
    preview: "提醒：React Summit 议题征集将于本周五午夜截止。",
    subject: "会议议题征集截止提醒",
    updatedAt: "4 月 15 日",
  },
  {
    folderId: "sent",
    id: "re-launch-recap-next-steps",
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Thanks for the recap, Carlos. 10:30 tomorrow works. I'll prep a draft of the go/no-go checklist beforehand so we can just review and edit live.",
        ],
        from: CURRENT_USER,
        id: "msg-1",
        receivedAt: "10:48 AM",
        to: [CONTACTS.carlos],
      },
    ],
    participants: [CURRENT_USER],
    preview:
      "Thanks for the recap — 10:30 tomorrow works. I'll prep a draft of the go/no-go checklist beforehand.",
    subject: "Re: Launch recap + next steps",
    updatedAt: "10:48 AM",
  },
  {
    folderId: "sent",
    id: "proposal-q3-infra-upgrade",
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Attached is the proposal for the Q3 infrastructure upgrade we discussed.",
          "Headlines: migrate build cache to R2, add Redis as a shared session store, and consolidate our observability stack.",
          "Numbers in the appendix. Happy to walk through it async.",
        ],
        from: CURRENT_USER,
        id: "msg-1",
        receivedAt: "Apr 16",
        to: [CONTACTS.parker, CONTACTS.carlos],
      },
    ],
    participants: [CURRENT_USER],
    preview:
      "Proposal for the Q3 infrastructure upgrade: R2 build cache, Redis sessions, and observability consolidation.",
    subject: "Proposal: Q3 infrastructure upgrade",
    updatedAt: "Apr 16",
  },
  {
    folderId: "drafts",
    id: "draft-roadmap-review-followup",
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: [
          "Following up on the roadmap review — a few things I wanted to put on your radar:",
          "",
          "(draft in progress)",
        ],
        from: CURRENT_USER,
        id: "msg-1",
        receivedAt: "Draft",
        to: [CONTACTS.maya],
      },
    ],
    participants: [CURRENT_USER],
    preview: "Following up on the roadmap review — a few things I wanted to put on your radar.",
    subject: "Roadmap review follow-up",
    updatedAt: "Draft",
  },
  {
    folderId: "drafts",
    id: "draft-hiring-plan-q3-summary",
    isRead: true,
    isStarred: false,
    labelIds: ["work"],
    messages: [
      {
        body: ["Summary of the hiring plan for Q3.", "", "(draft in progress)"],
        from: CURRENT_USER,
        id: "msg-1",
        receivedAt: "Draft",
        to: [CONTACTS.parker],
      },
    ],
    participants: [CURRENT_USER],
    preview: "Summary of the hiring plan for Q3. Roles, priorities, and timeline.",
    subject: "Hiring plan Q3 summary",
    updatedAt: "Draft",
  },
  {
    folderId: "archive",
    id: "expense-report-approved",
    isRead: true,
    isStarred: false,
    labelIds: ["billing"],
    messages: [
      {
        body: [
          "Your expense report for March has been approved and will be reimbursed on your next paycheck.",
          "If anything looks off, reply to this email before Friday.",
        ],
        from: CONTACTS.parker,
        id: "msg-1",
        receivedAt: "Apr 2",
        to: [CURRENT_USER],
      },
    ],
    participants: [CONTACTS.parker],
    preview:
      "Your expense report for March has been approved and will be reimbursed on your next paycheck.",
    subject: "Expense report approved",
    updatedAt: "Apr 2",
  },
] as const;

/* --------------------------------------------------------------------------
 * Helpers (hoisted / pure)
 * ----------------------------------------------------------------------- */

export function getFolder(id: string): EmailFolder | undefined {
  return FOLDERS.find((folder) => folder.id === id);
}

export function getThread(id: string): EmailThread | undefined {
  return THREADS.find((thread) => thread.id === id);
}

export function getThreadsForFolder(folderId: string): readonly EmailThread[] {
  if (folderId === "starred") return THREADS.filter((thread) => thread.isStarred);

  return THREADS.filter((thread) => thread.folderId === folderId);
}

/**
 * Number of unread threads per folder. Keyed by folder id.
 * Computed at module load — callers can just read the value.
 */
export const FOLDER_UNREAD_COUNTS: Readonly<Record<EmailFolderId, number>> = (() => {
  const counts = Object.fromEntries(FOLDERS.map((folder) => [folder.id, 0])) as Record<
    EmailFolderId,
    number
  >;

  for (const thread of THREADS) {
    if (thread.isRead) continue;
    counts[thread.folderId] += 1;
    if (thread.isStarred) counts.starred += 1;
  }

  return counts;
})();

/* --------------------------------------------------------------------------
 * Active-page resolution (mirrors the chat template helper)
 * ----------------------------------------------------------------------- */

export type EmailActivePage =
  | {kind: "folder"; folder: EmailFolder; threadId?: string}
  | {kind: "unknown"};

export function resolveEmailActivePage(pathname: string, basePath: string): EmailActivePage {
  const trimmedBase = basePath.replace(/\/$/, "");
  const raw = pathname.startsWith(trimmedBase) ? pathname.slice(trimmedBase.length) : pathname;
  const segments = raw.replace(/^\//, "").split("/").filter(Boolean);

  const [folderSegment, emailSegment] = segments;
  const folderId = folderSegment || DEFAULT_FOLDER_ID;
  const folder = getFolder(folderId);

  if (!folder) return {kind: "unknown"};

  return {folder, kind: "folder", threadId: emailSegment || undefined};
}
