import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  assertSyntheticFormEvidenceReceipt,
  createSyntheticFormEvidenceSubmission,
  SyntheticFormEvidencePage,
  type SyntheticFormEvidenceReceipt,
  type SyntheticFormEvidenceRelease,
} from "./synthetic-form-evidence-page";

vi.mock("@ant-design/pro-components", () => ({
  PageContainer: ({ children, title }: { children?: ReactNode; title?: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}));

const fileReference = Object.freeze({
  contentVersionId: "93000000-0000-4000-8000-000000000002",
  displayName: "synthetic-clean.txt",
  fileId: "93000000-0000-4000-8000-000000000001",
  mediaType: "text/plain",
  sizeBytes: 24,
  version: 1 as const,
});

const release: SyntheticFormEvidenceRelease = Object.freeze({
  active: true,
  contentDigest: "a".repeat(64),
  definitionId: "platform.synthetic.task-completion",
  jsonSchema: Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: Object.freeze({ content_version_id: { type: "string" }, file_id: { type: "string" }, synthetic_value: { type: "string" } }),
    required: Object.freeze(["content_version_id", "file_id", "synthetic_value"]),
    type: "object",
  }),
  releaseVersion: 1,
  uiSchema: Object.freeze({
    fields: Object.freeze([
      { component: "input", field: "synthetic_value", order: 1 },
      { component: "input", field: "file_id", order: 2 },
      { component: "input", field: "content_version_id", order: 3 },
    ]),
    layout: "vertical",
    version: 1,
  }),
});

function receipt(overrides: Partial<SyntheticFormEvidenceReceipt> = {}): SyntheticFormEvidenceReceipt {
  return {
    fileReference,
    operationId: "93000000-0000-4000-8000-000000000003",
    reference: { contentDigest: release.contentDigest, definitionId: release.definitionId, releaseVersion: release.releaseVersion, version: 1 },
    replayed: false,
    submissionReference: "submission.browser-synthetic-0001",
    submittedAt: "2026-08-02T00:00:00.000Z",
    traceId: "76000000000000000000000000000001",
    version: 1,
    ...overrides,
  };
}

describe("SyntheticFormEvidencePage", () => {
  it("submits browser input with the complete stable FileReference and accepts matching server evidence", async () => {
    const submit = vi.fn().mockResolvedValue(receipt());
    render(<SyntheticFormEvidencePage release={release} fileReference={fileReference} port={{ submit }} />);

    expect(screen.getByRole("textbox", { name: "File ID" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Content Version ID" })).toHaveAttribute("readonly");
    fireEvent.change(screen.getByRole("textbox", { name: "合成值" }), { target: { value: " synthetic_value " } });
    fireEvent.click(screen.getByRole("button", { name: /提\s*交/u }));

    await waitFor(() => { expect(submit).toHaveBeenCalledTimes(1); });
    expect(submit).toHaveBeenCalledWith({
      contentDigest: release.contentDigest,
      data: { content_version_id: fileReference.contentVersionId, file_id: fileReference.fileId, synthetic_value: "synthetic_value" },
      definitionId: release.definitionId,
      fileReference,
      releaseVersion: 1,
    });
    expect(await screen.findByText("表单提交已接受")).toBeInTheDocument();
    expect(screen.getByTestId("submission-reference")).toHaveTextContent("submission.browser-synthetic-0001");
  });

  it("fails closed when the server receipt changes the stable FileReference", async () => {
    const changed = { ...fileReference, contentVersionId: "94000000-0000-4000-8000-000000000002" };
    render(<SyntheticFormEvidencePage release={release} fileReference={fileReference} port={{ submit: () => Promise.resolve(receipt({ fileReference: changed })) }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "合成值" }), { target: { value: "synthetic_value" } });
    fireEvent.click(screen.getByRole("button", { name: /提\s*交/u }));
    expect(await screen.findByText("提交未完成")).toBeInTheDocument();
    expect(screen.queryByText("表单提交已接受")).not.toBeInTheDocument();
  });

  it("rejects an inactive release before invoking the submission port", () => {
    const submit = vi.fn();
    render(<SyntheticFormEvidencePage release={{ ...release, active: false }} fileReference={fileReference} port={{ submit }} />);
    expect(screen.getByText("表单不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /提\s*交/u })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects mismatched release evidence and malformed browser input", () => {
    const submission = createSyntheticFormEvidenceSubmission(release, fileReference, "synthetic_value");
    expect(() => { assertSyntheticFormEvidenceReceipt(submission, receipt({ reference: { contentDigest: "b".repeat(64), definitionId: release.definitionId, releaseVersion: 1, version: 1 } })); }).toThrow("synthetic_form_receipt_invalid");
    expect(() => createSyntheticFormEvidenceSubmission(release, fileReference, " ")).toThrow("synthetic_form_value_invalid");
  });
});
