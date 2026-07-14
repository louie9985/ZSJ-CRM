import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleDollarSign,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileClock,
  FileText,
  Inbox,
  Landmark,
  LayoutDashboard,
  Library,
  ListChecks,
  Mail,
  MessageCirclePlus,
  PanelLeftClose,
  PieChart,
  ReceiptText,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Target,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { Avatar, Button, Chip } from '@heroui/react';
import type { ViewKey } from './mock-data';

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  count?: number;
};

const globalItems: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: 'dashboard', label: '数据看板', icon: LayoutDashboard },
  { key: 'mail', label: '邮件中心', icon: Mail },
  { key: 'chat', label: '智能助手', icon: Bot },
  { key: 'finance', label: '财务中心', icon: WalletCards },
];

const contextItems: Record<ViewKey, Array<{ section: string; items: NavigationItem[] }>> = {
  dashboard: [
    {
      section: '经营视图',
      items: [
        { label: '业务概览', icon: ChartNoAxesCombined },
        { label: '漏斗分析', icon: BarChart3 },
        { label: '客资与客户', icon: Users },
        { label: '订单中心', icon: BriefcaseBusiness, count: 12 },
      ],
    },
    {
      section: '协同管理',
      items: [
        { label: '今日任务', icon: ListChecks, count: 8 },
        { label: '目标追踪', icon: Target },
        { label: '审批队列', icon: ClipboardCheck, count: 5 },
      ],
    },
  ],
  mail: [
    {
      section: '邮箱',
      items: [
        { label: '收件箱', icon: Inbox, count: 6 },
        { label: '星标邮件', icon: Star },
        { label: '稍后处理', icon: Clock3, count: 2 },
        { label: '已发送', icon: Send },
        { label: '草稿箱', icon: FileText, count: 1 },
      ],
    },
    {
      section: '管理',
      items: [
        { label: '归档', icon: Archive },
        { label: '回收站', icon: Trash2 },
      ],
    },
  ],
  chat: [
    {
      section: '智能工作区',
      items: [
        { label: '新建对话', icon: MessageCirclePlus },
        { label: '对话记录', icon: FileClock, count: 4 },
        { label: '提示词库', icon: Library },
      ],
    },
    {
      section: '业务助手',
      items: [
        { label: '销售分析助手', icon: Target },
        { label: '学服风险助手', icon: ShieldCheck },
        { label: '财务核对助手', icon: CircleDollarSign },
      ],
    },
  ],
  finance: [
    {
      section: '资金管理',
      items: [
        { label: '资金总览', icon: Landmark },
        { label: '收支分析', icon: PieChart },
        { label: '交易流水', icon: ReceiptText },
        { label: '到账审核', icon: ClipboardCheck, count: 7 },
      ],
    },
    {
      section: '结算管理',
      items: [
        { label: '佣金台账', icon: CircleDollarSign },
        { label: '退款审核', icon: FileClock, count: 3 },
        { label: '财务配置', icon: Settings },
      ],
    },
  ],
};

const viewLabels: Record<ViewKey, string> = {
  dashboard: '数据看板',
  mail: '邮件中心',
  chat: '智能助手',
  finance: '财务中心',
};

type GlobalRailProps = {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
};

export function GlobalRail({ activeView, onViewChange }: GlobalRailProps) {
  return (
    <aside className="global-rail" aria-label="界面总导航">
      <div className="brand-mark" aria-label="中世健 CRM">
        中
      </div>

      <nav className="global-nav">
        {globalItems.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            aria-label={label}
            className="global-nav-button"
            data-active={activeView === key}
            data-tooltip={label}
            isIconOnly
            variant="ghost"
            onPress={() => onViewChange(key)}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={1.9} />
          </Button>
        ))}
      </nav>

      <div className="global-rail-footer">
        <Button aria-label="帮助中心" className="global-nav-button" data-tooltip="帮助中心" isIconOnly variant="ghost">
          <CircleHelp aria-hidden="true" size={19} />
        </Button>
        <Button aria-label="系统通知" className="global-nav-button rail-notification" data-tooltip="系统通知" isIconOnly variant="ghost">
          <Bell aria-hidden="true" size={19} />
          <span className="notification-dot" />
        </Button>
        <Avatar className="rail-avatar" size="sm">
          <Avatar.Image alt="当前用户林沐" src="https://i.pravatar.cc/96?img=11" />
          <Avatar.Fallback>林</Avatar.Fallback>
        </Avatar>
      </div>
    </aside>
  );
}

type ContextSidebarProps = {
  activeItem: string;
  activeView: ViewKey;
  onItemChange: (label: string) => void;
  onPrimaryAction: () => void;
};

export function ContextSidebar({ activeItem, activeView, onItemChange, onPrimaryAction }: ContextSidebarProps) {
  const primaryLabel = activeView === 'mail' ? '写邮件' : activeView === 'chat' ? '新建对话' : null;

  return (
    <aside className="context-sidebar">
      <div className="context-heading">
        <div>
          <span className="context-eyebrow">中世健客户管理</span>
          <h2>{viewLabels[activeView]}</h2>
        </div>
        <Button aria-label="收起导航" className="subtle-icon-button" isIconOnly variant="ghost">
          <PanelLeftClose aria-hidden="true" size={18} />
        </Button>
      </div>

      {primaryLabel ? (
        <Button className="context-primary-button" fullWidth onPress={onPrimaryAction}>
          <MessageCirclePlus aria-hidden="true" size={17} />
          {primaryLabel}
        </Button>
      ) : null}

      <nav className="context-nav" aria-label={`${viewLabels[activeView]}导航`}>
        {contextItems[activeView].map((group) => (
          <div className="context-group" key={group.section}>
            <p>{group.section}</p>
            {group.items.map(({ label, icon: Icon, count }) => (
              <Button
                className="context-nav-button"
                data-active={activeItem === label}
                fullWidth
                key={label}
                variant="ghost"
                onPress={() => onItemChange(label)}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={1.9} />
                <span>{label}</span>
                {count ? <span className="context-count">{count}</span> : null}
              </Button>
            ))}
          </div>
        ))}
      </nav>

      <div className="workspace-card">
        <div className="workspace-card-header">
          <span className="workspace-logo">总</span>
          <div>
            <strong>总部工作区</strong>
            <span>企业版</span>
          </div>
        </div>
        <Chip className="workspace-chip" size="sm">演示数据</Chip>
      </div>
    </aside>
  );
}
