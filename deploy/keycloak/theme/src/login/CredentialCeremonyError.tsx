import { Typography } from "antd";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import { AuthShell } from "./AuthShell";
import { AuthNotification } from "./AuthNotification";

export default function CredentialCeremonyError(
    props: PageProps<Extract<KcContext, { pageId: "credential-ceremony-error.ftl" }>, I18n>
) {
    const { msgStr } = props.i18n;

    return (
        <AuthShell title={msgStr("credentialCeremonyUnavailableTitle")}>
            <AuthNotification notificationKey="credential-ceremony-unavailable" title={msgStr("credentialCeremonyUnavailableTitle")} description={msgStr("credentialCeremonyUnavailableDescription")} />
            <Typography.Paragraph type="secondary">{msgStr("credentialCeremonyUnavailableDescription")}</Typography.Paragraph>
        </AuthShell>
    );
}
