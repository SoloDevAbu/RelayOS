import { Type, type Static } from "@sinclair/typebox";

export const ProjectResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  userId: Type.String({ format: "uuid" }),
  name: Type.String(),
  slug: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});
export type ProjectResponseType = Static<typeof ProjectResponse>;

export const ProjectListResponse = Type.Object({
  projects: Type.Array(ProjectResponse),
  total: Type.Integer(),
});

export const CreateProjectBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);
export type CreateProjectBodyType = Static<typeof CreateProjectBody>;

export const createProjectSchema = {
  description: "Create a new project",
  tags: ["projects"],
  security: [{ bearerAuth: [] }],
  body: CreateProjectBody,
  response: {
    201: ProjectResponse,
  },
};

export const listProjectsSchema = {
  description: "List all projects for the authenticated user",
  tags: ["projects"],
  security: [{ bearerAuth: [] }],
  response: {
    200: ProjectListResponse,
  },
};

export const ProjectParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
});
export type ProjectParamsType = Static<typeof ProjectParams>;

export const getProjectSchema = {
  description: "Get a project by ID",
  tags: ["projects"],
  security: [{ bearerAuth: [] }],
  params: ProjectParams,
  response: {
    200: ProjectResponse,
  },
};

export const UpdateProjectBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);
export type UpdateProjectBodyType = Static<typeof UpdateProjectBody>;

export const updateProjectSchema = {
  description: "Update project name",
  tags: ["projects"],
  security: [{ bearerAuth: [] }],
  params: ProjectParams,
  body: UpdateProjectBody,
  response: {
    200: ProjectResponse,
  },
};

export const deleteProjectSchema = {
  description: "Delete a project and all its resources",
  tags: ["projects"],
  security: [{ bearerAuth: [] }],
  params: ProjectParams,
  response: {
    200: Type.Object({ message: Type.String() }),
  },
};
