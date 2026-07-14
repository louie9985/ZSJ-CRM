import { useMemo, useState } from 'react';
import { Avatar, Button, Chip } from '@heroui/react';
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  Clock3,
  Forward,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Printer,
  Reply,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { mails as initialMails } from '../mock-data';

type MailViewProps = {
  onCompose: () => void;
};

export function MailView({ onCompose }: MailViewProps) {
  const [mailItems, setMailItems] = useState(initialMails);
  const [selectedId, setSelectedId] = useState(initialMails[0].id);
  const [query, setQuery] = useState('');
  const [isDetailOpen, setDetailOpen] = useState(false);

  const filteredMails = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return mailItems;
    return mailItems.filter((mail) => `${mail.sender}${mail.subject}${mail.preview}`.toLowerCase().includes(normalized));
  }, [mailItems, query]);

  const selectedMail = mailItems.find((mail) => mail.id === selectedId) ?? mailItems[0];

  const toggleStar = (id: string) => {
    setMailItems((current) => current.map((mail) => (mail.id === id ? { ...mail, starred: !mail.starred } : mail)));
  };

  return (
    <div className="mail-layout" data-detail-open={isDetailOpen}>
      <section className="mail-list-pane">
        <header className="mail-list-header">
          <div>
            <span className="section-kicker">消息协同</span>
            <h1>收件箱</h1>
          </div>
          <Button aria-label="写邮件" className="mobile-compose-button" isIconOnly onPress={onCompose}>
            <PenLine aria-hidden="true" size={17} />
          </Button>
        </header>

        <label className="mail-search">
          <Search aria-hidden="true" size={17} />
          <input aria-label="搜索邮件" placeholder="搜索发件人或主题" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>

        <div className="mail-toolbar">
          <label className="mail-select-all"><input aria-label="全选邮件" type="checkbox" /> 全选</label>
          <Button aria-label="归档选中邮件" isIconOnly variant="ghost"><Archive aria-hidden="true" size={17} /></Button>
          <Button aria-label="删除选中邮件" isIconOnly variant="ghost"><Trash2 aria-hidden="true" size={17} /></Button>
          <Button className="mail-toolbar-more" variant="ghost">最新优先 <ChevronDown aria-hidden="true" size={15} /></Button>
        </div>

        <div className="mail-items" role="list">
          {filteredMails.map((mail) => (
            <article
              className="mail-item"
              data-active={selectedId === mail.id}
              data-unread={mail.unread}
              key={mail.id}
              role="listitem"
              onClick={() => {
                setSelectedId(mail.id);
                setDetailOpen(true);
              }}
            >
              <Avatar className="mail-avatar" size="sm">
                <Avatar.Fallback>{mail.avatar}</Avatar.Fallback>
              </Avatar>
              <div className="mail-item-content">
                <div className="mail-item-meta">
                  <strong>{mail.sender}</strong>
                  <time>{mail.time}</time>
                </div>
                <h3>{mail.subject}</h3>
                <p>{mail.preview}</p>
                <div className="mail-item-footer">
                  {mail.tag ? <Chip size="sm">{mail.tag}</Chip> : <span />}
                  <button
                    aria-label={mail.starred ? '取消星标' : '添加星标'}
                    className="plain-icon-button"
                    data-active={mail.starred}
                    title={mail.starred ? '取消星标' : '添加星标'}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStar(mail.id);
                    }}
                  >
                    <Star aria-hidden="true" fill={mail.starred ? 'currentColor' : 'none'} size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <article className="mail-detail-pane">
        <header className="mail-detail-toolbar">
          <div className="toolbar-group">
            <Button aria-label="返回邮件列表" className="mail-back-button" isIconOnly variant="ghost" onPress={() => setDetailOpen(false)}>
              <ArrowLeft aria-hidden="true" size={18} />
            </Button>
            <Button aria-label="归档邮件" isIconOnly variant="ghost"><Archive aria-hidden="true" size={18} /></Button>
            <Button aria-label="稍后处理" isIconOnly variant="ghost"><Clock3 aria-hidden="true" size={18} /></Button>
            <Button aria-label="删除邮件" isIconOnly variant="ghost"><Trash2 aria-hidden="true" size={18} /></Button>
          </div>
          <div className="toolbar-group">
            <Button aria-label="打印邮件" isIconOnly variant="ghost"><Printer aria-hidden="true" size={18} /></Button>
            <Button aria-label="更多操作" isIconOnly variant="ghost"><MoreHorizontal aria-hidden="true" size={18} /></Button>
          </div>
        </header>

        <div className="mail-detail-content">
          <div className="mail-detail-title-row">
            <div>
              <div className="mail-detail-tags">
                <Chip className="status-warning" size="sm">{selectedMail.tag ?? '业务消息'}</Chip>
                {selectedMail.unread ? <span className="unread-label">未读</span> : null}
              </div>
              <h2>{selectedMail.subject}</h2>
            </div>
            <Button
              aria-label={selectedMail.starred ? '取消星标' : '添加星标'}
              className="mail-star-button"
              data-active={selectedMail.starred}
              isIconOnly
              variant="ghost"
              onPress={() => toggleStar(selectedMail.id)}
            >
              <Star aria-hidden="true" fill={selectedMail.starred ? 'currentColor' : 'none'} size={19} />
            </Button>
          </div>

          <div className="sender-row">
            <Avatar>
              <Avatar.Fallback>{selectedMail.avatar}</Avatar.Fallback>
            </Avatar>
            <div>
              <strong>{selectedMail.sender}</strong>
              <span>发送给：林沐 · 总部工作区</span>
            </div>
            <time>{selectedMail.time}</time>
          </div>

          <div className="mail-body">
            <p>林沐，你好：</p>
            <p>{selectedMail.preview}</p>
            <p>系统已将相关业务记录汇总如下，请完成处理后在对应事项中更新状态。</p>

            <section className="mail-summary-block">
              <div><span>关联事项</span><strong>到账确认 · 3 笔</strong></div>
              <div><span>处理期限</span><strong>今天 18:00 前</strong></div>
              <div><span>负责部门</span><strong>财务审核中心</strong></div>
            </section>

            <p>如需补充材料，可直接回复本邮件联系发起人。</p>
            <p className="mail-signature">中世健 CRM 业务协同中心<br />2026 年 7 月 14 日</p>
          </div>

          <div className="attachment-row">
            <Paperclip aria-hidden="true" size={18} />
            <div><strong>今日待确认订单.xlsx</strong><span>18 KB · 安全扫描已通过</span></div>
            <Button variant="outline">查看附件</Button>
          </div>

          <div className="mail-reply-actions">
            <Button><Reply aria-hidden="true" size={17} />回复</Button>
            <Button variant="outline"><Forward aria-hidden="true" size={17} />转发</Button>
            <span><MailOpen aria-hidden="true" size={15} /> 已同步到站内通知</span>
          </div>
        </div>
      </article>
    </div>
  );
}
