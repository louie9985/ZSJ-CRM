import {DEFAULT_CHAT_THREAD_ID} from "@chat/data/chat";
import {redirect} from "next/navigation";

export default function Page() {
  redirect(`/chat/${DEFAULT_CHAT_THREAD_ID}`);
}
