import {EmailDetail} from "@email/components/email-detail";
import {THREADS, getThread} from "@email/data/email";
import {notFound} from "next/navigation";

export function generateStaticParams() {
  return THREADS.map((thread) => ({emailId: thread.id, folder: thread.folderId}));
}

export default async function Page({params}: {params: Promise<{emailId: string; folder: string}>}) {
  const {emailId, folder} = await params;
  const thread = getThread(emailId);

  if (!thread) notFound();

  return <EmailDetail backHref={`/email/${folder}`} thread={thread} />;
}
