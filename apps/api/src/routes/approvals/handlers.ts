import type { FastifyRequest, FastifyReply } from "fastify";
import type { ApprovalParamsType } from "../../schemas/approvals.js";
import {
  decideApproval,
  ApprovalNotFoundError,
  ApprovalForbiddenError,
  ApprovalAlreadyDecidedError,
  WorkflowServiceError,
} from "../../services/approval-service.js";

async function handleDecision(
  request: FastifyRequest<{ Params: ApprovalParamsType }>,
  reply: FastifyReply,
  decision: "APPROVED" | "REJECTED",
) {
  const { approvalId } = request.params;
  const userId = request.user!.id;

  try {
    await decideApproval(approvalId, decision, userId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ApprovalNotFoundError) {
      return reply.notFound(error.message);
    }
    if (error instanceof ApprovalForbiddenError) {
      return reply.notFound("Approval not found");
    }
    if (error instanceof ApprovalAlreadyDecidedError) {
      return reply.conflict(error.message);
    }
    if (error instanceof WorkflowServiceError) {
      return reply.internalServerError(error.message);
    }
    throw error;
  }
}

export async function approveApproval(
  request: FastifyRequest<{ Params: ApprovalParamsType }>,
  reply: FastifyReply,
) {
  return handleDecision(request, reply, "APPROVED");
}

export async function rejectApproval(
  request: FastifyRequest<{ Params: ApprovalParamsType }>,
  reply: FastifyReply,
) {
  return handleDecision(request, reply, "REJECTED");
}
