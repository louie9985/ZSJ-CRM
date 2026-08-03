import { Card, Flex, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const { Text, Title } = Typography;

export interface WorkspaceMetric {
  readonly label: string;
  readonly path: string;
  readonly tone?: "danger" | "default" | "warning";
  readonly value: number;
}

interface WorkspaceHomeProps {
  readonly children: ReactNode;
  readonly fixture: boolean;
  readonly metrics: readonly WorkspaceMetric[];
  readonly title?: string;
}

export function WorkspaceHome({ children, fixture, metrics, title = "工作台首页" }: WorkspaceHomeProps): React.JSX.Element {
  return (
    <div className="workspace-home" data-testid="workspace-home">
      <Flex className="workspace-home-heading" align="center" justify="space-between" gap={16}>
        <Flex align="center" gap={8}>
          <Title level={4}>{title}</Title>
          {fixture && <Tag color="blue">开发 Fixture</Tag>}
        </Flex>
      </Flex>
      <div className="metric-strip" aria-label="工作指标">
        {metrics.map((metric) => (
          <Link className="metric-link" to={metric.path} key={metric.label}>
            <Card size="small" className="metric-card" styles={{ body: { padding: "10px 8px" } }}>
              <strong className={`metric-value metric-value-${metric.tone ?? "default"}`}>{metric.value}</strong>
              <Text type="secondary">{metric.label}</Text>
            </Card>
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
