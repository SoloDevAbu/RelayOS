import type { FastifyPluginAsync } from "fastify";
import {
  createWorkflow,
  listWorkflows,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  activateWorkflow,
  deactivateWorkflow,
} from "./handlers.js";
import {
  createWorkflowSchema,
  listWorkflowsSchema,
  getWorkflowSchema,
  updateWorkflowSchema,
  deleteWorkflowSchema,
  activateWorkflowSchema,
  deactivateWorkflowSchema,
} from "./schemas.js";

/**
 * Workflow routes
 */
const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.post("/", { schema: createWorkflowSchema }, createWorkflow);
  fastify.get("/", { schema: listWorkflowsSchema }, listWorkflows);
  fastify.get("/:workflowId", { schema: getWorkflowSchema }, getWorkflow);
  fastify.put("/:workflowId", { schema: updateWorkflowSchema }, updateWorkflow);
  fastify.delete(
    "/:workflowId",
    { schema: deleteWorkflowSchema },
    deleteWorkflow,
  );
  fastify.post(
    "/:workflowId/activate",
    { schema: activateWorkflowSchema },
    activateWorkflow,
  );
  fastify.post(
    "/:workflowId/deactivate",
    { schema: deactivateWorkflowSchema },
    deactivateWorkflow,
  );
};

export default workflowRoutes;
