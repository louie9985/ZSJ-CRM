import {EmptyState} from "@email/components/empty-state";
import {getFolder} from "@email/data/email";
import {notFound} from "next/navigation";

export default async function Page({params}: {params: Promise<{folder: string}>}) {
  const {folder: folderId} = await params;
  const folder = getFolder(folderId);

  if (!folder) notFound();

  return <EmptyState folder={folder} />;
}
