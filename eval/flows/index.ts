// eval/flows/index.ts
export { schedulingFlow } from "./scheduling.flow";
export { billingFlow } from "./billing.flow";
export { recallSchedulingFlow } from "./recall-scheduling.flow";
export { npsFlow } from "./nps.flow";

import { schedulingFlow } from "./scheduling.flow";
import { billingFlow } from "./billing.flow";
import { recallSchedulingFlow } from "./recall-scheduling.flow";
import { npsFlow } from "./nps.flow";

export const ALL_FLOWS = [
  schedulingFlow,
  billingFlow,
  recallSchedulingFlow,
  npsFlow,
];
