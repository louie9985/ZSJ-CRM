import {redirect} from "next/navigation";

import {DEFAULT_CHAT_THREAD_ID} from "../../data/chat";

export default function Page() {
  redirect(`/${DEFAULT_CHAT_THREAD_ID}`);
}
