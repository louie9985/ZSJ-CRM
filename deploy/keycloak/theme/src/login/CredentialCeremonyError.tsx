import { Alert } from "antd";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import { AuthShell } from "./AuthShell";

export default function CredentialCeremonyError(
    props: PageProps<Extract<KcContext, { pageId: "credential-ceremony-error.ftl" }>, I18n>
) {
    const { msgStr } = props.i18n;

    return (
        <AuthShell title={msgStr("credentialCeremonyUnavailableTitle")}>
            <Alert
                type="error"
                showIcon
                message={msgStr("credentialCeremonyUnavailableDescription")}
            />
        </AuthShell>
    );
}
