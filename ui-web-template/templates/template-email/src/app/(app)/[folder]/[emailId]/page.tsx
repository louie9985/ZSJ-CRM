import {notFound} from "next/navigation";

import {EmailDetail} from "../../../../components/email-detail";
import {THREADS, getThread} from "../../../../data/email";

export function generateStaticParams() {
  return THREADS.map((thread) => ({emailId: thread.id, folder: thread.folderId}));
}

export default async function Page({params}: {params: Promise<{emailId: string; folder: string}>}) {
  const {emailId, folder} = await params;
  const thread = getThread(emailId);

  if (!thread) notFound();

  return <EmailDetail backHref={`/${folder}`} thread={thread} />;
}
