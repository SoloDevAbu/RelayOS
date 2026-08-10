import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resumeExecution,
  ExecutionNotFoundError,
  ExecutionNotWaitingError,
  ApprovalAlreadyDecidedError,
} from "./resume-service.js";
import {
  transitionExecution,
  transitionStep,
} from "../engine/state-machine.js";
import { Queue } from "bullmq";

const { mockDb, mockChain } = vi.hoisted(() => {
  const mockChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  mockChain.then = (resolve: any) => resolve(mockChain.resolvedValue);

  const mockDb = {
    select: vi.fn(() => mockChain),
  };

  return { mockDb, mockChain };
});

vi.mock("@relayos/db/client", () => ({
  db: mockDb,
}));

vi.mock("@relayos/db/schema", () => ({
  executions: {
    id: "executions.id",
    workflowId: "executions.workflowId",
    projectId: "executions.projectId",
    status: "executions.status",
    currentStepId: "executions.currentStepId",
  },
  executionSteps: {
    id: "executionSteps.id",
    executionId: "executionSteps.executionId",
    stepId: "executionSteps.stepId",
    status: "executionSteps.status",
  },
  approvals: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: { col, val } })),
  and: vi.fn((...conds) => ({ and: conds })),
}));

vi.mock("../engine/state-machine.js", () => ({
  transitionExecution: vi.fn().mockResolvedValue(undefined),
  transitionStep: vi.fn().mockResolvedValue(undefined),
}));
const { mockQueueAdd } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue({ id: "job-1" })
}));

vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation(() => ({
      add: mockQueueAdd,
    })),
  };
});

vi.mock("@relayos/queue", () => ({
  QUEUES: { WORKFLOW_EXECUTE: "WORKFLOW_EXECUTE" },
  bullmqRedis: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockChain.resolvedValue = undefined;
  mockChain.then = (resolve: any) => resolve(mockChain.resolvedValue);
});

describe("resume-service", () => {
  describe("resumeExecution", () => {
    it("throws ExecutionNotFoundError if execution does not exist", async () => {
      mockChain.resolvedValue = [];

      await expect(resumeExecution("exec-1", "APPROVED")).rejects.toThrow(
        ExecutionNotFoundError,
      );
    });

    it("throws ExecutionNotWaitingError if execution is not in WAITING_APPROVAL status", async () => {
      mockChain.resolvedValue = [{ id: "exec-1", status: "RUNNING" }];

      await expect(resumeExecution("exec-1", "APPROVED")).rejects.toThrow(
        ExecutionNotWaitingError,
      );
    });

    describe("decision: REJECTED", () => {
      it("cancels current step and execution", async () => {
        // First query: fetch execution
        const execQuery = vi.fn().mockReturnValue([
          {
            id: "exec-1",
            status: "WAITING_APPROVAL",
            currentStepId: "step-1",
          },
        ]);
        // Second query: fetch paused step
        const stepQuery = vi.fn().mockReturnValue([{ id: "step-row-1" }]);

        mockChain.then = (resolve: any) => {
          if (mockDb.select.mock.calls.length === 1) {
            return resolve(execQuery());
          }
          return resolve(stepQuery());
        };

        await resumeExecution("exec-1", "REJECTED");

        expect(transitionStep).toHaveBeenCalledWith(
          "step-row-1",
          "WAITING_APPROVAL",
          "CANCELLED",
        );
        expect(transitionExecution).toHaveBeenCalledWith(
          "exec-1",
          "WAITING_APPROVAL",
          "CANCELLED",
        );
        // Queue should not be called
        expect(mockQueueAdd).not.toHaveBeenCalled();
      });

      it("cancels execution only if no paused step is found", async () => {
        // First query: fetch execution
        const execQuery = vi.fn().mockReturnValue([
          {
            id: "exec-1",
            status: "WAITING_APPROVAL",
            currentStepId: "step-1",
          },
        ]);
        // Second query: fetch paused step
        const stepQuery = vi.fn().mockReturnValue([]);

        mockChain.then = (resolve: any) => {
          if (mockDb.select.mock.calls.length === 1) {
            return resolve(execQuery());
          }
          return resolve(stepQuery());
        };

        await resumeExecution("exec-1", "REJECTED");

        expect(transitionStep).not.toHaveBeenCalled();
        expect(transitionExecution).toHaveBeenCalledWith(
          "exec-1",
          "WAITING_APPROVAL",
          "CANCELLED",
        );
      });
    });

    describe("decision: APPROVED", () => {
      it("transitions execution to RUNNING and adds job to queue", async () => {
        mockChain.resolvedValue = [
          {
            id: "exec-1",
            workflowId: "wf-1",
            projectId: "proj-1",
            status: "WAITING_APPROVAL",
            currentStepId: "step-1",
          },
        ];

        await resumeExecution("exec-1", "APPROVED");

        expect(transitionExecution).toHaveBeenCalledWith(
          "exec-1",
          "WAITING_APPROVAL",
          "RUNNING",
        );

        expect(mockQueueAdd).toHaveBeenCalledWith(
          "resume",
          {
            executionId: "exec-1",
            workflowId: "wf-1",
            projectId: "proj-1",
            resumeFromStepId: "step-1",
            approvalDecision: "APPROVED",
          },
          expect.any(Object),
        );
      });
    });
  });
});
