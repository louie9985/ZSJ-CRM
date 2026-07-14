export type ViewKey = 'dashboard' | 'mail' | 'chat' | 'finance';

export type LeadRow = {
  id: string;
  name: string;
  source: string;
  owner: string;
  stage: string;
  valueCents: number;
  updatedAt: string;
  avatar: string;
};

export type MailItem = {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  starred: boolean;
  tag?: string;
  avatar: string;
};

export type Transaction = {
  id: string;
  type: string;
  counterparty: string;
  amountCents: number;
  time: string;
  status: '已入账' | '待审核' | '已退款';
};

export const salesTrend = [
  { date: '07/08', amount: 162000, leads: 48 },
  { date: '07/09', amount: 218000, leads: 56 },
  { date: '07/10', amount: 186000, leads: 51 },
  { date: '07/11', amount: 294000, leads: 67 },
  { date: '07/12', amount: 268000, leads: 63 },
  { date: '07/13', amount: 346000, leads: 78 },
  { date: '07/14', amount: 392000, leads: 86 },
];

export const financeTrend = [
  { date: '2月', income: 1680000, payout: 820000 },
  { date: '3月', income: 1940000, payout: 910000 },
  { date: '4月', income: 1830000, payout: 870000 },
  { date: '5月', income: 2260000, payout: 1030000 },
  { date: '6月', income: 2480000, payout: 1120000 },
  { date: '7月', income: 2760000, payout: 1190000 },
];

export const leads: LeadRow[] = [
  {
    id: 'L-260714-0862',
    name: '周晓琳',
    source: '抖音直播',
    owner: '林悦',
    stage: '已首触',
    valueCents: 1280000,
    updatedAt: '10 分钟前',
    avatar: 'https://i.pravatar.cc/96?img=47',
  },
  {
    id: 'L-260714-0859',
    name: '陈子昂',
    source: '老学员转介绍',
    owner: '高远',
    stage: '待接单',
    valueCents: 860000,
    updatedAt: '18 分钟前',
    avatar: 'https://i.pravatar.cc/96?img=12',
  },
  {
    id: 'L-260714-0847',
    name: '郑宁',
    source: '小红书',
    owner: '苏岚',
    stage: '跟进中',
    valueCents: 1580000,
    updatedAt: '35 分钟前',
    avatar: 'https://i.pravatar.cc/96?img=32',
  },
  {
    id: 'L-260714-0831',
    name: '何嘉诚',
    source: '官网表单',
    owner: '林悦',
    stage: '待判定',
    valueCents: 980000,
    updatedAt: '1 小时前',
    avatar: 'https://i.pravatar.cc/96?img=15',
  },
  {
    id: 'L-260714-0816',
    name: '宋佳怡',
    source: '视频号',
    owner: '高远',
    stage: '已成交',
    valueCents: 2360000,
    updatedAt: '2 小时前',
    avatar: 'https://i.pravatar.cc/96?img=45',
  },
];

export const mails: MailItem[] = [
  {
    id: 'mail-1',
    sender: '财务审核中心',
    subject: '3 笔订单等待到账确认',
    preview: '订单 O-260714-1024 等已完成报名审核，请在今日下班前核对到账凭证。',
    time: '10:24',
    unread: true,
    starred: true,
    tag: '待处理',
    avatar: '财',
  },
  {
    id: 'mail-2',
    sender: '销售一组 · 林悦',
    subject: '客资异议补充材料已提交',
    preview: '关于客资 L-260713-0712 的来源归属，已补充通话记录和首次触达截图。',
    time: '09:42',
    unread: true,
    starred: false,
    tag: '客资',
    avatar: '林',
  },
  {
    id: 'mail-3',
    sender: '系统通知',
    subject: '本周销售漏斗周报已生成',
    preview: '新增客资 1,248 条，有效率 63.8%，成交额较上周增长 12.6%。',
    time: '08:30',
    unread: false,
    starred: false,
    tag: '周报',
    avatar: '系',
  },
  {
    id: 'mail-4',
    sender: '学服中心 · 苏岚',
    subject: '风险学员服务计划复核',
    preview: '两名学员连续 14 天未完成学习任务，请协助确认后续服务节奏。',
    time: '昨天',
    unread: false,
    starred: true,
    tag: '学服',
    avatar: '苏',
  },
  {
    id: 'mail-5',
    sender: '质控中心',
    subject: '投诉工单 QC-0713-019 已关闭',
    preview: '责任判定及整改动作已完成归档，可查看完整处理记录。',
    time: '昨天',
    unread: false,
    starred: false,
    tag: '质控',
    avatar: '质',
  },
];

export const transactions: Transaction[] = [
  { id: 'TX-0714-0921', type: '订单收款', counterparty: '周晓琳', amountCents: 1280000, time: '今天 10:21', status: '已入账' },
  { id: 'TX-0714-0876', type: '佣金冻结', counterparty: '销售一组 · 林悦', amountCents: -192000, time: '今天 09:56', status: '待审核' },
  { id: 'TX-0714-0842', type: '订单收款', counterparty: '宋佳怡', amountCents: 2360000, time: '今天 09:15', status: '已入账' },
  { id: 'TX-0713-0798', type: '退款支出', counterparty: '王珊', amountCents: -860000, time: '昨天 17:42', status: '已退款' },
  { id: 'TX-0713-0741', type: '佣金解冻', counterparty: '销售二组 · 高远', amountCents: -264000, time: '昨天 15:20', status: '已入账' },
];

export const conversations = [
  { id: 'chat-1', title: '今日销售漏斗复盘', time: '刚刚' },
  { id: 'chat-2', title: '高意向客资跟进建议', time: '20 分钟前' },
  { id: 'chat-3', title: '退款原因归类摘要', time: '昨天' },
  { id: 'chat-4', title: '学员风险预警说明', time: '周一' },
];

export const formatCny = (valueCents: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
