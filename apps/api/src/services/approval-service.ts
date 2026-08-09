import { eq, and } from "drizzle-orm";
import { approvals, executions, projects } from "@relayos/db/schema";
import { post, HttpClientError } from "@relayos/lib/http-client";
import { config } from "../config/env.js";
import { db } from "@relayos/db/client";

export class ApprovalNotFoundError extends Error {
  constructor(approvalId: string) {
    super(`Approval ${approvalId} not found`);
    this.name = "ApprovalNotFoundError";
  }
}

export class ApprovalForbiddenError extends Error {
  constructor() {
    super("Approval does not belong to a project you own");
    this.name = "ApprovalForbiddenError";
  }
}

export class ApprovalAlreadyDecidedError extends Error {
  constructor(currentStatus: string) {
    super(`Approval is already ${currentStatus} — cannot decide again`);
    this.name = "ApprovalAlreadyDecidedError";
  }
}

export class WorkflowServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowServiceError";
  }
}

export async function decideApproval(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  userId: string,
): Promise<void> {
  const [approval] = await db
    .select({
      id: approvals.id,
      executionId: approvals.executionId,
      status: approvals.status,
      projectId: executions.projectId,
    })
    .from(approvals)
    .innerJoin(executions, eq(approvals.executionId, executions.id))
    .where(eq(approvals.id, approvalId))
    .limit(1);

  if (!approval) {
    throw new ApprovalNotFoundError(approvalId);
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, approval.projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) {
    throw new ApprovalForbiddenError();
  }

  if (approval.status !== "PENDING") {
    throw new ApprovalAlreadyDecidedError(approval.status);
  }

  await db
    .update(approvals)
    .set({
      status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
      approvedBy: userId,
      approvedAt: new Date(),
    })
    .where(eq(approvals.id, approvalId));

  const resumeUrl = `${config.WORKFLOW_SERVICE_URL}/internal/executions/${approval.executionId}/resume`;

  try {
    const response = await post(
      resumeUrl,
      { decision },
      { "x-internal-secret": config.INTERNAL_SERVICE_SECRET },
    );

    if (response.statusCode >= 500) {
      throw new WorkflowServiceError(
        `Workflow service returned ${response.statusCode}: ${response.responseBody}`,
      );
    }
  } catch (error) {
    if (error instanceof WorkflowServiceError) throw error;

    if (error instanceof HttpClientError) {
      throw new WorkflowServiceError(
        `Failed to reach workflow service: ${error.message}`,
      );
    }

    throw error;
  }
}
