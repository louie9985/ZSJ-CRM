import { Alert, Button, Form, Input } from "antd";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import { AuthShell } from "./AuthShell";

export default function UpdatePassword(
    props: PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>
) {
    const { kcContext, i18n } = props;
    const { msgStr } = i18n;

    return (
        <AuthShell title={msgStr("updatePasswordTitle")}>
            {kcContext.message && kcContext.message.type !== "success" ? (
                <Alert className="auth-alert" type="error" showIcon message={kcContext.message.summary} />
            ) : null}
            <form action={kcContext.url.loginAction} method="post">
                <Form component={false} layout="vertical">
                    <Form.Item label={msgStr("passwordNew")} required>
                        <Input.Password name="password-new" autoComplete="new-password" autoFocus size="large" />
                    </Form.Item>
                    <Form.Item label={msgStr("passwordConfirm")} required>
                        <Input.Password name="password-confirm" autoComplete="new-password" size="large" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" size="large" block>
                        {msgStr("doSubmit")}
                    </Button>
                </Form>
            </form>
        </AuthShell>
    );
}
