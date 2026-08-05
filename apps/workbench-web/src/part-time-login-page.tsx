import { Alert, Button, Form, Input, Typography } from "antd";
import { useRef, useState } from "react";
import type { PartTimePort } from "./workbench-port";

export function PartTimeLoginPage({ onAuthenticated, port }: { readonly onAuthenticated: () => void; readonly port: PartTimePort }): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const submit = (value: { identifier: string; password: string }): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    port.login(value.identifier.trim(), value.password).then((result) => {
      inFlight.current = false;
      setPending(false);
      if (result === "authenticated") onAuthenticated();
      else setError(result === "rate-limited" ? "尝试次数过多，请稍后再试。" : result === "unavailable" ? "登录服务暂时不可用。" : "账号或密码不正确。");
    }, () => { inFlight.current = false; setPending(false); setError("登录服务暂时不可用。"); });
  };
  return <main className="login-page"><section className="login-panel" aria-labelledby="part-time-login-title"><Typography.Title id="part-time-login-title" level={2}>CRM 客资录入</Typography.Title>{error === undefined ? null : <Alert type="error" showIcon title={error} />}<Form layout="vertical" onFinish={submit} requiredMark={false}><Form.Item label="兼职账号" name="identifier" rules={[{ required: true, message: "请输入兼职账号" }]}><Input autoComplete="username" maxLength={64} autoFocus /></Form.Item><Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}><Input.Password autoComplete="current-password" maxLength={64} /></Form.Item><Button block htmlType="submit" loading={pending} type="primary">登录</Button></Form></section></main>;
}
