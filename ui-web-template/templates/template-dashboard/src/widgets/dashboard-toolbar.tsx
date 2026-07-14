"use client";

import {ArrowsRotateLeft, Calendar, ChevronDown} from "@gravity-ui/icons";
import {Button, ButtonGroup, Dropdown, Label, Tabs} from "@heroui/react";

import {IconButton} from "../components/icon-button";

export function DashboardToolbar() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs defaultSelectedKey="overview">
        <Tabs.ListContainer>
          <Tabs.List aria-label="数据看板视图">
            <Tabs.Tab id="overview">
              概览
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sales">
              销售
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="expenses">
              支出
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="刷新" size="sm" variant="tertiary">
          <ArrowsRotateLeft className="size-4" />
        </IconButton>
        <ButtonGroup size="sm" variant="tertiary">
          <Button>
            <Calendar className="size-4" />
            按月
          </Button>
          <Dropdown>
            <Button isIconOnly aria-label="切换周期" size="sm" variant="tertiary">
              <ChevronDown className="size-4" />
            </Button>
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu>
                <Dropdown.Item id="daily" textValue="按日">
                  <Label>按日</Label>
                </Dropdown.Item>
                <Dropdown.Item id="weekly" textValue="按周">
                  <Label>按周</Label>
                </Dropdown.Item>
                <Dropdown.Item id="monthly" textValue="按月">
                  <Label>按月</Label>
                </Dropdown.Item>
                <Dropdown.Item id="yearly" textValue="按年">
                  <Label>按年</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </ButtonGroup>
        <Button size="sm">下载</Button>
      </div>
    </div>
  );
}
