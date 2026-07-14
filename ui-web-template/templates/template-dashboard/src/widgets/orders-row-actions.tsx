"use client";

import {Eye, Pencil, TrashBin} from "@gravity-ui/icons";

import {IconButton} from "../components/icon-button";

export interface OrdersRowActionsProps {
  orderId: string;
}

export function OrdersRowActions({orderId}: OrdersRowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-0.5" data-order-id={orderId}>
      <IconButton label="View order" size="sm" variant="tertiary">
        <Eye className="size-4" />
      </IconButton>
      <IconButton label="Edit order" size="sm" variant="tertiary">
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label="Delete order" size="sm" variant="danger-soft">
        <TrashBin className="size-4" />
      </IconButton>
    </div>
  );
}
