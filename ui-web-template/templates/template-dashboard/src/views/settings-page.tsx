"use client";

// TODO: Wire these form controls to your account/workspace store. The controls
// are currently uncontrolled and don't persist changes.

import type {ReactNode} from "react";

import {
  Button,
  Checkbox,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  TextArea,
  TextField,
} from "@heroui/react";

const PROVINCES = [
  {id: "on", label: "Ontario"},
  {id: "qc", label: "Quebec"},
  {id: "bc", label: "British Columbia"},
  {id: "ab", label: "Alberta"},
] as const;

const CURRENCIES = [
  {id: "cad", label: "CAD - Canadian Dollar"},
  {id: "usd", label: "USD - US Dollar"},
  {id: "eur", label: "EUR - Euro"},
  {id: "gbp", label: "GBP - British Pound"},
  {id: "mxn", label: "MXN - Mexican Peso"},
] as const;

export function SettingsPage() {
  return (
    <form className="mx-auto flex max-w-5xl flex-col gap-4 px-5 pb-10 pt-4">
      <p className="text-muted text-sm">Manage your organization profile and preferences.</p>

      <Separator />

      <SettingsRow
        description="This will be displayed on your public profile."
        label="Organization Name"
      >
        <TextField name="org-name">
          <Label className="sr-only">Organization Name</Label>
          <Input fullWidth placeholder="Your organization" />
        </TextField>
      </SettingsRow>

      <Separator />

      <SettingsRow
        description="This will be displayed on your public profile. Maximum 240 characters."
        label="Organization Bio"
      >
        <TextField name="org-bio">
          <Label className="sr-only">Organization Bio</Label>
          <TextArea
            fullWidth
            className="min-h-24 resize-y"
            maxLength={240}
            placeholder="Tell customers about your organization"
          />
        </TextField>
      </SettingsRow>

      <Separator />

      <SettingsRow
        description="This is how customers can contact you for support."
        label="Organization Email"
      >
        <TextField name="org-email">
          <Label className="sr-only">Organization Email</Label>
          <Input fullWidth placeholder="info@example.com" type="email" />
        </TextField>
        <Checkbox id="org-email-public" name="org-email-public">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            Show email on public profile
          </Checkbox.Content>
        </Checkbox>
      </SettingsRow>

      <Separator />

      <SettingsRow description="This is where your organization is registered." label="Address">
        <TextField name="address-street">
          <Label className="sr-only">Street address</Label>
          <Input fullWidth placeholder="Street address" />
        </TextField>
        <TextField name="address-city">
          <Label className="sr-only">City</Label>
          <Input fullWidth placeholder="City" />
        </TextField>
        <div className="grid grid-cols-[1fr_160px] gap-3">
          <Select name="address-province" placeholder="Province / State">
            <Label className="sr-only">Province / State</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {PROVINCES.map((p) => (
                  <ListBox.Item key={p.id} id={p.id} textValue={p.label}>
                    {p.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <TextField name="address-postal">
            <Label className="sr-only">Postal / ZIP</Label>
            <Input fullWidth placeholder="Postal code" />
          </TextField>
        </div>
      </SettingsRow>

      <Separator />

      <SettingsRow
        description="The currency that your organization will be collecting."
        label="Currency"
      >
        <Select name="currency" placeholder="Select currency">
          <Label className="sr-only">Currency</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CURRENCIES.map((c) => (
                <ListBox.Item key={c.id} id={c.id} textValue={c.label}>
                  {c.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </SettingsRow>

      <Separator />

      <footer className="flex items-center justify-end gap-2 pt-2">
        <Button type="reset" variant="ghost">
          Reset
        </Button>
        <Button type="submit">Save changes</Button>
      </footer>
    </form>
  );
}

interface SettingsRowProps {
  description: string;
  label: string;
  children: ReactNode;
}

function SettingsRow({children, description, label}: SettingsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-10">
      <div className="flex flex-col gap-1">
        <span className="text-foreground text-sm font-medium">{label}</span>
        <p className="text-muted text-xs leading-snug">{description}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}
