import { db } from "@relayos/db/client";
import { approvals } from "@relayos/db/schema";
import type { StepHandler, StepHandlerResult } from "./types.js";
import { callTool } from "./call-tool.js";
import {
  callAgentPlan,
  type ToolDefinition,
  type IterationEntry,
} from "../../services/agent-service-client.js";
import {
  getIterationHistory,
  updateIterationHistory,
} from "../context-manager.js";

const DEFAULT_MAX_ITERATIONS = 10;

export class AiPlanMaxIterationsError extends Error {
  constructor(stepId: string, max: number) {
    super(
      `AI_PLAN step "${stepId}" exceeded maxIterations (${max}) without completing`,
    );
    this.name = "AiPlanMaxIterationsError";
  }
}

interface AiPlanConfig {
  goal: string;
  availableTools: ToolDefinition[];
}

function validateConfig(config: Record<string, unknown>): AiPlanConfig {
  const { goal, availableTools } = config as Partial<AiPlanConfig>;
  if (!goal || typeof goal !== "string") {
    throw new Error("AI_PLAN step config must include a non-empty 'goal' string");
  }
  if (!Array.isArray(availableTools)) {
    throw new Error("AI_PLAN step config must include an 'availableTools' array");
  }
  return { goal, availableTools };
}

function buildContextForAgent(
  executionContext: import("../../types/execution-context.js").ExecutionContext,
): Record<string, unknown> {
  return {
    triggerPayload: executionContext.triggerPayload,
    completedSteps: executionContext.steps
      .filter((s) => s.output !== null)
      .map((s) => ({ stepId: s.stepId, output: s.output })),
  };
}

export const handleAiPlan: StepHandler = async (
  step,
  context,
): Promise<StepHandlerResult> => {
  const config = validateConfig(step.config);
  const maxIterations =
    typeof step.maxIterations === "number"
      ? step.maxIterations
      : DEFAULT_MAX_ITERATIONS;

  let iterationHistory: IterationEntry[] = await getIterationHistory(
    context.executionId,
    step.id,
  );

  let iterationCount = iterationHistory.filter(
    (e) => e.action === "tool_call",
  ).length;

  const agentContext = buildContextForAgent(context);

  while (true) {
    if (iterationCount >= maxIterations) {
      throw new AiPlanMaxIterationsError(step.id, maxIterations);
    }

    const decision = await callAgentPlan({
      goal: config.goal,
      context: agentContext,
      availableTools: config.availableTools,
      memories: [],
      iterationHistory,
    });

    if (decision.action === "complete") {
      return {
        output: { summary: decision.summary, reasoning: decision.reasoning },
      };
    }

    if (decision.action === "request_approval") {
      const stepContext = {
        stepName: step.name,
        triggerPayload: context.triggerPayload,
        completedSteps: context.steps.map((s) => s.stepId),
        message: decision.message,
      };

      await db.insert(approvals).values({
        executionId: context.executionId,
        stepId: step.id,
        prompt: decision.message,
        context: stepContext,
        status: "PENDING",
      });

      await updateIterationHistory(
        context.executionId,
        step.id,
        iterationHistory,
      );

      return {
        output: { awaiting: "APPROVAL", stepId: step.id },
        pause: true,
      };
    }

    const toolResult = await callTool(
      decision.tool,
      decision.input,
      context.executionId,
    );

    iterationHistory = [
      ...iterationHistory,
      {
        action: "tool_call",
        tool: decision.tool,
        input: decision.input,
        result: toolResult.output,
        reasoning: decision.reasoning,
      },
    ];

    iterationCount++;

    await updateIterationHistory(
      context.executionId,
      step.id,
      iterationHistory,
    );
  }
};
