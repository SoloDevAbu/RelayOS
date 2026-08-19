import { describe, it, expect, vi, beforeEach } from "vitest";
import { processRetry } from "./retry-worker.js";
import { InvalidTransitionError } from "../engine/state-machine.js";
import type { Job } from "bullmq";
import type { WorkflowRetryJob } from "@relayos/queue";

const mockGetExecution = vi.fn();
const mockGetWorkflowDefinition = vi.fn();
const mockInsertRetryStepRow = vi.fn();
const mockGetLatestStepRows = vi.fn();
const mockUpdateExecutionCurrentStepId = vi.fn();

vi.mock("../services/execution-service.js", () => ({
  getExecution: (...args: unknown[]) => mockGetExecution(...args),
  getWorkflowDefinition: (...args: unknown[]) => mockGetWorkflowDefinition(...args),
  insertRetryStepRow: (...args: unknown[]) => mockInsertRetryStepRow(...args),
  getLatestStepRows: (...args: unknown[]) => mockGetLatestStepRows(...args),
  updateExecutionCurrentStepId: (...args: unknown[]) => mockUpdateExecutionCurrentStepId(...args),
}));

vi.mock("@relayos/queue", () => ({
  QUEUES: {
    WORKFLOW_EXECUTE: "workflow-execute",
    WORKFLOW_RETRY: "workflow-retry",
    WORKFLOW_DLQ: "workflow-dlq",
  },
  bullmqRedis: {},
  DLQ_DEFAULT_JOB_OPTIONS: { removeOnComplete: false, removeOnFail: false, attempts: 1 },
  Queue: class {
    add = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@relayos/db/client", () => ({
  db: {},
}));

vi.mock("@relayos/db/schema", () => ({
  approvals: {},
}));

const mockTransitionExecution = vi.fn();
const mockTransitionStep = vi.fn();

vi.mock("../engine/state-machine.js", () => ({
  transitionExecution: (...args: unknown[]) => mockTransitionExecution(...args),
  transitionStep: (...args: unknown[]) => mockTransitionStep(...args),
  InvalidTransitionError: class extends Error {
    constructor() {
      super("invalid transition");
      this.name = "InvalidTransitionError";
    }
  },
}));

const mockGetContext = vi.fn();
const mockUpdateContext = vi.fn();
const mockDeleteContext = vi.fn();

vi.mock("../engine/context-manager.js", () => ({
  getContext: (...args: unknown[]) => mockGetContext(...args),
  updateContext: (...args: unknown[]) => mockUpdateContext(...args),
  deleteContext: (...args: unknown[]) => mockDeleteContext(...args),
}));

const mockRunSteps = vi.fn();

vi.mock("../engine/step-runner.js", () => ({
  runSteps: (...args: unknown[]) => mockRunSteps(...args),
}));

vi.mock("@relayos/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeJob(data: Partial<WorkflowRetryJob> = {}): Job<WorkflowRetryJob> {
  return {
    id: "job-1",
    data: {
      executionId: "exec-1",
      workflowId: "wf-1",
      projectId: "proj-1",
      stepId: "s1",
      attempt: 2,
      ...data,
    },
  } as unknown as Job<WorkflowRetryJob>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteContext.mockResolvedValue(undefined);
});

describe("processRetryJob", () => {
  it("handles pause outcome by transitioning execution to WAITING_APPROVAL and preserving context", async () => {
    mockGetExecution
      .mockResolvedValueOnce({
        id: "exec-1",
        workflowId: "wf-1",
        status: "RUNNING",
      })
      .mockResolvedValueOnce({
        id: "exec-1",
        workflowId: "wf-1",
        status: "WAITING_APPROVAL",
      });
    mockGetWorkflowDefinition.mockResolvedValue({
      initialStepId: "s1",
      steps: [{ id: "s1", type: "APPROVAL", name: "Wait", config: {} }],
    });
    mockInsertRetryStepRow.mockResolvedValue({
      id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "APPROVAL", status: "PENDING", attempt: 2,
    });
    mockGetLatestStepRows.mockResolvedValue([
      { id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "APPROVAL", status: "PENDING", attempt: 2 },
    ]);
    mockRunSteps.mockResolvedValue({ success: false, completedSteps: [], pausedAtStepId: "s1" });

    await processRetry(makeJob());

    expect(mockUpdateExecutionCurrentStepId).toHaveBeenCalledWith("exec-1", "s1");
    expect(mockTransitionExecution).toHaveBeenCalledWith("exec-1", "RUNNING", "WAITING_APPROVAL");
    expect(mockDeleteContext).not.toHaveBeenCalled();
  });
});
