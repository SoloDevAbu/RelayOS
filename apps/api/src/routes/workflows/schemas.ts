import { Type, type Static } from "@sinclair/typebox";

const StepType = Type.Union([
  Type.Literal("AI_PLAN"),
  Type.Literal("TOOL_CALL"),
  Type.Literal("APPROVAL"),
  Type.Literal("CONDITION"),
  Type.Literal("TRANSFORM"),
  Type.Literal("DELAY"),
]);

export const WorkflowStep = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 100 }),
    type: StepType,
    name: Type.String({ minLength: 1, maxLength: 255 }),
    /** Step-type-specific configuration object */
    config: Type.Record(Type.String(), Type.Unknown()),
    /** ID of the next step on success */
    onSuccess: Type.Optional(Type.String()),
    /** ID of the fallback step on failure */
    onFailure: Type.Optional(Type.String()),
    /** Max retry attempts (default 3) */
    maxRetries: Type.Optional(Type.Integer({ minimum: 0, maximum: 10 })),
  },
  { additionalProperties: false },
);

export const WorkflowDefinition = Type.Object(
  {
    /** Ordered list of workflow steps */
    steps: Type.Array(WorkflowStep, { minItems: 1 }),
    /** ID of the first step to execute */
    initialStepId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type WorkflowDefinitionType = Static<typeof WorkflowDefinition>;

const ProjectWorkflowParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
});

const WorkflowParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  workflowId: Type.String({ format: "uuid" }),
});
export type WorkflowParamsType = Static<typeof WorkflowParams>;

const TriggerType = Type.Union([
  Type.Literal("MANUAL"),
  Type.Literal("SCHEDULED"),
  Type.Literal("EVENT"),
]);

const WorkflowStatus = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("ACTIVE"),
  Type.Literal("INACTIVE"),
]);

export const WorkflowResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  projectId: Type.String({ format: "uuid" }),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  definition: WorkflowDefinition,
  triggerType: TriggerType,
  status: WorkflowStatus,
  version: Type.Integer(),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});
export type WorkflowResponseType = Static<typeof WorkflowResponse>;

export const PaginationQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQueryType = Static<typeof PaginationQuery>;

export const CreateWorkflowBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.Optional(Type.String({ maxLength: 1000 })),
    definition: WorkflowDefinition,
    triggerType: TriggerType,
  },
  { additionalProperties: false },
);
export type CreateWorkflowBodyType = Static<typeof CreateWorkflowBody>;

export const createWorkflowSchema = {
  description: "Create a new workflow definition",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: ProjectWorkflowParams,
  body: CreateWorkflowBody,
  response: {
    201: WorkflowResponse,
  },
};

export const listWorkflowsSchema = {
  description: "List all workflows for a project",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: ProjectWorkflowParams,
  querystring: PaginationQuery,
  response: {
    200: Type.Object({
      workflows: Type.Array(WorkflowResponse),
      total: Type.Integer(),
      page: Type.Integer(),
      limit: Type.Integer(),
    }),
  },
};

export const getWorkflowSchema = {
  description: "Get a workflow by ID",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: WorkflowParams,
  response: {
    200: WorkflowResponse,
  },
};

export const UpdateWorkflowBody = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    description: Type.Optional(Type.String({ maxLength: 1000 })),
    definition: Type.Optional(WorkflowDefinition),
    triggerType: Type.Optional(TriggerType),
  },
  { additionalProperties: false },
);
export type UpdateWorkflowBodyType = Static<typeof UpdateWorkflowBody>;

export const updateWorkflowSchema = {
  description: "Update a workflow definition (bumps version)",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: WorkflowParams,
  body: UpdateWorkflowBody,
  response: {
    200: WorkflowResponse,
  },
};

export const deleteWorkflowSchema = {
  description: "Delete a workflow definition",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: WorkflowParams,
  response: {
    200: Type.Object({ message: Type.String() }),
  },
};

export const activateWorkflowSchema = {
  description: "Activate a workflow (status → ACTIVE)",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: WorkflowParams,
  response: {
    200: WorkflowResponse,
  },
};

export const deactivateWorkflowSchema = {
  description: "Deactivate a workflow (status → INACTIVE)",
  tags: ["workflows"],
  security: [{ bearerAuth: [] }],
  params: WorkflowParams,
  response: {
    200: WorkflowResponse,
  },
};
