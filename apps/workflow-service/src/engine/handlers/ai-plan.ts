import { Queue } from "bullmq";
import { db } from "@relayos/db/client";
import { approvals } from "@relayos/db/schema";
import { QUEUES, bullmqRedis } from "@relayos/queue";
import type { MemoryEmbedJob } from "@relayos/queue";
import type { StepHandler, StepHandlerResult } from "./types.js";
import {
  callTool,
  ToolCallError,
  ToolRuntimeUnreachableError,
} from "./call-tool.js";
import {
  callAgentPlan,
  type ToolDefinition,
  type IterationEntry,
} from "../../services/agent-service-client.js";
import {
  getIterationHistory,
  updateIterationHistory,
} from "../context-manager.js";
import { recall } from "../../memory/memory-service.js";
import { createLogger } from "@relayos/lib/logger";

const log = createLogger({ component: "ai-plan-handler" });

const DEFAULT_MAX_ITERATIONS = 10;
const MEMORY_RECALL_TOP_K = 5;

const memoryEmbedQueue = new Queue<MemoryEmbedJob>(QUEUES.MEMORY_EMBED, {
  connection: bullmqRedis,
});

export class AiPlanMaxIterationsError extends Error {
  constructor(
    stepId: string,
    max: number,
    public readonly iterationHistory: IterationEntry[],
  ) {
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
    throw new Error(
      "AI_PLAN step config must include a non-empty 'goal' string",
    );
  }
  if (!Array.isArray(availableTools)) {
    throw new Error(
      "AI_PLAN step config must include an 'availableTools' array",
    );
  }
  return { goal, availableTools };
}

function buildContextForAgent(
  executionContext: import("@relayos/types").ExecutionContext,
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

  const stepLog = log.child({
    executionId: context.executionId,
    stepId: step.id,
  });

  while (true) {
    if (iterationCount >= maxIterations) {
      throw new AiPlanMaxIterationsError(step.id, maxIterations, iterationHistory);
    }

    const memories = await recall(
      config.goal,
      context.executionId,
      context.projectId,
      MEMORY_RECALL_TOP_K,
    );

    const decision = await callAgentPlan({
      goal: config.goal,
      context: agentContext,
      availableTools: config.availableTools,
      memories,
      iterationHistory,
    });

    if (decision.action === "complete") {
      stepLog.info(
        { action: "complete", iterationCount },
        "Agent decision: complete",
      );
      return {
        output: {
          summary: decision.summary,
          reasoning: decision.reasoning,
          iterationHistory,
        },
      };
    }

    if (decision.action === "request_approval") {
      stepLog.info(
        {
          action: "request_approval",
          iterationCount,
          message: decision.message,
        },
        "Agent decision: request_approval",
      );

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
        output: {
          awaiting: "APPROVAL",
          stepId: step.id,
          iterationHistory,
        },
        pause: true,
      };
    }

    stepLog.info(
      {
        action: "tool_call",
        tool: decision.tool,
        iterationCount,
        reasoning: decision.reasoning,
      },
      "Agent decision: tool_call",
    );

    let toolResult: Awaited<ReturnType<typeof callTool>>;
    try {
      toolResult = await callTool(
        decision.tool,
        decision.input,
        context.executionId,
      );
    } catch (toolError) {
      const isExpected =
        toolError instanceof ToolCallError ||
        toolError instanceof ToolRuntimeUnreachableError;

      const errorMessage =
        toolError instanceof Error ? toolError.message : String(toolError);

      stepLog.warn(
        {
          tool: decision.tool,
          error: errorMessage,
          iterationCount,
          expected: isExpected,
        },
        "Tool call failed — feeding error back to agent",
      );

      iterationHistory = [
        ...iterationHistory,
        {
          action: "tool_call",
          tool: decision.tool,
          input: decision.input,
          result: { error: errorMessage },
          reasoning: decision.reasoning,
        },
      ];

      iterationCount++;
      await updateIterationHistory(
        context.executionId,
        step.id,
        iterationHistory,
      );
      continue;
    }

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

    const memorySummary = `Tool: ${decision.tool}\nInput: ${JSON.stringify(decision.input)}\nResult: ${JSON.stringify(toolResult.output)}`;
    await memoryEmbedQueue.add("embed", {
      content: memorySummary,
      scope: "EXECUTION",
      executionId: context.executionId,
      projectId: context.projectId,
      sourceStepId: step.id,
    });
  }
};
