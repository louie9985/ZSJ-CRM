"use client";

import type {TopPage} from "../data/analytics";
import type {DataGridColumn} from "@heroui-pro/react";

import {DataGrid, NumberValue, TrendChip} from "@heroui-pro/react";
import {useMemo} from "react";

import {TOP_PAGES} from "../data/analytics";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function TopPagesCard() {
  const columns = useMemo<DataGridColumn<TopPage>[]>(
    () => [
      {
        accessorKey: "path",
        allowsSorting: true,
        cell: (item) => <span className="font-medium">{item.path}</span>,
        header: "Path",
        id: "path",
        isRowHeader: true,
        minWidth: 220,
      },
      {
        accessorKey: "views",
        allowsSorting: true,
        cell: (item) => (
          <NumberValue className="tabular-nums" maximumFractionDigits={0} value={item.views} />
        ),
        header: "Views",
        id: "views",
        minWidth: 120,
      },
      {
        accessorKey: "avgTimeSeconds",
        allowsSorting: true,
        cell: (item) => (
          <span className="text-muted tabular-nums">{formatDuration(item.avgTimeSeconds)}</span>
        ),
        header: "Avg. time",
        id: "avgTimeSeconds",
        minWidth: 120,
      },
      {
        accessorKey: "bounceRate",
        allowsSorting: true,
        cell: (item) => (
          <NumberValue
            className="text-muted tabular-nums"
            maximumFractionDigits={1}
            style="percent"
            value={item.bounceRate / 100}
          />
        ),
        header: "Bounce",
        id: "bounceRate",
        minWidth: 100,
      },
      {
        cell: (item) => <TrendChip trend={item.trend}>{item.trendValue}</TrendChip>,
        header: "Trend",
        id: "trend",
        minWidth: 100,
      },
    ],
    [],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-base font-semibold">Top pages</h2>
        <p className="text-muted text-xs">Most-viewed pages over the selected period.</p>
      </div>
      <DataGrid
        aria-label="Top pages"
        columns={columns}
        contentClassName="min-w-[640px]"
        data={[...TOP_PAGES]}
        getRowId={(item) => item.id}
      />
    </section>
  );
}
