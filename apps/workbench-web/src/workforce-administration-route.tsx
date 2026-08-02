import { Flex, Spin } from "antd";
import { lazy, Suspense } from "react";
import type { WorkforceAdministrationPort } from "./workbench-port";

const WorkforceAdministrationPage = lazy(async () => ({
  default: (await import("./workforce-administration-page")).WorkforceAdministrationPage,
}));

export function WorkforceAdministrationRoute({ port }: { port: WorkforceAdministrationPort }): React.JSX.Element {
  return (
    <Suspense fallback={<Flex className="route-loading" align="center" justify="center"><Spin description="正在加载员工账号管理" /></Flex>}>
      <WorkforceAdministrationPage port={port} />
    </Suspense>
  );
}
