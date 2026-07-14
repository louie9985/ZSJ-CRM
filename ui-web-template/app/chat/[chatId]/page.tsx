import {CHAT_THREADS, getChatThread} from "@chat/data/chat";
import {ChatPage} from "@chat/views/chat-page";
import {notFound} from "next/navigation";

export function generateStaticParams() {
  return CHAT_THREADS.map((thread) => ({chatId: thread.id}));
}

export default async function Page({params}: {params: Promise<{chatId: string}>}) {
  const {chatId} = await params;
  const thread = getChatThread(chatId);

  if (!thread) notFound();

  return <ChatPage thread={thread} />;
}
