"use client";

// TODO: Replace the static `TRACKER_TASKS` (src/data/tracker.ts) with a live
// task store (InstantDB, Drizzle, your own API, etc.). `useKanban` drives
// optimistic DnD locally — persist the reordered column in your
// `onReorder`/`onInsert` handlers once you're wired up to a backend.

import type {TrackerStatus, TrackerTask} from "../data/tracker";
import type {UseKanbanReturn} from "@heroui-pro/react";
import type {ComponentType} from "react";

import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  CirclePlay,
  Copy,
  Pencil,
  Plus,
  Stopwatch,
  TrashBin,
} from "@gravity-ui/icons";
import {Avatar, Chip, Header, Label, ProgressBar} from "@heroui/react";
import {ContextMenu, KPI, KPIGroup, Kanban, useKanban, useKanbanColumn} from "@heroui-pro/react";
import {Fragment, useMemo} from "react";

import {IconButton} from "../components/icon-button";
import {TRACKER_COLUMNS, TRACKER_TASKS} from "../data/tracker";

const COLUMN_META: Record<
  TrackerStatus,
  {indicator: string; icon: ComponentType<{className?: string}>}
> = {
  Done: {icon: CircleCheck, indicator: "bg-success"},
  "In Progress": {icon: CirclePlay, indicator: "bg-warning"},
  "To Do": {icon: CircleDashed, indicator: "bg-accent"},
};

const KPI_META: Record<
  TrackerStatus,
  {
    icon: ComponentType<{className?: string}>;
    label: string;
    status: "success" | "warning" | "danger";
  }
> = {
  Done: {icon: CircleCheck, label: "Completed", status: "success"},
  "In Progress": {icon: CirclePlay, label: "In Progress", status: "warning"},
  "To Do": {icon: CircleDashed, label: "To Do", status: "danger"},
};

function getTaskColumn(task: TrackerTask): string {
  return task.status;
}

function setTaskColumn(task: TrackerTask, column: string): TrackerTask {
  return {...task, status: column as TrackerStatus};
}

export function TrackerPage() {
  const kanban = useKanban<TrackerTask>({
    getColumn: getTaskColumn,
    initialItems: [...TRACKER_TASKS],
    setColumn: setTaskColumn,
  });

  // Counts derived from the live kanban list so KPIs update as cards are
  // dragged (`rerender-derived-state-no-effect`).
  const counts = useMemo(() => {
    const base: Record<TrackerStatus, number> = {Done: 0, "In Progress": 0, "To Do": 0};

    for (const item of kanban.list.items) {
      base[item.status] += 1;
    }

    return base;
  }, [kanban.list.items]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <p className="text-muted text-sm">Track work across your team.</p>

      <KPIGroup>
        {TRACKER_COLUMNS.map((column, index) => {
          const meta = KPI_META[column];
          const Icon = meta.icon;

          return (
            <Fragment key={column}>
              {index > 0 ? <KPIGroup.Separator /> : null}
              <KPI>
                <KPI.Header>
                  <KPI.Icon status={meta.status}>
                    <Icon />
                  </KPI.Icon>
                  <KPI.Title>{meta.label}</KPI.Title>
                </KPI.Header>
                <KPI.Content>
                  <KPI.Value maximumFractionDigits={0} value={counts[column]} />
                </KPI.Content>
              </KPI>
            </Fragment>
          );
        })}
      </KPIGroup>

      <Kanban>
        {TRACKER_COLUMNS.map((column) => (
          <TrackerColumn key={column} column={column} kanban={kanban} />
        ))}
      </Kanban>
    </div>
  );
}

interface TrackerColumnProps {
  column: TrackerStatus;
  kanban: UseKanbanReturn<TrackerTask>;
}

function TrackerColumn({column, kanban}: TrackerColumnProps) {
  const {dragAndDropHooks, items} = useKanbanColumn(kanban, column);
  const meta = COLUMN_META[column];

  return (
    <Kanban.Column>
      <Kanban.ColumnHeader>
        <Kanban.ColumnIndicator className={meta.indicator} />
        <Kanban.ColumnTitle>{column}</Kanban.ColumnTitle>
        <Kanban.ColumnCount>{items.length}</Kanban.ColumnCount>
        <Kanban.ColumnActions>
          <IconButton label={`Add ${column} task`} size="sm" variant="ghost">
            <Plus className="size-4" />
          </IconButton>
        </Kanban.ColumnActions>
      </Kanban.ColumnHeader>
      <Kanban.ColumnBody>
        <Kanban.CardList
          aria-label={column}
          dragAndDropHooks={dragAndDropHooks}
          items={items}
          renderEmptyState={() => <span className="text-muted text-xs">Drop tasks here</span>}
        >
          {(task) => (
            <Kanban.Card textValue={task.title}>
              <TrackerCardContextMenu column={column} kanban={kanban} taskId={task.id}>
                <TrackerCardContent task={task} />
              </TrackerCardContextMenu>
            </Kanban.Card>
          )}
        </Kanban.CardList>
      </Kanban.ColumnBody>
    </Kanban.Column>
  );
}

interface TrackerCardContextMenuProps {
  children: React.ReactNode;
  column: TrackerStatus;
  kanban: UseKanbanReturn<TrackerTask>;
  taskId: string;
}

function TrackerCardContextMenu({children, column, kanban, taskId}: TrackerCardContextMenuProps) {
  const otherColumns = TRACKER_COLUMNS.filter((c) => c !== column);

  return (
    <ContextMenu>
      <ContextMenu.Trigger className="flex flex-col gap-[inherit]">{children}</ContextMenu.Trigger>
      <ContextMenu.Popover>
        <ContextMenu.Menu>
          <ContextMenu.Section>
            <Header>Actions</Header>
            <ContextMenu.Item textValue="Edit">
              <Pencil />
              <Label>Edit</Label>
            </ContextMenu.Item>
            <ContextMenu.Item textValue="Duplicate">
              <Copy />
              <Label>Duplicate</Label>
            </ContextMenu.Item>
          </ContextMenu.Section>
          <ContextMenu.Separator />
          <ContextMenu.Section>
            <Header>Move to</Header>
            {otherColumns.map((col) => (
              <ContextMenu.Item
                key={col}
                textValue={`Move to ${col}`}
                onAction={() => kanban.moveItem(taskId, col)}
              >
                <ArrowRight />
                <Label>{col}</Label>
              </ContextMenu.Item>
            ))}
          </ContextMenu.Section>
          <ContextMenu.Separator />
          <ContextMenu.Section>
            <ContextMenu.Item textValue="Delete" onAction={() => kanban.removeItem(taskId)}>
              <TrashBin />
              <Label className="text-danger">Delete</Label>
            </ContextMenu.Item>
          </ContextMenu.Section>
        </ContextMenu.Menu>
      </ContextMenu.Popover>
    </ContextMenu>
  );
}

function TrackerCardContent({task}: {task: TrackerTask}) {
  const isDone = task.status === "Done";

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Chip color={task.tag.color} size="sm" variant="soft">
          {task.tag.label}
        </Chip>
        {task.dueDate ? (
          <span className="text-muted inline-flex items-center gap-1 text-xs tabular-nums">
            <Stopwatch className="size-3" />
            {task.dueDate}
          </span>
        ) : null}
      </div>

      <span
        className={`text-foreground text-sm font-medium leading-snug ${
          isDone ? "line-through opacity-60" : ""
        }`}
      >
        {task.title}
      </span>

      {task.description ? (
        <span className="text-muted text-xs leading-snug">{task.description}</span>
      ) : null}

      {task.subtasks ? (
        <div className="flex items-center gap-2">
          <ProgressBar
            aria-label="Subtasks"
            className="flex-1"
            color="accent"
            size="sm"
            value={(task.subtasks.completed / task.subtasks.total) * 100}
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <span className="text-muted text-xs tabular-nums">
            {task.subtasks.completed}/{task.subtasks.total}
          </span>
        </div>
      ) : null}

      <div className="mt-0.5 flex -space-x-2">
        {task.assignees.slice(0, 3).map((assignee) => (
          <Avatar key={assignee.name} className="ring-background size-5 ring-2" size="sm">
            <Avatar.Image alt={assignee.name} src={assignee.avatar} />
            <Avatar.Fallback>
              {assignee.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </Avatar.Fallback>
          </Avatar>
        ))}
        {task.assignees.length > 3 ? (
          <Avatar className="ring-background size-5 ring-2" size="sm">
            <Avatar.Fallback className="text-xs">+{task.assignees.length - 3}</Avatar.Fallback>
          </Avatar>
        ) : null}
      </div>
    </div>
  );
}
