export class CompensationInputResolutionError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`Cannot resolve compensation input path "${path}": ${reason}`);
    this.name = "CompensationInputResolutionError";
  }
}

function resolvePath(path: string, root: unknown): unknown {
  if (!path.startsWith("$.")) {
    throw new CompensationInputResolutionError(
      path,
      'path must start with "$."',
    );
  }

  const segments = path.slice(2).split(".");

  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      throw new CompensationInputResolutionError(
        path,
        `encountered null/undefined at segment "${segment}"`,
      );
    }
    if (typeof current !== "object" || Array.isArray(current)) {
      throw new CompensationInputResolutionError(
        path,
        `expected an object at segment "${segment}", got ${Array.isArray(current) ? "array" : typeof current}`,
      );
    }
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) {
      throw new CompensationInputResolutionError(
        path,
        `field "${segment}" not found`,
      );
    }
  }

  return current;
}

export function resolveCompensationInput(
  mapping: Record<string, string>,
  stepOutput: unknown,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, path] of Object.entries(mapping)) {
    result[key] = resolvePath(path, stepOutput);
  }

  return result;
}
