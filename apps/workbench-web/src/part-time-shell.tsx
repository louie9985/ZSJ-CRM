import { Button, Result } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { PartTimePort } from "./workbench-port";
import { PartTimeLoginPage } from "./part-time-login-page";

export function PartTimeShell({ port }: { readonly port: PartTimePort }): React.JSX.Element {
  const query = useQuery({ queryKey: ["part-time-session"], queryFn: () => port.bootstrap(), retry: false });
  if (query.isPending) return <Result status="info" title="正在恢复兼职会话" />;
  if (query.isError || query.data.kind === "logged-out") return <PartTimeLoginPage port={port} onAuthenticated={() => { void query.refetch(); }} />;
  return <main className="direct-system-state"><Result status="info" title="客资录入" subTitle={`当前账号：${query.data.displayName}`} extra={<Button type="primary" onClick={() => { void port.logout().then(() => { void query.refetch(); }); }}>退出登录</Button>} /></main>;
}
