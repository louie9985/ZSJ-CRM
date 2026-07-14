import {DEFAULT_FOLDER_ID} from "@email/data/email";
import {redirect} from "next/navigation";

export default function Page() {
  redirect(`/email/${DEFAULT_FOLDER_ID}`);
}
