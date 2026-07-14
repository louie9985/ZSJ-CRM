"use client";

import {Card, Chip} from "@heroui/react";
import {NumberValue} from "@heroui-pro/react";
import {useMemo} from "react";

import {SPENDING_TRANSACTIONS, getSpendingCategory} from "../data/spending";

type GroupedTransactions = {
  dateGroup: string;
  total: number;
  items: typeof SPENDING_TRANSACTIONS;
};

export function SpendingTransactionsList() {
  const groups = useMemo<readonly GroupedTransactions[]>(() => {
    const map = new Map<string, (typeof SPENDING_TRANSACTIONS)[number][]>();

    for (const tx of SPENDING_TRANSACTIONS) {
      const existing = map.get(tx.dateGroup);

      if (existing) {
        existing.push(tx);
      } else {
        map.set(tx.dateGroup, [tx]);
      }
    }

    return Array.from(map.entries()).map(([dateGroup, items]) => ({
      dateGroup,
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
    }));
  }, []);

  return (
    <Card className="rounded-2xl">
      <Card.Header>
        <Card.Title className="text-base">Transactions</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.dateGroup} className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-muted text-xs font-medium">{group.dateGroup}</span>
              <NumberValue
                className="text-muted text-xs font-medium tabular-nums"
                currency="USD"
                maximumFractionDigits={2}
                style="currency"
                value={group.total}
              />
            </div>
            <div className="flex flex-col gap-3">
              {group.items.map((tx) => {
                const category = getSpendingCategory(tx.categoryId);

                return (
                  <div
                    key={tx.id}
                    className="hover:bg-surface/60 flex items-center gap-3 rounded-xl transition-colors"
                  >
                    {category ? (
                      <span
                        aria-hidden
                        className="bg-surface-secondary inline-flex size-8 shrink-0 items-center justify-center rounded-full"
                      >
                        <category.icon className={`size-4 ${category.tone}`} />
                      </span>
                    ) : (
                      <span className="bg-surface-secondary size-8 shrink-0 rounded-full" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-foreground truncate text-sm font-medium">
                        {tx.merchant}
                      </span>
                      <div className="flex items-center gap-2">
                        <Chip className="h-auto px-1.5 py-0 text-[10px]" size="sm" variant="soft">
                          {category?.label ?? tx.categoryId}
                        </Chip>
                        <span className="text-muted truncate text-xs">{tx.account}</span>
                      </div>
                    </div>
                    <NumberValue
                      className="text-foreground shrink-0 text-sm font-medium tabular-nums"
                      currency="USD"
                      maximumFractionDigits={2}
                      style="currency"
                      value={tx.amount}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
