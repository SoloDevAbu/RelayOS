import type { FastifyPluginAsync } from "fastify";
import { approveApproval, rejectApproval } from "./handlers.js";
import { approveSchema, rejectSchema } from "../../schemas/approvals.js";

const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.post("/:approvalId/approve", { schema: approveSchema }, approveApproval);
  fastify.post("/:approvalId/reject", { schema: rejectSchema }, rejectApproval);
};

export default approvalRoutes;
