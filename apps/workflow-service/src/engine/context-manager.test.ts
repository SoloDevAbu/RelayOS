import { describe, it, expect, vi, beforeEach } from "vitest";
import { getContext, updateContext, deleteContext } from "./context-manager.js";

const { mockGet, mockSetex, mockDel, mockDbSelect, mockDbFrom } = vi.hoisted(() => {
  const mockDbFrom = vi.fn();
  const mockDbSelect = vi.fn(() => ({ from: mockDbFrom }));
  return {
    mockGet: vi.fn(),
    mockSetex: vi.fn(),
    mockDel: vi.fn(),
    mockDbSelect,
    mockDbFrom,
  };
});

vi.mock("@relayos/lib/redis", () => ({
  getRedis: () => ({
    get: mockGet,
    setex: mockSetex,
    del: mockDel,
  }),
}));

vi.mock("@relayos/db/client", () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock("@relayos/db/schema", () => ({
  executions: { id: "executions.id", triggerPayload: "executions.triggerPayload" },
  executionSteps: {
    executionId: "executionSteps.executionId",
    stepId: "executionSteps.stepId",
    output: "executionSteps.output",
    completedAt: "executionSteps.completedAt",
    status: "executionSteps.status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conds: unknown[]) => ({ _and: conds }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function setupDbChain(executionRow: unknown, stepRows: unknown[]) {
  let callCount = 0;
  mockDbFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        where: () => ({
          limit: () => Promise.resolve(executionRow ? [executionRow] : []),
        }),
      };
    }
    return {
      where: () => Promise.resolve(stepRows),
    };
  });
}

describe("getContext", () => {
  it("returns parsed context from Redis on cache hit", async () => {
    const cached = {
      executionId: "exec-1",
      triggerPayload: { key: "val" },
      steps: [],
    };
    mockGet.mockResolvedValue(JSON.stringify(cached));

    const result = await getContext("exec-1");

    expect(result).toEqual(cached);
    expect(mockGet).toHaveBeenCalledWith("exec-ctx:exec-1");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("falls back to Postgres on cache miss and writes through", async () => {
    mockGet.mockResolvedValue(null);
    setupDbChain(
      { id: "exec-1", triggerPayload: { foo: "bar" } },
      [
        {
          stepId: "step-1",
          output: { result: "ok" },
          completedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    );

    const result = await getContext("exec-1");

    expect(result.executionId).toBe("exec-1");
    expect(result.triggerPayload).toEqual({ foo: "bar" });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.stepId).toBe("step-1");
    expect(mockSetex).toHaveBeenCalledWith(
      "exec-ctx:exec-1",
      3600,
      expect.any(String),
    );
  });

  it("throws if execution not found in database", async () => {
    mockGet.mockResolvedValue(null);
    setupDbChain(null, []);

    await expect(getContext("missing")).rejects.toThrow(
      "Execution missing not found in database",
    );
  });
});

describe("updateContext", () => {
  it("appends step output and writes to Redis with TTL", async () => {
    const existing = {
      executionId: "exec-1",
      triggerPayload: null,
      steps: [],
    };
    mockGet.mockResolvedValue(JSON.stringify(existing));

    await updateContext("exec-1", {
      stepId: "step-2",
      output: { data: 42 },
      completedAt: "2026-01-01T00:00:00Z",
    });

    expect(mockSetex).toHaveBeenCalledWith(
      "exec-ctx:exec-1",
      3600,
      expect.stringContaining('"step-2"'),
    );

    const written = JSON.parse(mockSetex.mock.calls[0]![2] as string);
    expect(written.steps).toHaveLength(1);
    expect(written.steps[0].stepId).toBe("step-2");
  });
});

describe("deleteContext", () => {
  it("removes the Redis key", async () => {
    await deleteContext("exec-1");

    expect(mockDel).toHaveBeenCalledWith("exec-ctx:exec-1");
  });
});
