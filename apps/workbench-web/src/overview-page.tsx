import { RightOutlined } from "@ant-design/icons";
import { Avatar, Badge, Card, Empty, Flex, Select, Tag, Timeline, Typography } from "antd";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { BootstrapResult, PlatformCollection, PlatformItem } from "./workbench-port";
import { WorkspaceHome } from "./workspace-home";

const { Text } = Typography;
type ReadyBootstrap = Extract<BootstrapResult, { kind: "ready" }>;
type GroupMode = "flat" | "status";

interface OverviewProps {
  readonly collections: ReadyBootstrap["collections"];
  readonly data: ReadyBootstrap;
}

interface ItemGroup {
  readonly items: PlatformItem[];
  readonly key: string;
  readonly label: string;
}

const avatarColors = ["#eb2f96", "#fa8c16", "#52c41a", "#1677ff", "#722ed1"] as const;

function groupTasks(collection: PlatformCollection, mode: GroupMode): ItemGroup[] {
  const active = collection.items.filter((item) => item.tab === "active");
  if (mode === "flat") return active.length === 0 ? [] : [{ items: active, key: "all", label: "全部待办" }];
  return collection.statuses
    .map((status) => ({ items: active.filter((item) => item.status === status), key: status, label: status }))
    .filter((group) => group.items.length > 0);
}

export function Overview({ collections, data }: OverviewProps): React.JSX.Element {
  const hasNoAvailableFeature = data.navigationIds?.length === 0;
  const [groupMode, setGroupMode] = useState<GroupMode>("status");
  const taskGroups = useMemo(() => groupTasks(collections.tasks, groupMode), [collections.tasks, groupMode]);
  const activeTaskCount = collections.tasks.items.filter((item) => item.tab === "active").length;
  const recentNotifications = collections.notifications.items.filter((item) => item.tab === "active").slice(0, 5);

  return (
    <WorkspaceHome
      fixture={data.fixture}
      metrics={[
        { label: "待查看任务", path: "/crm/tasks", value: data.counts.tasks },
        { label: "未读通知", path: "/crm/notifications/all", value: data.counts.notifications },
        { label: "可用表单", path: "/crm/forms", value: data.counts.forms },
        { label: "可用文件引用", path: "/crm/files", value: data.counts.files },
      ]}
    >
      {hasNoAvailableFeature ? <Empty className="empty-workbench" description="暂无可用功能" /> : (
        <div className="workspace-columns">
          <Card
            className="work-panel todo-panel"
            size="small"
            title={
              <Flex align="center" justify="space-between" gap={12}>
                <span>今日待办（{activeTaskCount}）</span>
                <Select
                  aria-label="待办分组方式"
                  size="small"
                  value={groupMode}
                  options={[{ label: "按状态", value: "status" }, { label: "不分组", value: "flat" }]}
                  onChange={(value) => { setGroupMode(value); }}
                />
              </Flex>
            }
            styles={{ body: { padding: taskGroups.length === 0 ? 24 : "4px 0" } }}
          >
            {taskGroups.length === 0 ? <Empty description="今日无待办事项" /> : taskGroups.map((group) => (
              <section className="todo-group" key={group.key} aria-label={group.label}>
                <Flex className="todo-group-heading" align="center" gap={8}>
                  <Text strong>{group.label}</Text>
                  <Badge count={group.items.length} color="#1677ff" />
                </Flex>
                {group.items.map((item, index) => (
                  <Link className="todo-row" to={`/crm/tasks/${encodeURIComponent(item.id)}`} key={item.id}>
                    <Avatar style={{ backgroundColor: avatarColors[index % avatarColors.length] }}>{item.title.slice(0, 1)}</Avatar>
                    <span className="todo-copy">
                      <Text strong ellipsis title={item.title}>{item.title}</Text>
                      <Text type="secondary" ellipsis title={item.summary}>{item.summary}</Text>
                    </span>
                    <Tag className="todo-status">{item.status}</Tag>
                    <RightOutlined className="todo-chevron" />
                  </Link>
                ))}
              </section>
            ))}
          </Card>

          <Card className="work-panel activity-panel" size="small" title="今日动态">
            {recentNotifications.length === 0 ? <Empty description="今日暂无动态" /> : (
              <Timeline items={recentNotifications.map((item) => ({
                color: item.status === "未读" ? "blue" : "green",
                content: (
                  <Link className="activity-link" to={`/crm/notifications/${encodeURIComponent(item.id)}`}>
                    <Text strong ellipsis title={item.title}>{item.title}</Text>
                    <Text type="secondary">{item.summary}</Text>
                    <Tag>{item.status}</Tag>
                  </Link>
                ),
              }))} />
            )}
          </Card>
        </div>
      )}
    </WorkspaceHome>
  );
}
