import { getRedis } from "@relayos/lib/redis";
import { db } from "@relayos/db/client";
import { executions, executionSteps } from "@relayos/db/schema";
import { eq, and } from "drizzle-orm";
import type { ExecutionContext, IterationEntry, StepOutput } from "@relayos/types";

const CONTEXT_TTL_SECONDS = 3600;
const CONTEXT_KEY_PREFIX = "exec-ctx:";

function redisKey(executionId: string): string {
  return `${CONTEXT_KEY_PREFIX}${executionId}`;
}

async function buildContextFromDb(
  executionId: string,
): Promise<ExecutionContext> {
  const [execution] = await db
    .select({
      id: executions.id,
      triggerPayload: executions.triggerPayload,
    })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);

  if (!execution) {
    throw new Error(`Execution ${executionId} not found in database`);
  }

  const completedSteps = await db
    .select({
      stepId: executionSteps.stepId,
      output: executionSteps.output,
      completedAt: executionSteps.completedAt,
    })
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.executionId, executionId),
        eq(executionSteps.status, "COMPLETED"),
      ),
    );

  const steps: StepOutput[] = completedSteps.map((row) => ({
    stepId: row.stepId,
    output: row.output,
    completedAt: row.completedAt?.toISOString() ?? new Date().toISOString(),
  }));

  return {
    executionId,
    triggerPayload: execution.triggerPayload as Record<string, unknown> | null,
    steps,
  };
}

export async function getContext(
  executionId: string,
): Promise<ExecutionContext> {
  const redis = getRedis();
  const cached = await redis.get(redisKey(executionId));

  if (cached) {
    return JSON.parse(cached) as ExecutionContext;
  }

  const context = await buildContextFromDb(executionId);

  await redis.setex(
    redisKey(executionId),
    CONTEXT_TTL_SECONDS,
    JSON.stringify(context),
  );

  return context;
}

export async function updateContext(
  executionId: string,
  stepOutput: StepOutput,
): Promise<void> {
  const context = await getContext(executionId);
  context.steps.push(stepOutput);

  const redis = getRedis();
  await redis.setex(
    redisKey(executionId),
    CONTEXT_TTL_SECONDS,
    JSON.stringify(context),
  );
}

export async function deleteContext(executionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(redisKey(executionId));
}

export async function getIterationHistory(
  executionId: string,
  stepId: string,
): Promise<IterationEntry[]> {
  const context = await getContext(executionId);
  const entry = context.steps.find((s) => s.stepId === stepId);
  return entry?.iterationHistory ?? [];
}

export async function updateIterationHistory(
  executionId: string,
  stepId: string,
  history: IterationEntry[],
): Promise<void> {
  const context = await getContext(executionId);

  const existing = context.steps.find((s) => s.stepId === stepId);
  if (existing) {
    existing.iterationHistory = history;
  } else {
    context.steps.push({
      stepId,
      output: null,
      completedAt: new Date().toISOString(),
      iterationHistory: history,
    });
  }

  const redis = getRedis();
  await redis.setex(
    redisKey(executionId),
    CONTEXT_TTL_SECONDS,
    JSON.stringify(context),
  );
}
