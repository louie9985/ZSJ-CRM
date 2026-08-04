import { SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, InputNumber, Result, Space, Spin, Typography } from "antd";
import { useEffect } from "react";

import type { PcSessionPolicy, SessionPolicyPort } from "./session-policy-port";
import { notifyOperation } from "./operation-notification";

const QUERY_KEY = ["pc-session-policy"] as const;

export function SessionPolicyPage({ port }: { readonly port: SessionPolicyPort }): React.JSX.Element {
  const { notification } = App.useApp();
  const [form] = Form.useForm<PcSessionPolicy>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => port.get() });
  const mutation = useMutation({
    mutationFn: (value: PcSessionPolicy) => port.update(value),
    onSuccess: (value) => {
      queryClient.setQueryData(QUERY_KEY, value);
      form.setFieldsValue(value);
      notifyOperation(notification, "success", "更新成功", "登录安全策略已更新。");
    },
    onError: () => { notifyOperation(notification, "error", "策略更新未完成", "服务器未确认成功，请稍后重试。"); },
  });
  useEffect(() => {
    if (query.isError) notifyOperation(notification, "error", "无法读取登录安全策略", "策略服务暂不可用，请重试。");
  }, [notification, query.isError]);
  if (query.isPending) return <Spin />;
  if (query.isError) return <Result status="error" title="无法读取登录安全策略" extra={<Button onClick={() => { void query.refetch(); }}>重试</Button>} />;
  return (
    <section className="settings-section" aria-labelledby="session-policy-title">
      <Typography.Title id="session-policy-title" level={3}>登录安全策略</Typography.Title>
      <Form form={form} layout="vertical" initialValues={query.data} onFinish={(value) => { mutation.mutate(value); }} requiredMark={false}>
        <Form.Item name="concurrentLimit" label="电脑端同时在线设备数" rules={[{ required: true }]}>
          <InputNumber min={1} max={5} precision={0} />
        </Form.Item>
        <Form.Item name="revocationTargetSeconds" label="会话撤销目标时间（秒）" rules={[{ required: true }]}>
          <InputNumber min={5} max={60} precision={0} />
        </Form.Item>
        <Space><Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mutation.isPending}>保存</Button></Space>
      </Form>
    </section>
  );
}
