import { useQuery } from "@tanstack/react-query";

import type { BootstrapResult, WorkbenchPort } from "./workbench-port";

type ReadyCollections = Extract<BootstrapResult, { kind: "ready" }>["collections"];

export const collectionPollingIntervalMs = 5_000;

export function usePolledCollections(port: WorkbenchPort, initial: ReadyCollections, sessionScope: string): ReadyCollections {
  const polling = useQuery({
    enabled: port.pollCollections !== undefined,
    initialData: { notifications: initial.notifications, tasks: initial.tasks },
    queryFn: async () => {
      if (port.pollCollections === undefined) return { notifications: initial.notifications, tasks: initial.tasks };
      return port.pollCollections();
    },
    queryKey: ["workbench-collections", sessionScope],
    refetchInterval: collectionPollingIntervalMs,
    retry: false,
  });

  return {
    ...initial,
    notifications: polling.data.notifications,
    tasks: polling.data.tasks,
  };
}
