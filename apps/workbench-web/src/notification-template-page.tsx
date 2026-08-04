import { DiffOutlined, HistoryOutlined, SaveOutlined, SendOutlined } from "@ant-design/icons";
import { PageContainer } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Descriptions, Empty, Flex, Input, List, Modal, Result, Select, Space, Spin, Tabs, Tag, Tooltip, Typography } from "antd";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";

import type { NotificationTemplateAdministration, NotificationTemplatePort, TemplateContent, TemplatePreview } from "./notification-template-port";
import { notifyOperation } from "./operation-notification";

const RestrictedMarkdown = lazy(async () => ({ default: (await import("./restricted-markdown")).RestrictedMarkdown }));
const emptyContent: TemplateContent = { bodyTemplate: "", summaryTemplate: "", titleTemplate: "" };

function sourceContent(template: NotificationTemplateAdministration): TemplateContent {
  const source = template.draft ?? template.releases[0];
  return source === undefined ? emptyContent : { titleTemplate: source.titleTemplate, summaryTemplate: source.summaryTemplate ?? source.bodyTemplate, bodyTemplate: source.bodyTemplate };
}

function Preview({ preview, mode }: { readonly mode: "detail" | "list" | "toast"; readonly preview: TemplatePreview | undefined }): React.JSX.Element {
  if (preview === undefined) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="编辑内容后生成预览" />;
  if (mode === "toast") return <div className="template-toast-preview"><Typography.Text strong>{preview.title}</Typography.Text><Typography.Paragraph ellipsis={{ rows: 2 }}>{preview.summary}</Typography.Paragraph></div>;
  if (mode === "list") return <List size="small" bordered dataSource={[preview]} renderItem={(item) => <List.Item><List.Item.Meta title={item.title} description={item.summary} /></List.Item>} />;
  return <div className="template-detail-preview"><Typography.Title level={5}>{preview.title}</Typography.Title><Typography.Paragraph type="secondary">{preview.summary}</Typography.Paragraph><Suspense fallback={<Spin size="small" />}><RestrictedMarkdown>{preview.body}</RestrictedMarkdown></Suspense></div>;
}

export function NotificationTemplatePage({ port }: { readonly port: NotificationTemplatePort }): React.JSX.Element {
  const { modal, notification } = App.useApp();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["notification-templates"], queryFn: () => port.list() });
  const [selectedKey, setSelectedKey] = useState<string>();
  useEffect(() => { if (selectedKey === undefined && list.data?.[0]) setSelectedKey(list.data[0].definition.templateKey); }, [list.data, selectedKey]);
  const detail = useQuery({ enabled: selectedKey !== undefined, queryKey: ["notification-template", selectedKey], queryFn: () => port.get(selectedKey ?? "") });
  const [content, setContent] = useState<TemplateContent>(emptyContent);
  const [activeField, setActiveField] = useState<keyof TemplateContent>("bodyTemplate");
  const fields = { titleTemplate: useRef<TextAreaRef>(null), summaryTemplate: useRef<TextAreaRef>(null), bodyTemplate: useRef<TextAreaRef>(null) };
  useEffect(() => { if (detail.data) setContent(sourceContent(detail.data)); }, [detail.data]);
  const preview = useQuery({ enabled: selectedKey !== undefined && content.titleTemplate.length > 0 && content.summaryTemplate.length > 0 && content.bodyTemplate.length > 0, queryKey: ["notification-template-preview", selectedKey, content], queryFn: () => port.preview(selectedKey ?? "", content), staleTime: 0 });
  const invalidate = async (): Promise<void> => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["notification-templates"] }), queryClient.invalidateQueries({ queryKey: ["notification-template", selectedKey] })]); };
  const save = useMutation({ mutationFn: async () => { if (!detail.data || !selectedKey) return; await port.save(selectedKey, detail.data.draft?.revision ?? 0, content); }, onSuccess: async () => { await invalidate(); notifyOperation(notification, "success", "保存成功", "通知模板草稿已保存。"); }, onError: () => { notifyOperation(notification, "error", "保存未完成", "通知模板草稿未保存，请重试。"); } });
  const publish = useMutation({ mutationFn: async () => { if (!selectedKey) return; await port.publish(selectedKey); }, onSuccess: async () => { await invalidate(); notifyOperation(notification, "success", "发布成功", "新版本已发布并启用。"); }, onError: () => { notifyOperation(notification, "error", "发布未完成", "新版本未发布，请检查内容后重试。"); } });
  const activate = useMutation({ mutationFn: async (version: number) => { if (selectedKey) await port.activate(selectedKey, version); }, onSuccess: async () => { await invalidate(); notifyOperation(notification, "success", "启用成功", "历史版本已重新启用。"); }, onError: () => { notifyOperation(notification, "error", "启用未完成", "历史版本未能启用，请重试。"); } });
  const usedVariables = useMemo(() => {
    const sources: readonly string[] = [content.titleTemplate, content.summaryTemplate, content.bodyTemplate];
    return [...new Set(sources.flatMap((source) => Array.from(source.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/gu), (match) => match[1]).filter((value): value is string => value !== undefined)))];
  }, [content]);
  const insertVariable = (key: string): void => {
    const element = fields[activeField].current?.resizableTextArea?.textArea;
    const value = content[activeField];
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? start;
    const next = `${value.slice(0, start)}{{${key}}}${value.slice(end)}`;
    setContent((current) => ({ ...current, [activeField]: next }));
  };

  useEffect(() => {
    if (list.isError) notifyOperation(notification, "error", "无法读取通知模板", "当前账号无权访问，或模板服务暂不可用。");
  }, [list.isError, notification]);
  useEffect(() => {
    if (detail.isError) notifyOperation(notification, "error", "无法读取模板详情", "模板详情服务暂不可用，请重试。");
  }, [detail.isError, notification]);
  useEffect(() => {
    if (preview.isError) notifyOperation(notification, "error", "模板校验未通过", "请检查未知变量、Mustache 语法、字段长度或 Markdown 白名单。");
  }, [notification, preview.isError]);

  if (list.isPending) return <Flex align="center" justify="center"><Spin /></Flex>;
  if (list.isError) return <Result status="error" title="无法读取通知模板" subTitle="当前账号无权访问，或模板服务暂不可用。" />;
  if (list.data.length === 0) return <PageContainer title="通知模板"><Empty description="尚无拥有模块注册的模板定义" /></PageContainer>;
  const template = detail.data;
  return (
    <PageContainer title="通知模板" subTitle="版本化通知中心内容">
      <Flex gap={16} className="template-workspace">
        <aside className="template-selector" aria-label="已注册通知模板">
          <Select value={selectedKey} onChange={setSelectedKey} options={list.data.map((item) => ({ value: item.definition.templateKey, label: item.definition.templateKey }))} />
          {template && <Descriptions size="small" column={1} items={[{ key: "owner", label: "Owner", children: template.definition.ownerModule }, { key: "type", label: "通知类型", children: template.definition.notificationType }, { key: "version", label: "当前版本", children: template.currentVersion ?? "未发布" }]} />}
        </aside>
        <main className="template-editor">
          {detail.isError ? <Result status="error" title="无法读取模板详情" extra={<Button onClick={() => { void detail.refetch(); }}>重试</Button>} /> : detail.isPending || !template ? <Spin /> : <>
            <Alert type="info" showIcon title="发布仅影响未来通知" description="历史通知继续使用生成时保存的模板版本与渲染快照。" />
            <label>标题<Input.TextArea ref={fields.titleTemplate} value={content.titleTemplate} maxLength={512} autoSize={{ minRows: 2, maxRows: 4 }} onFocus={() => { setActiveField("titleTemplate"); }} onChange={(event) => { setContent((current) => ({ ...current, titleTemplate: event.target.value })); }} /></label>
            <label>摘要<Input.TextArea ref={fields.summaryTemplate} value={content.summaryTemplate} maxLength={2_000} autoSize={{ minRows: 3, maxRows: 6 }} onFocus={() => { setActiveField("summaryTemplate"); }} onChange={(event) => { setContent((current) => ({ ...current, summaryTemplate: event.target.value })); }} /></label>
            <label>正文（受限 Markdown）<Input.TextArea ref={fields.bodyTemplate} value={content.bodyTemplate} maxLength={8_000} autoSize={{ minRows: 9, maxRows: 18 }} onFocus={() => { setActiveField("bodyTemplate"); }} onChange={(event) => { setContent((current) => ({ ...current, bodyTemplate: event.target.value })); }} /></label>
            <section aria-label="可用变量"><Typography.Text strong>可用变量</Typography.Text><Flex wrap gap={8}>{template.definition.allowedVariables.map((variable) => <Tooltip key={variable.key} title={`${variable.description} · 来源 ${variable.source} · 示例 ${String(variable.example)}`}><Button size="small" onClick={() => { insertVariable(variable.key); }}>{variable.label} <code>{`{{${variable.key}}}`}</code></Button></Tooltip>)}</Flex></section>
            <Typography.Text type="secondary">本稿变量：{usedVariables.length === 0 ? "无" : usedVariables.map((key) => <Tag key={key}>{key}</Tag>)}</Typography.Text>
            <Tabs items={[{ key: "toast", label: "桌面 Toast", children: <Preview mode="toast" preview={preview.data} /> }, { key: "list", label: "通知列表", children: <Preview mode="list" preview={preview.data} /> }, { key: "detail", label: "通知详情", children: <Preview mode="detail" preview={preview.data} /> }]} />
            <Flex justify="space-between" wrap gap={12}>
              <Space><Button icon={<SaveOutlined />} loading={save.isPending} onClick={() => { save.mutate(); }}>保存草稿</Button><Button type="primary" icon={<SendOutlined />} loading={publish.isPending} onClick={() => { modal.confirm({ title: "发布并启用新版本", content: <><p>本次发布仅影响未来通知。</p><p>变量：{usedVariables.join("、") || "无"}</p></>, okText: "发布并启用", onOk: async () => { await publish.mutateAsync(); } }); }}>发布并启用</Button></Space>
              <Button icon={<HistoryOutlined />} onClick={() => { Modal.info({ width: 720, title: "发布历史", content: <List dataSource={[...template.releases]} renderItem={(release) => <List.Item actions={[release.version === template.currentVersion ? <Tag key="active" color="green">当前启用</Tag> : <Button key="activate" icon={<DiffOutlined />} onClick={() => { activate.mutate(release.version); }}>重新启用</Button>]}><List.Item.Meta title={`版本 ${String(release.version)}`} description={`${new Date(release.publishedAt).toLocaleString("zh-CN")} · ${release.contentDigest.slice(0, 12)}`} /></List.Item>} /> }); }}>历史版本</Button>
            </Flex>
          </>}
        </main>
      </Flex>
    </PageContainer>
  );
}
