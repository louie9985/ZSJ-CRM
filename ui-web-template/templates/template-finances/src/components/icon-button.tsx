"use client";

import type {ComponentPropsWithRef, ReactNode} from "react";

import {Button, Tooltip} from "@heroui/react";

type ButtonProps = ComponentPropsWithRef<typeof Button>;

export interface IconButtonProps extends Omit<ButtonProps, "children" | "isIconOnly"> {
  /** Accessible label AND default tooltip text. */
  label: string;
  /** Override the tooltip content if it should differ from the aria-label. */
  tooltip?: ReactNode;
  children: ReactNode;
}

/**
 * Accessibility-first wrapper around HeroUI's icon-only Button.
 * Ensures every icon-only trigger carries an aria-label and a tooltip.
 */
export function IconButton({children, label, tooltip, ...buttonProps}: IconButtonProps) {
  return (
    <Tooltip>
      <Button isIconOnly aria-label={label} {...buttonProps}>
        {children}
      </Button>
      <Tooltip.Content>{tooltip ?? label}</Tooltip.Content>
    </Tooltip>
  );
}
