import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getExecution,
  getWorkflowDefinition,
  insertExecutionSteps,
  insertRetryStepRow,
  getLatestStepRows,
  getExecutionSteps,
  updateExecutionCurrentStepId,
} from "./execution-service.js";

const { mockDb, mockChain } = vi.hoisted(() => {
  const mockChain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    as: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: vi.fn(), // Needed if we want to mock resolved values directly on the chain
  };

  // Allow awaiting the chain
  mockChain.then = (resolve: any) => resolve(mockChain.resolvedValue);

  const mockDb = {
    select: vi.fn(() => mockChain),
    insert: vi.fn(() => mockChain),
    update: vi.fn(() => mockChain),
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
    triggerPayload: "executions.triggerPayload",
    correlationId: "executions.correlationId",
    error: "executions.error",
    currentStepId: "executions.currentStepId",
  },
  executionSteps: {
    id: "executionSteps.id",
    executionId: "executionSteps.executionId",
    stepId: "executionSteps.stepId",
    stepType: "executionSteps.stepType",
    status: "executionSteps.status",
    attempt: "executionSteps.attempt",
  },
  workflows: {
    id: "workflows.id",
    definition: "workflows.definition",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: { col, val } })),
  desc: vi.fn((col) => ({ desc: col })),
  sql: vi.fn((strings, ...values) => ({
    strings,
    values,
    as: vi.fn((alias) => ({ as: alias })),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockChain.resolvedValue = undefined;
});

describe("execution-service", () => {
  describe("getExecution", () => {
    it("returns execution row if found", async () => {
      const expected = { id: "exec-1", status: "RUNNING" };
      mockChain.resolvedValue = [expected];

      const result = await getExecution("exec-1");
      expect(result).toEqual(expected);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockChain.from).toHaveBeenCalled();
      expect(mockChain.where).toHaveBeenCalled();
      expect(mockChain.limit).toHaveBeenCalledWith(1);
    });

    it("returns null if not found", async () => {
      mockChain.resolvedValue = [];

      const result = await getExecution("exec-1");
      expect(result).toBeNull();
    });
  });

  describe("getWorkflowDefinition", () => {
    it("returns definition if found", async () => {
      const def = { steps: [] };
      mockChain.resolvedValue = [{ definition: def }];

      const result = await getWorkflowDefinition("wf-1");
      expect(result).toEqual(def);
    });

    it("returns null if not found", async () => {
      mockChain.resolvedValue = [];

      const result = await getWorkflowDefinition("wf-1");
      expect(result).toBeNull();
    });
  });

  describe("insertExecutionSteps", () => {
    it("inserts steps and returns rows", async () => {
      const def = {
        steps: [
          { id: "step-1", type: "TOOL_CALL" },
          { id: "step-2", type: "AI_PLAN" },
        ],
      } as any;

      const rows = [{ id: "row-1" }, { id: "row-2" }];
      mockChain.resolvedValue = rows;

      const result = await insertExecutionSteps("exec-1", def);
      expect(result).toEqual(rows);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockChain.values).toHaveBeenCalledWith([
        { executionId: "exec-1", stepId: "step-1", stepType: "TOOL_CALL", status: "PENDING", attempt: 1 },
        { executionId: "exec-1", stepId: "step-2", stepType: "AI_PLAN", status: "PENDING", attempt: 1 },
      ]);
      expect(mockChain.returning).toHaveBeenCalled();
    });
  });

  describe("insertRetryStepRow", () => {
    it("inserts retry step row and returns it", async () => {
      const row = { id: "row-1" };
      mockChain.resolvedValue = [row];

      const result = await insertRetryStepRow("exec-1", "step-1", "TOOL_CALL", 2);
      expect(result).toEqual(row);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockChain.values).toHaveBeenCalledWith({
        executionId: "exec-1",
        stepId: "step-1",
        stepType: "TOOL_CALL",
        status: "PENDING",
        attempt: 2,
      });
      expect(mockChain.returning).toHaveBeenCalled();
    });

    it("throws if no row returned", async () => {
      mockChain.resolvedValue = [];

      await expect(
        insertRetryStepRow("exec-1", "step-1", "TOOL_CALL", 2)
      ).rejects.toThrow("Failed to insert retry step row for step-1 attempt 2");
    });
  });

  describe("getLatestStepRows", () => {
    it("returns latest step rows", async () => {
      const rows = [{ id: "row-1" }];
      mockChain.resolvedValue = rows;

      const result = await getLatestStepRows("exec-1");
      expect(result).toEqual(rows);
      expect(mockDb.select).toHaveBeenCalled();
      // Should have been called twice (once for subquery, once for main query)
      expect(mockDb.select).toHaveBeenCalledTimes(2);
      expect(mockChain.innerJoin).toHaveBeenCalled();
      expect(mockChain.where).toHaveBeenCalled();
    });
  });

  describe("getExecutionSteps", () => {
    it("returns steps ordered by attempt", async () => {
      const rows = [{ id: "row-1" }];
      mockChain.resolvedValue = rows;

      const result = await getExecutionSteps("exec-1");
      expect(result).toEqual(rows);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockChain.where).toHaveBeenCalled();
      expect(mockChain.orderBy).toHaveBeenCalled();
    });
  });

  describe("updateExecutionCurrentStepId", () => {
    it("updates currentStepId", async () => {
      mockChain.resolvedValue = [{ id: "exec-1" }];

      await updateExecutionCurrentStepId("exec-1", "step-2");
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ currentStepId: "step-2" })
      );
      expect(mockChain.where).toHaveBeenCalled();
    });
  });
});
