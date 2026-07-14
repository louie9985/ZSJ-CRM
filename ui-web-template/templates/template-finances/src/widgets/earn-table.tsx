"use client";

import type {EarnOpportunity} from "../data/earn";
import type {DataGridColumn} from "@heroui-pro/react";

import {Avatar, Button, Chip} from "@heroui/react";
import {DataGrid} from "@heroui-pro/react";
import {useMemo} from "react";

import {EARN_OPPORTUNITIES} from "../data/earn";

const RISK_COLOR: Readonly<Record<EarnOpportunity["risk"], "success" | "warning" | "danger">> = {
  High: "danger",
  Low: "success",
  Medium: "warning",
};

export function EarnTable() {
  const columns = useMemo<DataGridColumn<EarnOpportunity>[]>(
    () => [
      {
        accessorKey: "asset",
        cell: (item) => (
          <div className="flex items-center gap-2">
            <Avatar className="size-8 shrink-0">
              <Avatar.Image alt={item.asset} src={item.assetAvatar} />
              <Avatar.Fallback className={item.assetColor}>{item.asset[0]}</Avatar.Fallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{item.asset}</span>
              <span className="text-muted text-xs">{item.protocol}</span>
            </div>
          </div>
        ),
        header: "Asset",
        id: "asset",
        isRowHeader: true,
        minWidth: 180,
      },
      {
        accessorKey: "kind",
        cell: (item) => (
          <Chip size="sm" variant="soft">
            {item.kind}
          </Chip>
        ),
        header: "Type",
        id: "kind",
        minWidth: 120,
      },
      {
        accessorKey: "apy",
        allowsSorting: true,
        cell: (item) => (
          <span className="text-success text-sm font-semibold tabular-nums">
            {`${item.apy.toFixed(2)}%`}
          </span>
        ),
        header: "APY",
        id: "apy",
        minWidth: 100,
      },
      {
        accessorKey: "tvl",
        allowsSorting: true,
        cell: (item) => (
          <span className="text-foreground text-sm font-medium tabular-nums">{item.tvl}</span>
        ),
        header: "TVL",
        id: "tvl",
        minWidth: 100,
      },
      {
        accessorKey: "risk",
        cell: (item) => (
          <Chip color={RISK_COLOR[item.risk]} size="sm" variant="soft">
            {item.risk}
          </Chip>
        ),
        header: "Risk",
        id: "risk",
        minWidth: 100,
      },
      {
        align: "end",
        cell: () => (
          <Button size="sm" variant="tertiary">
            Stake
          </Button>
        ),
        header: "Actions",
        id: "actions",
        minWidth: 120,
      },
    ],
    [],
  );

  return (
    <DataGrid
      aria-label="Earn opportunities"
      columns={columns}
      contentClassName="min-w-[780px]"
      data={[...EARN_OPPORTUNITIES]}
      getRowId={(item) => item.id}
    />
  );
}
