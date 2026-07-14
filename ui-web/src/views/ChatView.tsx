import { useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { ChatMessage, PromptInput } from '@heroui-pro/react';
import {
  BarChart3,
  BrainCircuit,
  ChevronDown,
  Copy,
  FileText,
  Lightbulb,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
} from 'lucide-react';
import { conversations } from '../mock-data';

type ChatEntry = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

const initialMessages: ChatEntry[] = [
  {
    id: 'assistant-1',
    role: 'assistant',
    content: '我已经读取今天的演示经营数据。你可以让我分析销售漏斗、整理待办，或生成一份管理层摘要。',
  },
  {
    id: 'user-1',
    role: 'user',
    content: '帮我复盘今天的销售漏斗，重点看异常点。',
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    content: '今天新增客资 86 条，有效率 63.8%，整体优于本周均值。主要异常是销售二组有 7 条客资超过 10 分钟未首触，其中 3 条来自抖音直播高意向渠道。建议先核对排班状态，再由组长在 14:00 前完成重新分配。',
  },
];

const suggestions = [
  { icon: BarChart3, label: '总结今日经营数据' },
  { icon: ShieldCheck, label: '找出风险订单' },
  { icon: Lightbulb, label: '生成跟进建议' },
  { icon: FileText, label: '整理主管周报' },
];

export function ChatView() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');

  const submitPrompt = () => {
    const content = draft.trim();
    if (!content) return;
    const now = Date.now();
    setMessages((current) => [
      ...current,
      { id: `user-${now}`, role: 'user', content },
      {
        id: `assistant-${now}`,
        role: 'assistant',
        content: '根据当前 Mock 数据，我建议先查看高意向客资的首触时效，再检查财务待审核订单。正式版本会按你的数据权限读取事件指标，这里仅展示交互效果。',
      },
    ]);
    setDraft('');
  };

  return (
    <div className="chat-layout">
      <aside className="conversation-pane">
        <header>
          <div>
            <span className="section-kicker">对话记录</span>
            <h2>最近对话</h2>
          </div>
          <Button aria-label="搜索对话" isIconOnly variant="ghost">
            <Search aria-hidden="true" size={18} />
          </Button>
        </header>
        <div className="conversation-list">
          {conversations.map((conversation, index) => (
            <button className="conversation-item" data-active={index === 0} key={conversation.id} type="button">
              <span className="conversation-icon"><BrainCircuit aria-hidden="true" size={16} /></span>
              <span><strong>{conversation.title}</strong><small>{conversation.time}</small></span>
              <MoreHorizontal aria-hidden="true" size={16} />
            </button>
          ))}
        </div>
        <div className="chat-library-card">
          <WandSparkles aria-hidden="true" size={20} />
          <div><strong>团队提示词库</strong><span>已保存 18 个业务模板</span></div>
          <Button aria-label="打开提示词库" isIconOnly variant="ghost"><ChevronDown aria-hidden="true" size={17} /></Button>
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-header">
          <div className="assistant-identity">
            <span className="assistant-logo"><Sparkles aria-hidden="true" size={19} /></span>
            <div><h1>中世健智能助手</h1><span><i /> 已连接演示数据</span></div>
          </div>
          <div className="chat-header-actions">
            <Chip size="sm">销售分析</Chip>
            <Button variant="outline">智能分析模型 <ChevronDown aria-hidden="true" size={15} /></Button>
            <Button aria-label="更多对话操作" isIconOnly variant="ghost"><MoreHorizontal aria-hidden="true" size={19} /></Button>
          </div>
        </header>

        <div className="chat-scroll-area">
          <div className="chat-transcript">
            <div className="chat-date-divider"><span>今天 10:36</span></div>
            {messages.map((message) =>
              message.role === 'assistant' ? (
                <ChatMessage.Assistant key={message.id}>
                  <ChatMessage.Avatar alt="中世健智能助手" fallback="智" />
                  <ChatMessage.Body>
                    <ChatMessage.Content>{message.content}</ChatMessage.Content>
                    <div className="chat-message-actions">
                      <ChatMessage.Action aria-label="复制回答" tooltip="复制"><Copy aria-hidden="true" size={15} /></ChatMessage.Action>
                      <ChatMessage.Action aria-label="重新生成" tooltip="重新生成"><RotateCcw aria-hidden="true" size={15} /></ChatMessage.Action>
                      <ChatMessage.Action aria-label="回答有帮助" tooltip="有帮助"><ThumbsUp aria-hidden="true" size={15} /></ChatMessage.Action>
                      <ChatMessage.Action aria-label="回答需改进" tooltip="需改进"><ThumbsDown aria-hidden="true" size={15} /></ChatMessage.Action>
                    </div>
                  </ChatMessage.Body>
                </ChatMessage.Assistant>
              ) : (
                <ChatMessage.User key={message.id}>
                  <ChatMessage.Body>
                    <ChatMessage.Bubble><ChatMessage.Content>{message.content}</ChatMessage.Content></ChatMessage.Bubble>
                  </ChatMessage.Body>
                </ChatMessage.User>
              ),
            )}

            <div className="chat-insight-block">
              <div className="insight-head"><BarChart3 aria-hidden="true" size={18} /><strong>建议优先动作</strong><Chip className="status-warning" size="sm">3 项</Chip></div>
              <ol>
                <li><span>1</span><div><strong>重新分配超时客资</strong><p>销售二组 · 7 条 · 高优先级</p></div></li>
                <li><span>2</span><div><strong>检查今日销售排班</strong><p>确认两名成员是否处于可接单状态</p></div></li>
                <li><span>3</span><div><strong>14:00 后复查首触率</strong><p>目标恢复至 92% 以上</p></div></li>
              </ol>
            </div>
          </div>
        </div>

        <div className="chat-composer-wrap">
          <div className="prompt-suggestions">
            {suggestions.map(({ icon: Icon, label }) => (
              <button key={label} type="button" onClick={() => setDraft(label)}>
                <Icon aria-hidden="true" size={15} />{label}
              </button>
            ))}
          </div>
          <PromptInput className="chat-prompt" status="ready" value={draft} onSubmit={submitPrompt} onValueChange={setDraft}>
            <PromptInput.Content>
              <PromptInput.TextArea aria-label="向智能助手提问" placeholder="询问经营数据、客户跟进或业务流程…" />
            </PromptInput.Content>
            <PromptInput.Toolbar>
              <PromptInput.ToolbarStart>
                <PromptInput.Action aria-label="添加附件" tooltip="添加附件"><Paperclip aria-hidden="true" size={17} /></PromptInput.Action>
              </PromptInput.ToolbarStart>
              <PromptInput.ToolbarEnd>
                <span className="composer-model">仅使用可见范围内的数据</span>
                <PromptInput.Send aria-label="发送消息" />
              </PromptInput.ToolbarEnd>
            </PromptInput.Toolbar>
          </PromptInput>
        </div>
      </section>
    </div>
  );
}
