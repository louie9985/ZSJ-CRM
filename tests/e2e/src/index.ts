export const packageId = "@ai-crm/e2e" as const;
export { createE2eProcessBindings, e2eApiBindingFactory } from "./api-main.js";
export { createE2eProcessAnchorHandler } from "./worker-main.js";
export { createWalkingSkeletonSourceCommandMessageHandler, walkingSkeletonSourceJobType } from "./walking-skeleton-source-handler.js";
export { createWalkingSkeletonNotificationMessageHandler, walkingSkeletonNotificationJobType, type WalkingSkeletonNotificationActorResolver } from "./walking-skeleton-notification-handler.js";
export { createWalkingSkeletonWorkflowCompletion, type WalkingSkeletonWorkflowBinding } from "./walking-skeleton-workflow.js";
export {
  walkingSkeletonJobPolicy,
  walkingSkeletonNotificationBindingId,
  walkingSkeletonNotificationConsumerId,
  walkingSkeletonNotificationRabbitTopology,
  walkingSkeletonSourceBindingId,
  walkingSkeletonSourceConsumerId,
  walkingSkeletonSourceRabbitTopology,
} from "./walking-skeleton-rabbit.js";
export { runWalkingSkeletonRabbitJobIntegration } from "./rabbit-job-integration.js";
export { runWalkingSkeletonFlowableWorkflowIntegration } from "./flowable-workflow-integration.js";
export {
  createWalkingSkeletonSource,
  createWalkingSkeletonTaskPorts,
  walkingSkeletonSourceType,
  WalkingSkeletonSourceError,
  type WalkingSkeletonActorContext,
  type WalkingSkeletonSourceCommand,
  type WalkingSkeletonSourceReceipt,
  type WalkingSkeletonSourceState,
} from "./walking-skeleton-source.js";
