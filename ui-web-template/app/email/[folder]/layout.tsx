import type {ReactNode} from "react";

import {FolderLayout} from "@email/components/folder-layout";
import {getFolder, getThreadsForFolder} from "@email/data/email";
import {notFound} from "next/navigation";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{folder: string}>;
}) {
  const {folder: folderId} = await params;
  const folder = getFolder(folderId);

  if (!folder) notFound();

  return (
    <FolderLayout basePath="/email" folderId={folder.id} threads={getThreadsForFolder(folderId)}>
      {children}
    </FolderLayout>
  );
}
