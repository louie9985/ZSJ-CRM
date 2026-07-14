import {redirect} from "next/navigation";

import {DEFAULT_FOLDER_ID} from "../../data/email";

export default function Page() {
  redirect(`/${DEFAULT_FOLDER_ID}`);
}
