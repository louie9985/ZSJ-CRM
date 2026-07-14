import {notFound} from "next/navigation";

import {CHAT_THREADS, getChatThread} from "../../../data/chat";
import {ChatPage} from "../../../views/chat-page";

export function generateStaticParams() {
  return CHAT_THREADS.map((thread) => ({chatId: thread.id}));
}

export default async function Page({params}: {params: Promise<{chatId: string}>}) {
  const {chatId} = await params;
  const thread = getChatThread(chatId);

  if (!thread) notFound();

  return <ChatPage thread={thread} />;
}
