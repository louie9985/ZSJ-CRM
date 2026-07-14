import type {ReactNode} from "react";

import {notFound} from "next/navigation";

import {FolderLayout} from "../../../components/folder-layout";
import {getFolder, getThreadsForFolder} from "../../../data/email";

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

  const threads = getThreadsForFolder(folderId);

  return (
    <FolderLayout basePath="" folderId={folder.id} threads={threads}>
      {children}
    </FolderLayout>
  );
}
