import { Avatar, Button, Chip } from '@heroui/react';
import { AreaChart, KPI } from '@heroui-pro/react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  MoreHorizontal,
  Search,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { formatCny, leads, salesTrend } from '../mock-data';

type DashboardViewProps = {
  onToast: (message: string) => void;
};

const channelRows = [
  { label: '抖音直播', value: 36, amount: '450 条', color: '#307a5c' },
  { label: '老学员转介绍', value: 27, amount: '337 条', color: '#3a6ea5' },
  { label: '小红书', value: 21, amount: '262 条', color: '#ca6d4f' },
  { label: '其他渠道', value: 16, amount: '199 条', color: '#d5a52d' },
];

const stageClass: Record<string, string> = {
  待接单: 'status-warning',
  已首触: 'status-info',
  跟进中: 'status-accent',
  待判定: 'status-neutral',
  已成交: 'status-success',
};

export function DashboardView({ onToast }: DashboardViewProps) {
  return (
    <div className="page page-dashboard">
      <header className="page-header dashboard-header">
        <div>
          <span className="section-kicker">2026 年 7 月 14 日 · 星期二</span>
          <h1>上午好，林沐</h1>
          <p>今日新增 86 条客资，7 个审批事项等待处理。</p>
        </div>
        <div className="page-header-actions">
          <label className="header-search">
            <Search aria-hidden="true" size={17} />
            <input aria-label="全局搜索" placeholder="搜索客户、订单或工单" />
            <kbd>⌘ K</kbd>
          </label>
          <Button variant="outline" onPress={() => onToast('报表已生成，演示模式不下载文件')}>
            <ArrowDownToLine aria-hidden="true" size={16} />
            导出报表
          </Button>
          <Button onPress={() => onToast('已打开新建客资演示流程')}>
            <Sparkles aria-hidden="true" size={16} />
            新建客资
          </Button>
        </div>
      </header>

      <section className="kpi-grid" aria-label="核心经营指标">
        <KPI className="metric-card metric-green">
          <KPI.Header>
            <KPI.Icon><Users aria-hidden="true" size={19} /></KPI.Icon>
            <KPI.Title>本周新增客资</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value locale="zh-CN" value={1248} />
            <KPI.Trend trend="up">12.6%</KPI.Trend>
          </KPI.Content>
          <KPI.Footer>较上周增加 140 条</KPI.Footer>
        </KPI>

        <KPI className="metric-card metric-blue">
          <KPI.Header>
            <KPI.Icon><Target aria-hidden="true" size={19} /></KPI.Icon>
            <KPI.Title>有效客资率</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value style="percent" value={0.638} />
            <KPI.Trend trend="up">4.2%</KPI.Trend>
          </KPI.Content>
          <KPI.Footer>目标值 60%，当前已达标</KPI.Footer>
        </KPI>

        <KPI className="metric-card metric-coral">
          <KPI.Header>
            <KPI.Icon><CircleDollarSign aria-hidden="true" size={19} /></KPI.Icon>
            <KPI.Title>本月成交额</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value currency="CNY" locale="zh-CN" notation="compact" style="currency" value={2760000} />
            <KPI.Trend trend="up">18.4%</KPI.Trend>
          </KPI.Content>
          <KPI.Footer>距离月目标还差 ¥640,000</KPI.Footer>
        </KPI>

        <KPI className="metric-card metric-yellow">
          <KPI.Header>
            <KPI.Icon><Clock3 aria-hidden="true" size={19} /></KPI.Icon>
            <KPI.Title>平均首触时长</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value value={7.4} />
            <span className="kpi-unit">分钟</span>
            <KPI.Trend trend="down">8.1%</KPI.Trend>
          </KPI.Content>
          <KPI.Footer>较上周缩短 39 秒</KPI.Footer>
        </KPI>
      </section>

      <section className="dashboard-grid">
        <div className="surface-panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">销售表现</span>
              <h2>近 7 日成交趋势</h2>
            </div>
            <div className="segmented-control" aria-label="成交趋势时间范围">
              <button type="button">日</button>
              <button className="is-active" type="button">周</button>
              <button type="button">月</button>
            </div>
          </div>
          <div className="chart-summary">
            <strong>¥1,906,000</strong>
            <span><ArrowUpRight aria-hidden="true" size={15} /> 较上周增长 14.8%</span>
          </div>
          <AreaChart className="dashboard-chart" data={salesTrend} height={250}>
            <AreaChart.Grid stroke="var(--chart-grid)" vertical={false} />
            <AreaChart.XAxis axisLine={false} dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickLine={false} />
            <AreaChart.YAxis axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={(value) => `${Number(value) / 10000}万`} tickLine={false} width={46} />
            <AreaChart.Tooltip content={<AreaChart.TooltipContent />} />
            <AreaChart.Area dataKey="amount" fill="#307a5c" fillOpacity={0.12} name="成交额" stroke="#307a5c" strokeWidth={2.5} type="monotone" />
          </AreaChart>
        </div>

        <div className="surface-panel channel-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">来源结构</span>
              <h2>客资渠道分布</h2>
            </div>
            <Button aria-label="查看更多渠道数据" isIconOnly variant="ghost">
              <MoreHorizontal aria-hidden="true" size={19} />
            </Button>
          </div>

          <div className="channel-donut" aria-label="渠道总数 1248 条">
            <div className="donut-ring">
              <div><strong>1,248</strong><span>本周客资</span></div>
            </div>
          </div>

          <div className="channel-list">
            {channelRows.map((row) => (
              <div className="channel-row" key={row.label}>
                <span className="channel-dot" style={{ backgroundColor: row.color }} />
                <span>{row.label}</span>
                <strong>{row.amount}</strong>
                <span className="channel-percent">{row.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-panel data-panel">
        <div className="panel-heading table-panel-heading">
          <div>
            <span className="section-kicker">实时动态</span>
            <h2>最新客资</h2>
          </div>
          <div className="table-actions">
            <Button variant="outline">
              <CalendarDays aria-hidden="true" size={16} />
              今天
            </Button>
            <Button variant="outline">
              <Filter aria-hidden="true" size={16} />
              筛选
            </Button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>客户</th>
                <th>来源</th>
                <th>负责人</th>
                <th>当前阶段</th>
                <th>预计价值</th>
                <th>更新时间</th>
                <th><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar size="sm">
                        <Avatar.Image alt={lead.name} src={lead.avatar} />
                        <Avatar.Fallback>{lead.name.slice(0, 1)}</Avatar.Fallback>
                      </Avatar>
                      <div><strong>{lead.name}</strong><span>{lead.id}</span></div>
                    </div>
                  </td>
                  <td>{lead.source}</td>
                  <td>{lead.owner}</td>
                  <td><Chip className={stageClass[lead.stage]} size="sm">{lead.stage}</Chip></td>
                  <td className="amount-cell">{formatCny(lead.valueCents)}</td>
                  <td className="muted-cell">{lead.updatedAt}</td>
                  <td>
                    <Button aria-label={`查看${lead.name}详情`} isIconOnly variant="ghost" onPress={() => onToast(`已选择 ${lead.name}，详情为演示数据`)}>
                      <ChevronRight aria-hidden="true" size={17} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
