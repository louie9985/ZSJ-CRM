"use client";

import type {TimeRangeId} from "../data/portfolio";

import {Card} from "@heroui/react";
import {LineChart, NumberValue, TrendChip} from "@heroui-pro/react";
import {useCallback, useMemo, useState} from "react";

import {TOTAL_BALANCE_USD} from "../data/holdings";
import {DEFAULT_RANGE_ID, PORTFOLIO_BY_RANGE, PORTFOLIO_RANGES} from "../data/portfolio";

function formatYTick(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;

  return `$${value.toFixed(0)}`;
}

export function PortfolioChartCard() {
  const [rangeId, setRangeId] = useState<TimeRangeId>(DEFAULT_RANGE_ID);

  // Derive chart + delta from the selected range during render.
  const range = PORTFOLIO_BY_RANGE[rangeId];
  const trend: "up" | "down" | "neutral" =
    range.delta > 0 ? "up" : range.delta < 0 ? "down" : "neutral";

  // The first-render chart data is memoized per range so Recharts doesn't
  // detect a fresh reference on unrelated renders.
  const data = useMemo(() => range.series.map((point) => ({...point})), [range]);

  // Tight domain around the selected range's values so the line fills the
  // card instead of hugging the top with empty space below.
  const [yMin, yMax] = useMemo<[number, number]>(() => {
    const values = range.series.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 1);
    const pad = spread * 0.15;

    return [Math.max(0, min - pad), max + pad];
  }, [range]);

  return (
    <Card className="rounded-2xl">
      <Card.Header className="flex-col items-start gap-4 pb-0 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          <Card.Title className="text-base">投资组合</Card.Title>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted text-xs">总余额</span>
            <NumberValue
              className="text-foreground text-2xl font-semibold tabular-nums"
              currency="USD"
              maximumFractionDigits={2}
              style="currency"
              value={TOTAL_BALANCE_USD}
            />
            <div className="flex items-center gap-2 text-xs">
              <TrendChip className="bg-transparent px-0" trend={trend}>
                {`${range.deltaPercent >= 0 ? "+" : ""}${range.deltaPercent.toFixed(2)}%`}
              </TrendChip>
              <span className="text-muted">{range.label}</span>
            </div>
          </div>
        </div>
        <RangeToggle rangeId={rangeId} onChange={setRangeId} />
      </Card.Header>
      <Card.Content>
        <LineChart data={data} height={220}>
          <LineChart.Grid vertical={false} />
          <LineChart.XAxis dataKey="t" tickMargin={8} />
          <LineChart.YAxis
            domain={[yMin, yMax]}
            tickCount={4}
            tickFormatter={formatYTick}
            width={52}
          />
          <LineChart.Line
            dataKey="value"
            dot={false}
            name="余额"
            stroke="var(--chart-3)"
            strokeWidth={2}
            type="monotone"
          />
          <LineChart.Tooltip content={<LineChart.TooltipContent />} />
        </LineChart>
      </Card.Content>
    </Card>
  );
}

interface RangeToggleProps {
  rangeId: TimeRangeId;
  onChange: (id: TimeRangeId) => void;
}

function RangeToggle({onChange, rangeId}: RangeToggleProps) {
  return (
    <div aria-label="时间范围" className="flex items-center gap-3" role="group">
      {PORTFOLIO_RANGES.map((range) => (
        <RangeButton
          key={range.id}
          isActive={rangeId === range.id}
          label={range.label}
          rangeId={range.id}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

interface RangeButtonProps {
  rangeId: TimeRangeId;
  label: string;
  isActive: boolean;
  onChange: (id: TimeRangeId) => void;
}

function RangeButton({isActive, label, onChange, rangeId}: RangeButtonProps) {
  const handleClick = useCallback(() => onChange(rangeId), [onChange, rangeId]);

  return (
    <button
      aria-pressed={isActive}
      type="button"
      className={`cursor-pointer text-xs font-medium transition-colors ${
        isActive ? "text-accent" : "text-muted hover:text-foreground"
      }`}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
