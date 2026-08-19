import { describe, it, expect, vi, beforeEach } from "vitest";
import { processExecution } from "./execution-worker.js";
import { InvalidTransitionError } from "../engine/state-machine.js";
import type { Job } from "bullmq";
import type { WorkflowExecuteJob } from "@relayos/queue";

const mockGetExecution = vi.fn();
const mockGetWorkflowDefinition = vi.fn();
const mockInsertExecutionSteps = vi.fn();

vi.mock("../services/execution-service.js", () => ({
  getExecution: (...args: unknown[]) => mockGetExecution(...args),
  getWorkflowDefinition: (...args: unknown[]) => mockGetWorkflowDefinition(...args),
  insertExecutionSteps: (...args: unknown[]) => mockInsertExecutionSteps(...args),
  getLatestStepRows: vi.fn(),
  updateExecutionCurrentStepId: vi.fn(),
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

function makeJob(data: Partial<WorkflowExecuteJob> = {}): Job<WorkflowExecuteJob> {
  return {
    id: "job-1",
    data: {
      executionId: "exec-1",
      workflowId: "wf-1",
      projectId: "proj-1",
      ...data,
    },
  } as unknown as Job<WorkflowExecuteJob>;
}

const sampleDefinition = {
  initialStepId: "s1",
  steps: [{ id: "s1", type: "DELAY", name: "Wait", config: { durationMs: 100 } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteContext.mockResolvedValue(undefined);
});

describe("processExecution", () => {
  it("completes a happy-path execution", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "PENDING",
    });
    mockGetWorkflowDefinition.mockResolvedValue(sampleDefinition);
    mockInsertExecutionSteps.mockResolvedValue([
      { id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "DELAY", status: "PENDING", attempt: 1 },
    ]);
    mockRunSteps.mockResolvedValue({ success: true, completedSteps: ["s1"] });

    await processExecution(makeJob());

    expect(mockTransitionExecution).toHaveBeenCalledWith(
      "exec-1", "PENDING", "RUNNING",
      expect.objectContaining({ startedAt: expect.any(Date) }),
    );
    expect(mockTransitionExecution).toHaveBeenCalledWith(
      "exec-1", "RUNNING", "COMPLETED",
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
    expect(mockDeleteContext).toHaveBeenCalledWith("exec-1");
  });

  it("does not fail execution and does not delete context when retry is enqueued", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "PENDING",
    });
    mockGetWorkflowDefinition.mockResolvedValue(sampleDefinition);
    mockInsertExecutionSteps.mockResolvedValue([
      { id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "DELAY", status: "PENDING", attempt: 1 },
    ]);
    mockRunSteps.mockResolvedValue({ success: false, completedSteps: [], retryEnqueued: true });

    await processExecution(makeJob());

    expect(mockTransitionExecution).not.toHaveBeenCalledWith(
      "exec-1", "RUNNING", "FAILED",
      expect.anything(),
    );
    expect(mockTransitionExecution).not.toHaveBeenCalledWith(
      "exec-1", "RUNNING", "COMPLETED",
      expect.anything(),
    );
  });

  it("skips when execution not found", async () => {
    mockGetExecution.mockResolvedValue(null);

    await processExecution(makeJob());

    expect(mockTransitionExecution).not.toHaveBeenCalled();
    expect(mockRunSteps).not.toHaveBeenCalled();
  });

  it("skips when execution is not PENDING", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      status: "RUNNING",
    });

    await processExecution(makeJob());

    expect(mockTransitionExecution).not.toHaveBeenCalled();
    expect(mockRunSteps).not.toHaveBeenCalled();
  });

  it("transitions to FAILED when workflow definition not found", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "PENDING",
    });
    mockGetWorkflowDefinition.mockResolvedValue(null);

    await processExecution(makeJob());

    expect(mockTransitionExecution).toHaveBeenCalledWith(
      "exec-1", "PENDING", "RUNNING",
      expect.any(Object),
    );
    expect(mockTransitionExecution).toHaveBeenCalledWith(
      "exec-1", "RUNNING", "FAILED",
      expect.objectContaining({ error: expect.stringContaining("not found") }),
    );
  });

  it("transitions to FAILED on step failure (onError=FAIL, exhausted)", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "PENDING",
    });
    mockGetWorkflowDefinition.mockResolvedValue(sampleDefinition);
    mockInsertExecutionSteps.mockResolvedValue([
      { id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "DELAY", status: "PENDING", attempt: 1 },
    ]);
    mockRunSteps.mockResolvedValue({
      success: false,
      completedSteps: [],
      failedStepId: "s1",
      error: "tool failed",
    });

    await processExecution(makeJob());

    expect(mockTransitionExecution).toHaveBeenCalledWith(
      "exec-1", "RUNNING", "FAILED",
      expect.objectContaining({ error: "tool failed" }),
    );
  });

  it("catches unexpected errors and transitions to FAILED", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "PENDING",
    });
    mockGetWorkflowDefinition.mockResolvedValue(sampleDefinition);
    mockInsertExecutionSteps.mockRejectedValue(new Error("DB connection lost"));

    await processExecution(makeJob());

    expect(mockTransitionExecution).toHaveBeenCalledWith(
      "exec-1", "RUNNING", "FAILED",
      expect.objectContaining({ error: "DB connection lost" }),
    );
  });

  it("handles duplicate delivery via InvalidTransitionError", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "PENDING",
    });
    mockGetWorkflowDefinition.mockResolvedValue(sampleDefinition);
    mockTransitionExecution.mockRejectedValueOnce(
      new InvalidTransitionError("execution", "exec-1", "PENDING", "RUNNING"),
    );

    await processExecution(makeJob());

    expect(mockRunSteps).not.toHaveBeenCalled();
  });

  it("handles pause outcome by transitioning execution to WAITING_APPROVAL and preserving context", async () => {
    mockGetExecution
      .mockResolvedValueOnce({
        id: "exec-1",
        workflowId: "wf-1",
        status: "PENDING",
      })
      .mockResolvedValueOnce({
        id: "exec-1",
        workflowId: "wf-1",
        status: "WAITING_APPROVAL",
      });
    mockGetWorkflowDefinition.mockResolvedValue(sampleDefinition);
    mockInsertExecutionSteps.mockResolvedValue([
      { id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "APPROVAL", status: "PENDING", attempt: 1 },
    ]);
    mockRunSteps.mockResolvedValue({ success: false, completedSteps: [], pausedAtStepId: "s1" });

    await processExecution(makeJob());

    const { updateExecutionCurrentStepId } = await import("../services/execution-service.js");
    expect(updateExecutionCurrentStepId).toHaveBeenCalledWith("exec-1", "s1");
    expect(mockTransitionExecution).toHaveBeenCalledWith("exec-1", "RUNNING", "WAITING_APPROVAL");
    expect(mockDeleteContext).not.toHaveBeenCalled();
  });

  it("handles resumed job by picking up from resumeFromStepId", async () => {
    mockGetExecution.mockResolvedValue({
      id: "exec-1",
      workflowId: "wf-1",
      status: "RUNNING",
    });
    const defWithOnSuccess = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "APPROVAL", name: "Approve", config: {}, onSuccess: "s2" },
        { id: "s2", type: "DELAY", name: "D2", config: {} },
      ],
    };
    mockGetWorkflowDefinition.mockResolvedValue(defWithOnSuccess);

    const { getLatestStepRows } = await import("../services/execution-service.js");
    (getLatestStepRows as any).mockResolvedValue([
      { id: "row-1", executionId: "exec-1", stepId: "s1", stepType: "APPROVAL", status: "WAITING_APPROVAL", attempt: 1 },
      { id: "row-2", executionId: "exec-1", stepId: "s2", stepType: "DELAY", status: "PENDING", attempt: 1 },
    ]);

    mockRunSteps.mockResolvedValue({ success: true, completedSteps: ["s2"] });

    await processExecution(makeJob({
      resumeFromStepId: "s1",
      approvalDecision: "APPROVED",
    }));

    expect(mockTransitionExecution).not.toHaveBeenCalledWith("exec-1", "PENDING", "RUNNING", expect.any(Object));
    expect(mockTransitionStep).toHaveBeenCalledWith(
      "row-1", "WAITING_APPROVAL", "COMPLETED",
      expect.objectContaining({ output: { decision: "APPROVED" } }),
    );
    expect(mockRunSteps).toHaveBeenCalledWith(
      "exec-1", "wf-1", "proj-1",
      defWithOnSuccess,
      expect.any(Array),
      expect.any(Object),
      { startFromStepId: "s2" },
    );
    expect(mockTransitionExecution).toHaveBeenCalledWith("exec-1", "RUNNING", "COMPLETED", expect.any(Object));
  });
});
