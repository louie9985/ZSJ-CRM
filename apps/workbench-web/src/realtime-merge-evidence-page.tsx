import { App, Button, Input, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { notifyOperation } from "./operation-notification";
import { useRealtimeDraftMerge } from "./realtime-draft-merge";

export function RealtimeMergeEvidencePage(): React.JSX.Element {
  const [revision, setRevision] = useState(1);
  const merge = useRealtimeDraftMerge({ serverLabel: "服务端版本 1", userInput: "" }, 1);
  const updateServer = (): void => { const next = revision + 1; setRevision(next); merge.receive({ serverLabel: `服务端版本 ${String(next)}`, userInput: `服务端内容 ${String(next)}` }, next); };
  const { notification } = App.useApp();
  useEffect(() => {
    if (merge.state.conflicts.length > 0) notifyOperation(notification, "warning", "检测到同字段冲突", "提交已禁止，请确认最新服务端基准后再执行正式命令。");
  }, [merge.state.conflicts.length, notification]);
  return <main className="template-editor"><Typography.Title level={3}>实时草稿合成验收</Typography.Title><Typography.Paragraph>{merge.value.serverLabel}</Typography.Paragraph><Input.TextArea value={merge.value.userInput} onChange={(event) => { merge.edit("userInput", event.target.value); }} /><Space><Button onClick={updateServer}>模拟服务端更新</Button>{merge.state.conflicts.length > 0 && <Button onClick={merge.acceptLatest}>确认最新基准</Button>}<Button type="primary" disabled={!merge.canSubmit}>提交正式命令</Button></Space></main>;
}
