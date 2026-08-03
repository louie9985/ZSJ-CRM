import { PageContainer } from "@ant-design/pro-components";
import { Empty } from "antd";

interface FeaturePlaceholderPageProps {
  readonly title: string;
}

export function FeaturePlaceholderPage({ title }: FeaturePlaceholderPageProps): React.JSX.Element {
  return (
    <PageContainer title={title} subTitle="前端占位">
      <section className="feature-placeholder" aria-label={`${title}占位界面`}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="功能暂未开放" />
      </section>
    </PageContainer>
  );
}
