import { createLogger } from "@relayos/lib/logger";
import { runCompensation } from "./compensation-runner.js";
import {
  transitionCompensationStatus,
} from "../state-machine.js";
import { callTool } from "../handlers/call-tool.js";
import type { CompensatableStepRow } from "../../services/execution-service.js";
import type { SagaStatus } from "@relayos/types";
import type { updateSagaStatus as UpdateSagaStatusFn } from "../state-machine.js";

export interface SagaCoordinatorDeps {
  getCompensatableSteps: (executionId: string) => Promise<CompensatableStepRow[]>;
  updateSagaStatus: typeof UpdateSagaStatusFn;
  runCompensation: typeof runCompensation;
}

export async function runSaga(
  executionId: string,
  deps: SagaCoordinatorDeps,
): Promise<"compensated" | "compensation_failed"> {
  const log = createLogger({ executionId, component: "saga-coordinator" });

  const steps = await deps.getCompensatableSteps(executionId);

  await deps.updateSagaStatus(executionId, "COMPENSATING");
  log.info({ stepCount: steps.length }, "Beginning saga compensation");

  let anyFailed = false;

  for (const step of steps) {
    log.info(
      { stepId: step.stepId, compensationToolId: step.compensationToolId },
      "Running compensation for step",
    );

    const outcome = await deps.runCompensation(
      {
        stepRowId: step.stepRowId,
        stepId: step.stepId,
        compensationToolId: step.compensationToolId,
        compensationInput: step.compensationInput,
        executionId,
      },
      { callTool, transitionCompensationStatus },
    );

    if (outcome === "failed") {
      anyFailed = true;
      log.warn({ stepId: step.stepId }, "Compensation failed for step — continuing with remaining steps");
    } else {
      log.info({ stepId: step.stepId }, "Compensation succeeded for step");
    }
  }

  const sagaResult: SagaStatus = anyFailed ? "COMPENSATION_FAILED" : "COMPENSATED";
  log.info({ sagaResult }, "Saga compensation complete");

  return anyFailed ? "compensation_failed" : "compensated";
}
