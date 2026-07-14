"use client";

import {Eye, Pencil, TrashBin} from "@gravity-ui/icons";

import {IconButton} from "../components/icon-button";

export interface RowActionsProps {
  employeeId: string;
}

export function RowActions({employeeId}: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-0.5" data-employee-id={employeeId}>
      <IconButton label="查看" size="sm" variant="tertiary">
        <Eye className="size-4" />
      </IconButton>
      <IconButton label="编辑" size="sm" variant="tertiary">
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label="删除" size="sm" variant="danger-soft">
        <TrashBin className="size-4" />
      </IconButton>
    </div>
  );
}
