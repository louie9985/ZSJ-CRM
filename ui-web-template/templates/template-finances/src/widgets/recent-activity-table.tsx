"use client";

import type {Transaction} from "../data/transactions";
import type {DataGridColumn, DataGridSortDescriptor} from "@heroui-pro/react";

import {ArrowUpRightFromSquare, BarsDescendingAlignCenter, Sliders} from "@gravity-ui/icons";
import {Avatar, Button, Chip, SearchField} from "@heroui/react";
import {DataGrid} from "@heroui-pro/react";
import {useCallback, useMemo, useState} from "react";

import {TRANSACTIONS} from "../data/transactions";

type TypeTone = "accent" | "success" | "default" | "warning";

const TYPE_TONE: Readonly<Record<Transaction["type"], TypeTone>> = {
  contract: "default",
  received: "success",
  sent: "accent",
  swapped: "warning",
};

export interface RecentActivityTableProps {
  /** Cap the number of rows shown (defaults to all). */
  limit?: number;
  /** Title shown above the table. */
  title?: string;
  /** Show the search + filter controls row. */
  showControls?: boolean;
}

export function RecentActivityTable({
  limit,
  showControls = false,
  title = "最近活动",
}: RecentActivityTableProps) {
  const [search, setSearch] = useState("");
  const [sortDescriptor, setSortDescriptor] = useState<DataGridSortDescriptor>({
    column: "timestamp",
    direction: "descending",
  });

  const visible = useMemo<Transaction[]>(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? TRANSACTIONS.filter(
          (tx) =>
            tx.asset.toLowerCase().includes(q) ||
            tx.typeLabel.toLowerCase().includes(q) ||
            tx.hash.toLowerCase().includes(q),
        )
      : [...TRANSACTIONS];

    const sorted = [...filtered].sort((a, b) => {
      const column = sortDescriptor.column as keyof Transaction;
      const direction = sortDescriptor.direction === "descending" ? -1 : 1;
      const first = a[column];
      const second = b[column];

      if (typeof first === "number" && typeof second === "number") {
        return (first - second) * direction;
      }

      return String(first ?? "").localeCompare(String(second ?? "")) * direction;
    });

    return limit != null ? sorted.slice(0, limit) : sorted;
  }, [search, sortDescriptor, limit]);

  const handleSearchChange = useCallback((value: string) => setSearch(value), []);

  const columns = useMemo<DataGridColumn<Transaction>[]>(
    () => [
      {
        accessorKey: "hash",
        cell: (tx) => (
          <div className="text-muted flex items-center gap-2 text-xs tabular-nums">
            {tx.hash}
            <ArrowUpRightFromSquare className="size-3.5 shrink-0" />
          </div>
        ),
        header: "交易编号",
        id: "hash",
        isRowHeader: true,
        minWidth: 160,
      },
      {
        accessorKey: "typeLabel",
        allowsSorting: true,
        cell: (tx) => {
          const Icon = tx.typeIcon;

          return (
            <div className="flex items-center gap-2">
              <Chip color={TYPE_TONE[tx.type]} size="sm" variant="soft">
                <Icon className="size-3.5 shrink-0" />
                <span>{tx.typeLabel}</span>
              </Chip>
            </div>
          );
        },
        header: "类型",
        id: "type",
        minWidth: 170,
      },
      {
        accessorKey: "asset",
        allowsSorting: true,
        cell: (tx) => (
          <div className="flex items-center gap-2">
            <Avatar className="size-6 shrink-0">
              <Avatar.Image alt={tx.asset} src={tx.assetAvatar} />
              <Avatar.Fallback className={tx.assetColor}>{tx.asset[0]}</Avatar.Fallback>
            </Avatar>
            <span className="text-sm font-medium">{tx.asset}</span>
          </div>
        ),
        header: "资产",
        id: "asset",
        minWidth: 120,
      },
      {
        accessorKey: "usd",
        allowsSorting: true,
        cell: (tx) => (
          <div className="flex flex-col">
            <span className="text-foreground text-sm font-medium tabular-nums">
              {tx.amount} {tx.asset}
            </span>
            <span className="text-muted text-xs tabular-nums">{tx.usdValue}</span>
          </div>
        ),
        header: "金额",
        id: "usd",
        minWidth: 140,
      },
      {
        accessorKey: "timestamp",
        allowsSorting: true,
        cell: (tx) => <span className="text-muted text-xs">{tx.date}</span>,
        header: "日期",
        id: "timestamp",
        minWidth: 180,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 px-2">
          <span className="text-foreground text-base font-semibold">{title}</span>
          <Chip size="sm" variant="soft">
            {TRANSACTIONS.length}
          </Chip>
        </div>
        {showControls ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="tertiary">
                <Sliders className="size-4" />
                筛选
              </Button>
              <Button size="sm" variant="tertiary">
                <BarsDescendingAlignCenter className="size-4" />
                排序
              </Button>
            </div>
            <SearchField
              className="w-full sm:w-[240px]"
              name="transaction-search"
              onChange={handleSearchChange}
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="搜索交易..." />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
        ) : null}
      </div>

      <DataGrid
        aria-label={title}
        columns={columns}
        contentClassName="min-w-[760px]"
        data={visible}
        getRowId={(item) => item.id}
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
      />
    </div>
  );
}
