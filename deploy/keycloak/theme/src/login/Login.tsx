import { Alert, Button, Form, Input } from "antd";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import { AuthShell } from "./AuthShell";

export default function Login(props: PageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>) {
    const { kcContext, i18n } = props;
    const { msgStr } = i18n;
    const attemptedUsername = kcContext.auth.attemptedUsername ?? "";

    return (
        <AuthShell title="登录">
            {kcContext.message && kcContext.message.type !== "success" ? (
                <Alert
                    className="auth-alert"
                    type="error"
                    showIcon
                    message="用户名/手机号或密码错误，请重新输入"
                />
            ) : null}
            <form action={kcContext.url.loginAction} method="post">
                <Form component={false} layout="vertical">
                    <Form.Item label={msgStr("username")} required>
                        <Input
                            id="username"
                            name="username"
                            defaultValue={attemptedUsername}
                            autoComplete="username"
                            autoFocus
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item label={msgStr("password")} required>
                        <Input.Password id="password" name="password" autoComplete="current-password" size="large" />
                    </Form.Item>
                    <Button id="kc-login" type="primary" htmlType="submit" size="large" block>
                        {msgStr("doLogIn")}
                    </Button>
                </Form>
            </form>
        </AuthShell>
    );
}
