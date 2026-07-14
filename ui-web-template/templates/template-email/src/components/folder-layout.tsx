"use client";

import type {EmailThread} from "../data/email";
import type {ReactNode} from "react";

import {usePathname} from "next/navigation";

import {getFolder} from "../data/email";

import {EmailList} from "./email-list";

export interface FolderLayoutProps {
  /**
   * Folder id rather than the full folder object — folders carry a React
   * icon component and cannot be serialized across the server → client
   * boundary. The client resolves the full folder via `getFolder`.
   */
  folderId: string;
  threads: readonly EmailThread[];
  basePath: string;
  disableNavigation?: boolean;
  children: ReactNode;
}

/**
 * Responsive list + detail layout used by the folder routes.
 *
 * - `md+`: side-by-side grid (≈360px list + flex detail).
 * - `<md`: single column — list OR detail based on whether the URL is on a
 *   specific email or just the folder.
 */
export function FolderLayout({
  basePath,
  children,
  disableNavigation,
  folderId,
  threads,
}: FolderLayoutProps) {
  const pathname = usePathname();
  const folder = getFolder(folderId);

  if (!folder) return null;

  const currentThreadId = getThreadIdFromPath(pathname, basePath, folder.id);
  const hasSelection = Boolean(currentThreadId);

  return (
    <div className="flex h-svh flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(320px,360px)_1fr]">
      <div
        className={`min-h-0 overflow-hidden ${
          hasSelection ? "hidden lg:flex lg:flex-col" : "flex flex-1 flex-col"
        }`}
      >
        <EmailList
          basePath={basePath}
          currentThreadId={currentThreadId}
          disableNavigation={disableNavigation}
          folder={folder}
          threads={threads}
        />
      </div>
      <div
        className={`min-h-0 overflow-hidden ${
          hasSelection ? "flex flex-1 flex-col" : "hidden lg:flex lg:flex-col"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function getThreadIdFromPath(
  pathname: string | null,
  basePath: string,
  folderId: string,
): string | undefined {
  if (!pathname) return undefined;

  const trimmedBase = basePath.replace(/\/$/, "");
  const raw = pathname.startsWith(trimmedBase) ? pathname.slice(trimmedBase.length) : pathname;
  const segments = raw.replace(/^\//, "").split("/").filter(Boolean);
  const [folderSegment, emailSegment] = segments;

  if (folderSegment !== folderId) return undefined;

  return emailSegment || undefined;
}
