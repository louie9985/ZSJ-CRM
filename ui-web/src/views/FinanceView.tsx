import { Button, Chip } from '@heroui/react';
import { AreaChart, KPI } from '@heroui-pro/react';
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Landmark,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { financeTrend, formatCny, transactions } from '../mock-data';

type FinanceViewProps = {
  onToast: (message: string) => void;
};

const financeStatusClass: Record<string, string> = {
  已入账: 'status-success',
  待审核: 'status-warning',
  已退款: 'status-neutral',
};

export function FinanceView({ onToast }: FinanceViewProps) {
  return (
    <div className="page page-finance">
      <header className="page-header finance-header">
        <div>
          <span className="section-kicker">财务中心</span>
          <h1>资金总览</h1>
          <p>统一查看收款、退款与佣金台账的演示汇总。</p>
        </div>
        <div className="page-header-actions">
          <label className="header-search finance-search">
            <Search aria-hidden="true" size={17} />
            <input aria-label="搜索财务流水" placeholder="搜索订单或流水号" />
          </label>
          <Button variant="outline"><CalendarDays aria-hidden="true" size={16} />本月</Button>
          <Button onPress={() => onToast('财务报表已生成，演示模式不下载文件')}><Download aria-hidden="true" size={16} />导出</Button>
        </div>
      </header>

      <section className="balance-band">
        <div className="balance-main">
          <span>本月确认到账</span>
          <strong>¥2,760,000</strong>
          <p><ArrowUpRight aria-hidden="true" size={16} /> 较上月增长 11.3% · 已核对 182 笔</p>
        </div>
        <div className="balance-divider" />
        <div className="balance-stat"><span>待确认金额</span><strong>¥186,400</strong><small>7 笔待审核</small></div>
        <div className="balance-stat"><span>本月退款</span><strong>¥94,600</strong><small>退款率 3.4%</small></div>
        <div className="balance-actions">
          <Button className="light-action-button" variant="secondary" onPress={() => onToast('已刷新演示资金数据')}>
            <RefreshCw aria-hidden="true" size={16} />刷新数据
          </Button>
          <Button className="light-action-button" variant="secondary" onPress={() => onToast('已打开到账审核演示队列')}>
            <ShieldCheck aria-hidden="true" size={16} />开始审核
          </Button>
        </div>
      </section>

      <section className="finance-kpi-grid" aria-label="财务指标">
        <KPI className="metric-card finance-kpi">
          <KPI.Header><KPI.Icon status="success"><Landmark aria-hidden="true" size={18} /></KPI.Icon><KPI.Title>实际到账</KPI.Title></KPI.Header>
          <KPI.Content><KPI.Value currency="CNY" locale="zh-CN" notation="compact" style="currency" value={2760000} /><KPI.Trend trend="up">11.3%</KPI.Trend></KPI.Content>
          <KPI.Footer>182 笔已核对</KPI.Footer>
        </KPI>
        <KPI className="metric-card finance-kpi">
          <KPI.Header><KPI.Icon status="warning"><Clock3 aria-hidden="true" size={18} /></KPI.Icon><KPI.Title>待审核</KPI.Title></KPI.Header>
          <KPI.Content><KPI.Value currency="CNY" locale="zh-CN" notation="compact" style="currency" value={186400} /><KPI.Trend trend="down">2.1%</KPI.Trend></KPI.Content>
          <KPI.Footer>最早一笔等待 36 分钟</KPI.Footer>
        </KPI>
        <KPI className="metric-card finance-kpi">
          <KPI.Header><KPI.Icon><CircleDollarSign aria-hidden="true" size={18} /></KPI.Icon><KPI.Title>冻结佣金</KPI.Title></KPI.Header>
          <KPI.Content><KPI.Value currency="CNY" locale="zh-CN" notation="compact" style="currency" value={328600} /><KPI.Trend trend="up">8.7%</KPI.Trend></KPI.Content>
          <KPI.Footer>涉及 46 笔订单</KPI.Footer>
        </KPI>
      </section>

      <section className="finance-grid">
        <div className="surface-panel cashflow-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">现金流</span><h2>近 6 个月收支趋势</h2></div>
            <div className="chart-legend"><span className="income-dot" />收入 <span className="payout-dot" />支出</div>
          </div>
          <AreaChart data={financeTrend} height={280}>
            <AreaChart.Grid stroke="var(--chart-grid)" vertical={false} />
            <AreaChart.XAxis axisLine={false} dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} />
            <AreaChart.YAxis axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={(value) => `${Number(value) / 10000}万`} tickLine={false} width={54} />
            <AreaChart.Tooltip content={<AreaChart.TooltipContent />} />
            <AreaChart.Area dataKey="income" fill="#307a5c" fillOpacity={0.1} name="收入" stroke="#307a5c" strokeWidth={2.5} type="monotone" />
            <AreaChart.Area dataKey="payout" fill="#ca6d4f" fillOpacity={0.06} name="支出" stroke="#ca6d4f" strokeWidth={2} type="monotone" />
          </AreaChart>
        </div>

        <div className="surface-panel approval-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">审核队列</span><h2>需要你的处理</h2></div>
            <Chip className="status-warning" size="sm">7 项</Chip>
          </div>
          <div className="approval-list">
            <button type="button" onClick={() => onToast('已打开到账确认 O-260714-1024')}>
              <span className="approval-icon green"><ArrowDownLeft aria-hidden="true" size={18} /></span>
              <span><strong>到账确认</strong><small>订单 O-260714-1024</small></span>
              <span className="approval-value"><strong>¥12,800</strong><small>8 分钟前</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </button>
            <button type="button" onClick={() => onToast('已打开退款审核 RF-260714-032')}>
              <span className="approval-icon coral"><ArrowUpRight aria-hidden="true" size={18} /></span>
              <span><strong>退款审核</strong><small>申请 RF-260714-032</small></span>
              <span className="approval-value"><strong>¥8,600</strong><small>22 分钟前</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </button>
            <button type="button" onClick={() => onToast('已打开佣金解冻批次 CM-0714-06')}>
              <span className="approval-icon blue"><WalletCards aria-hidden="true" size={18} /></span>
              <span><strong>佣金解冻</strong><small>批次 CM-0714-06</small></span>
              <span className="approval-value"><strong>¥26,400</strong><small>36 分钟前</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </button>
          </div>
          <Button className="approval-all-button" fullWidth variant="outline" onPress={() => onToast('已打开全部财务审核事项')}>查看全部审核事项</Button>
        </div>
      </section>

      <section className="surface-panel data-panel finance-table-panel">
        <div className="panel-heading table-panel-heading">
          <div><span className="section-kicker">账务明细</span><h2>最近交易</h2></div>
          <div className="table-actions">
            <Button variant="outline"><ReceiptText aria-hidden="true" size={16} />全部类型</Button>
            <Button aria-label="更多流水操作" isIconOnly variant="ghost"><MoreHorizontal aria-hidden="true" size={19} /></Button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table finance-table">
            <thead><tr><th>流水号</th><th>业务类型</th><th>关联对象</th><th>发生时间</th><th>状态</th><th>金额</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="mono-cell">{transaction.id}</td>
                  <td><div className="transaction-type"><span className={transaction.amountCents > 0 ? 'in' : 'out'}>{transaction.amountCents > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span>{transaction.type}</div></td>
                  <td>{transaction.counterparty}</td>
                  <td className="muted-cell">{transaction.time}</td>
                  <td><Chip className={financeStatusClass[transaction.status]} size="sm">{transaction.status}</Chip></td>
                  <td className={transaction.amountCents > 0 ? 'amount-cell income' : 'amount-cell'}>{transaction.amountCents > 0 ? '+' : ''}{formatCny(transaction.amountCents)}</td>
                  <td><Button aria-label={`查看流水${transaction.id}`} isIconOnly variant="ghost" onPress={() => onToast(`已选择流水 ${transaction.id}`)}><ChevronRight aria-hidden="true" size={17} /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="table-footer"><span><CheckCircle2 aria-hidden="true" size={15} /> 所有金额均为演示整数分数据</span><Button variant="ghost"><ArrowDownToLine aria-hidden="true" size={16} />导出流水</Button></footer>
      </section>
    </div>
  );
}
