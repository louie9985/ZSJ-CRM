"use client";

import type {ReactNode} from "react";

import {Button, Input, Label, ListBox, Select, Separator, Switch, TextField} from "@heroui/react";

const CURRENCIES = [
  {id: "usd", label: "USD — US Dollar"},
  {id: "eur", label: "EUR — Euro"},
  {id: "gbp", label: "GBP — British Pound"},
  {id: "cad", label: "CAD — Canadian Dollar"},
  {id: "mxn", label: "MXN — Mexican Peso"},
] as const;

const NETWORKS = [
  {id: "ethereum", label: "Ethereum"},
  {id: "arbitrum", label: "Arbitrum"},
  {id: "optimism", label: "Optimism"},
  {id: "polygon", label: "Polygon"},
  {id: "solana", label: "Solana"},
  {id: "base", label: "Base"},
] as const;

export function SettingsPage() {
  return (
    <form className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <p className="text-muted text-sm">
        Manage account preferences, connected wallets, and security.
      </p>

      <Separator />

      <SettingsRow description="Used for receipts and security alerts." label="Email">
        <TextField name="email">
          <Label className="sr-only">Email</Label>
          <Input className="w-full sm:w-[280px]" placeholder="you@domain.com" />
        </TextField>
      </SettingsRow>

      <SettingsRow
        description="Default fiat used when displaying balances and quotes."
        label="Base currency"
      >
        <Select className="w-full sm:w-[280px]" name="currency">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CURRENCIES.map((currency) => (
                <ListBox.Item key={currency.id} id={currency.id} textValue={currency.label}>
                  {currency.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </SettingsRow>

      <SettingsRow
        description="Chain used by default for swaps and transfers."
        label="Default network"
      >
        <Select className="w-full sm:w-[280px]" name="network">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {NETWORKS.map((network) => (
                <ListBox.Item key={network.id} id={network.id} textValue={network.label}>
                  {network.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow
        description="Alerts for price moves and large transactions."
        label="Notifications"
      >
        <Switch aria-label="Enable notifications">
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingsRow>

      <SettingsRow
        description="Require biometric confirmation for outbound transfers."
        label="Biometric approvals"
      >
        <Switch aria-label="Require biometric approvals">
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </SettingsRow>

      <Separator />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="tertiary">Cancel</Button>
        <Button>Save changes</Button>
      </div>
    </form>
  );
}

function SettingsRow({
  children,
  description,
  label,
}: {
  children: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-[240px_1fr] sm:gap-6">
      <div className="flex flex-col">
        <span className="text-foreground text-sm font-medium">{label}</span>
        {description ? <span className="text-muted text-xs">{description}</span> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}
