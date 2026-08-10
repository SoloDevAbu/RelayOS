import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import resumeRoutes from "./resume.js";
import {
  resumeExecution,
  ExecutionNotFoundError,
  ExecutionNotWaitingError,
  ApprovalAlreadyDecidedError,
} from "../../services/resume-service.js";

// Mock the service
vi.mock("../../services/resume-service.js", () => {
  class ExecutionNotFoundError extends Error {
    constructor(id: string) {
      super(`Execution ${id} not found`);
    }
  }
  class ExecutionNotWaitingError extends Error {
    constructor(id: string, status: string) {
      super(`Execution ${id} is ${status}, not WAITING_APPROVAL`);
    }
  }
  class ApprovalAlreadyDecidedError extends Error {
    constructor(id: string, status: string) {
      super(`Approval ${id} is already ${status}`);
    }
  }
  return {
    resumeExecution: vi.fn(),
    ExecutionNotFoundError,
    ExecutionNotWaitingError,
    ApprovalAlreadyDecidedError,
  };
});

describe("resume routes", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();

    app.decorate("config", {
      INTERNAL_SERVICE_SECRET: "test-secret",
    });

    await app.register(resumeRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 if x-internal-secret header is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      payload: { decision: "APPROVED" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      statusCode: 401,
      error: "Unauthorized",
      message: "Missing or invalid internal service secret",
    });
  });

  it("returns 401 if x-internal-secret header is invalid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      headers: {
        "x-internal-secret": "wrong-secret",
      },
      payload: { decision: "APPROVED" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 200 OK on successful resume", async () => {
    vi.mocked(resumeExecution).mockResolvedValue(undefined);

    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      headers: {
        "x-internal-secret": "test-secret",
      },
      payload: { decision: "APPROVED" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(resumeExecution).toHaveBeenCalledWith("exec-1", "APPROVED");
  });

  it("returns 404 if execution not found", async () => {
    vi.mocked(resumeExecution).mockRejectedValue(
      new ExecutionNotFoundError("exec-1")
    );

    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      headers: {
        "x-internal-secret": "test-secret",
      },
      payload: { decision: "REJECTED" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(expect.objectContaining({
      statusCode: 404,
      error: "Not Found",
    }));
  });

  it("returns 409 if execution is not waiting", async () => {
    vi.mocked(resumeExecution).mockRejectedValue(
      new ExecutionNotWaitingError("exec-1", "RUNNING")
    );

    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      headers: {
        "x-internal-secret": "test-secret",
      },
      payload: { decision: "APPROVED" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(expect.objectContaining({
      statusCode: 409,
      error: "Conflict",
    }));
  });

  it("returns 409 if approval already decided", async () => {
    vi.mocked(resumeExecution).mockRejectedValue(
      new ApprovalAlreadyDecidedError("app-1", "APPROVED")
    );

    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      headers: {
        "x-internal-secret": "test-secret",
      },
      payload: { decision: "APPROVED" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(expect.objectContaining({
      statusCode: 409,
      error: "Conflict",
    }));
  });

  it("throws 500 for unhandled errors", async () => {
    vi.mocked(resumeExecution).mockRejectedValue(new Error("Database boom"));

    const response = await app.inject({
      method: "POST",
      url: "/exec-1/resume",
      headers: {
        "x-internal-secret": "test-secret",
      },
      payload: { decision: "APPROVED" },
    });

    expect(response.statusCode).toBe(500);
  });
});
