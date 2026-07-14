import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { Check, PenLine, X } from 'lucide-react';
import { GlobalRail, ContextSidebar } from './navigation';
import type { ViewKey } from './mock-data';
import { DashboardView } from './views/DashboardView';
import { MailView } from './views/MailView';
import { ChatView } from './views/ChatView';
import { FinanceView } from './views/FinanceView';

const defaultItems: Record<ViewKey, string> = {
  dashboard: '业务概览',
  mail: '收件箱',
  chat: '新建对话',
  finance: '资金总览',
};

const isViewKey = (value: string | null): value is ViewKey =>
  value === 'dashboard' || value === 'mail' || value === 'chat' || value === 'finance';

function readViewFromUrl(): ViewKey {
  const value = new URLSearchParams(window.location.search).get('view');
  return isViewKey(value) ? value : 'dashboard';
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>(readViewFromUrl);
  const [activeItems, setActiveItems] = useState(defaultItems);
  const [isComposeOpen, setComposeOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const syncView = () => setActiveView(readViewFromUrl());
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => setToastMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleViewChange = useCallback((view: ViewKey) => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
    setActiveView(view);
  }, []);

  const handlePrimaryAction = useCallback(() => {
    if (activeView === 'mail') {
      setComposeOpen(true);
      return;
    }
    if (activeView === 'chat') {
      setActiveItems((current) => ({ ...current, chat: '新建对话' }));
      setToastMessage('已创建新的演示对话');
    }
  }, [activeView]);

  const activeContent = useMemo(() => {
    if (activeView === 'mail') return <MailView onCompose={() => setComposeOpen(true)} />;
    if (activeView === 'chat') return <ChatView />;
    if (activeView === 'finance') return <FinanceView onToast={setToastMessage} />;
    return <DashboardView onToast={setToastMessage} />;
  }, [activeView]);

  return (
    <div className="prototype-shell">
      <GlobalRail activeView={activeView} onViewChange={handleViewChange} />
      <ContextSidebar
        activeItem={activeItems[activeView]}
        activeView={activeView}
        onItemChange={(label) => setActiveItems((current) => ({ ...current, [activeView]: label }))}
        onPrimaryAction={handlePrimaryAction}
      />
      <main className="app-main">{activeContent}</main>

      {isComposeOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setComposeOpen(false)}>
          <section
            aria-labelledby="compose-title"
            aria-modal="true"
            className="compose-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="section-kicker">新邮件</span>
                <h2 id="compose-title">发送业务消息</h2>
              </div>
              <Button aria-label="关闭" isIconOnly variant="ghost" onPress={() => setComposeOpen(false)}>
                <X aria-hidden="true" size={19} />
              </Button>
            </header>
            <label>
              收件人
              <input defaultValue="财务审核中心" />
            </label>
            <label>
              主题
              <input defaultValue="请复核今日待确认订单" />
            </label>
            <label>
              正文
              <textarea defaultValue="请协助核对以下订单的到账信息，相关凭证已附在业务记录中。" rows={7} />
            </label>
            <footer>
              <span>仅用于效果预览，不会真正发送</span>
              <Button variant="outline" onPress={() => setComposeOpen(false)}>取消</Button>
              <Button
                onPress={() => {
                  setComposeOpen(false);
                  setToastMessage('演示邮件已放入发送队列');
                }}
              >
                <PenLine aria-hidden="true" size={16} />
                发送
              </Button>
            </footer>
          </section>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="prototype-toast" role="status">
          <Check aria-hidden="true" size={17} />
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
