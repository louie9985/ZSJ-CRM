import { Button, Form, Input, Typography } from "antd";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import { AuthShell } from "./AuthShell";
import { AuthNotification } from "./AuthNotification";

export default function CredentialCeremony(
    props: PageProps<Extract<KcContext, { pageId: "credential-ceremony.ftl" }>, I18n>
) {
    const { kcContext, i18n } = props;
    const { msgStr } = i18n;

    return (
        <AuthShell title={msgStr("credentialCeremonyTitle")}>
            <Typography.Paragraph type="secondary" className="auth-description">
                {msgStr("credentialCeremonyDescription")}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" className="auth-description">
                {msgStr("passwordPolicyDescription")}
            </Typography.Paragraph>
            {kcContext.credentialCeremonyHasError ? (
                <AuthNotification notificationKey="credential-ceremony-error" title={msgStr("credentialCeremonyInvalidPassword")} description={msgStr("passwordPolicyDescription")} />
            ) : null}
            <form action={kcContext.url.loginAction} method="post">
                <Form component={false} layout="vertical">
                    <Form.Item label={msgStr("passwordNew")} required>
                        <Input.Password
                            name="password"
                            autoComplete="new-password"
                            autoFocus
                            minLength={8}
                            maxLength={64}
                            pattern="[\x20-\x7E]{8,64}"
                            required
                            size="large"
                            title={msgStr("passwordPolicyDescription")}
                        />
                    </Form.Item>
                    <Form.Item label={msgStr("passwordConfirm")} required>
                        <Input.Password
                            name="passwordConfirm"
                            autoComplete="new-password"
                            minLength={8}
                            maxLength={64}
                            pattern="[\x20-\x7E]{8,64}"
                            required
                            size="large"
                            title={msgStr("passwordPolicyDescription")}
                        />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" size="large" block>
                        {msgStr("doSubmit")}
                    </Button>
                </Form>
            </form>
        </AuthShell>
    );
}
