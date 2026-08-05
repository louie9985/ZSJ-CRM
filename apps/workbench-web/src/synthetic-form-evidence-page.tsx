import { PageContainer } from "@ant-design/pro-components";
import { Alert, App, Button, Card, Descriptions, Form, Input, Result, Typography } from "antd";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { notifyOperation } from "./operation-notification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DIGEST = /^[0-9a-f]{64}$/u;

export interface SyntheticFormFileReference {
  readonly contentVersionId: string;
  readonly displayName: string;
  readonly fileId: string;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
  readonly version: 1;
}

export interface SyntheticFormEvidenceRelease {
  readonly active: boolean;
  readonly contentDigest: string;
  readonly definitionId: string;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly releaseVersion: number;
  readonly uiSchema: Readonly<{
    fields: readonly Readonly<{ component: string; field: string; order: number }>[];
    layout: "grid" | "vertical";
    version: 1;
  }>;
}

export interface SyntheticFormEvidenceSubmission {
  readonly contentDigest: string;
  readonly data: Readonly<{
    content_version_id: string;
    file_id: string;
    synthetic_value: string;
  }>;
  readonly definitionId: string;
  readonly fileReference: SyntheticFormFileReference;
  readonly releaseVersion: number;
}

export interface SyntheticFormEvidenceReceipt {
  readonly fileReference: SyntheticFormFileReference;
  readonly operationId: string;
  readonly reference: Readonly<{
    readonly contentDigest: string;
    readonly definitionId: string;
    readonly releaseVersion: number;
    readonly version: 1;
  }>;
  readonly replayed: boolean;
  readonly submissionReference: string;
  readonly submittedAt: string;
  readonly traceId: string;
  readonly version: 1;
}

export interface SyntheticFormEvidencePort {
  submit(input: SyntheticFormEvidenceSubmission): Promise<SyntheticFormEvidenceReceipt>;
}

function sameFileReference(left: SyntheticFormFileReference, right: SyntheticFormFileReference): boolean {
  return left.fileId === right.fileId
    && left.contentVersionId === right.contentVersionId
    && left.displayName === right.displayName
    && left.mediaType === right.mediaType
    && left.sizeBytes === right.sizeBytes;
}

function hasEvidenceShape(release: SyntheticFormEvidenceRelease): boolean {
  const fields = [...release.uiSchema.fields].sort((left, right) => left.order - right.order);
  const names = fields.map((field) => field.field);
  const properties = release.jsonSchema["properties"];
  const required = release.jsonSchema["required"];
  const expectedFields = ["synthetic_value", "file_id", "content_version_id"];
  return release.active
    && release.definitionId === "crm.synthetic.task-completion"
    && Number.isSafeInteger(release.releaseVersion)
    && release.releaseVersion > 0
    && DIGEST.test(release.contentDigest)
    && typeof properties === "object"
    && properties !== null
    && !Array.isArray(properties)
    && Array.isArray(required)
    && names.length === expectedFields.length
    && expectedFields.every((field) => names.includes(field) && required.includes(field))
    && fields.every((field) => field.component === "input");
}

function hasStableFileReference(fileReference: SyntheticFormFileReference): boolean {
  return UUID.test(fileReference.fileId)
    && UUID.test(fileReference.contentVersionId)
    && fileReference.displayName.length > 0
    && fileReference.displayName.length <= 255
    && !/[\0\r\n]/u.test(fileReference.displayName)
    && (fileReference.mediaType === undefined || (fileReference.mediaType.length > 0 && fileReference.mediaType.length <= 255 && !/[\0\r\n]/u.test(fileReference.mediaType)))
    && (fileReference.sizeBytes === undefined || (Number.isSafeInteger(fileReference.sizeBytes) && fileReference.sizeBytes >= 0));
}

export function createSyntheticFormEvidenceSubmission(
  release: SyntheticFormEvidenceRelease,
  fileReference: SyntheticFormFileReference,
  syntheticValue: string,
): SyntheticFormEvidenceSubmission {
  if (!hasEvidenceShape(release)) throw new Error("synthetic_form_release_invalid");
  if (!hasStableFileReference(fileReference)) throw new Error("synthetic_form_file_reference_invalid");
  const value = syntheticValue.trim();
  if (value.length === 0 || value.length > 500) throw new Error("synthetic_form_value_invalid");
  return Object.freeze({
    contentDigest: release.contentDigest,
    data: Object.freeze({
      content_version_id: fileReference.contentVersionId,
      file_id: fileReference.fileId,
      synthetic_value: value,
    }),
    definitionId: release.definitionId,
    fileReference: Object.freeze({ ...fileReference }),
    releaseVersion: release.releaseVersion,
  });
}

export function assertSyntheticFormEvidenceReceipt(
  submission: SyntheticFormEvidenceSubmission,
  receipt: SyntheticFormEvidenceReceipt,
): void {
  const reference = receipt.reference;
  if (receipt.submissionReference.length === 0
    || receipt.submissionReference.length > 255
    || reference.definitionId !== submission.definitionId
    || reference.releaseVersion !== submission.releaseVersion
    || reference.contentDigest !== submission.contentDigest
    || !sameFileReference(receipt.fileReference, submission.fileReference)) {
    throw new Error("synthetic_form_receipt_invalid");
  }
}

export function SyntheticFormEvidencePage({
  fileReference,
  port,
  release,
}: {
  readonly fileReference: SyntheticFormFileReference;
  readonly port: SyntheticFormEvidencePort;
  readonly release: SyntheticFormEvidenceRelease;
}): React.JSX.Element {
  const { notification } = App.useApp();
  const [syntheticValue, setSyntheticValue] = useState("");
  const [state, setState] = useState<"failure" | "idle" | "pending" | "succeeded">("idle");
  const [submissionReference, setSubmissionReference] = useState<string>();
  const available = hasEvidenceShape(release) && hasStableFileReference(fileReference);
  const fields = [...release.uiSchema.fields].sort((left, right) => left.order - right.order);

  useEffect(() => {
    if (!available) notifyOperation(notification, "error", "表单不可用", "表单版本或文件引用未通过客户端结构检查。");
  }, [available, notification]);

  const submit = (): void => {
    if (state === "pending" || !available) return;
    let submission: SyntheticFormEvidenceSubmission;
    try {
      submission = createSyntheticFormEvidenceSubmission(release, fileReference, syntheticValue);
    } catch {
      setState("failure");
      notifyOperation(notification, "error", "提交未完成", "请检查必填内容和字段长度后重试。");
      return;
    }
    setState("pending");
    port.submit(submission).then(
      (receipt) => {
        try {
          assertSyntheticFormEvidenceReceipt(submission, receipt);
          setSubmissionReference(receipt.submissionReference);
          setState("succeeded");
          notifyOperation(notification, "success", "表单提交已接受", `提交编号：${receipt.submissionReference}`);
        } catch {
          setState("failure");
          notifyOperation(notification, "error", "提交未完成", "服务端证据回显不一致，本次操作不会被视为成功。");
        }
      },
      () => {
        setState("failure");
        notifyOperation(notification, "error", "提交未完成", "服务器未确认成功，本次操作不会被视为成功。");
      },
    );
  };

  return (
    <PageContainer title="合成表单验收" subTitle="平台 Walking Skeleton">
      <Alert
        className="fixture-alert"
        type="info"
        showIcon
        title="合成验收数据"
        description="此页面仅处理平台测试数据，不代表任何 CRM 业务事实。"
      />
      {!available && <Result status="error" title="表单不可用" subTitle="表单版本或文件引用未通过客户端结构检查。" />}
      <Card size="small" className="synthetic-form-evidence">
        <Form layout="vertical" onFinish={submit}>
          {fields.map((field) => {
            const label = field.field === "synthetic_value" ? "合成值" : field.field === "file_id" ? "File ID" : "Content Version ID";
            const value = field.field === "synthetic_value" ? syntheticValue : field.field === "file_id" ? fileReference.fileId : fileReference.contentVersionId;
            const editable = field.field === "synthetic_value";
            return (
              <Form.Item key={field.field} label={label} required={editable}>
                <Input
                  aria-label={label}
                  disabled={!available || state === "pending"}
                  name={field.field}
                  readOnly={!editable}
                  value={value}
                  {...(editable ? {
                    autoComplete: "off",
                    maxLength: 500,
                    onChange: (event: ChangeEvent<HTMLInputElement>) => { setSyntheticValue(event.target.value); if (state === "failure") setState("idle"); },
                  } : {})}
                />
              </Form.Item>
            );
          })}
          <Button type="primary" htmlType="submit" loading={state === "pending"} disabled={!available || state === "pending"}>提交</Button>
        </Form>
        <Descriptions className="stable-descriptions" size="small" column={1} bordered>
          <Descriptions.Item label="定义版本">{release.definitionId}@{release.releaseVersion}</Descriptions.Item>
          <Descriptions.Item label="文件名">{fileReference.displayName}</Descriptions.Item>
        </Descriptions>
        {state === "succeeded" && <Typography.Paragraph data-testid="submission-reference">提交编号：{submissionReference}</Typography.Paragraph>}
      </Card>
    </PageContainer>
  );
}
