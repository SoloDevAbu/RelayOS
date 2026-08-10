import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import errorHandlerPlugin from "./error-handler.js";

describe("error-handler plugin", () => {
  let app: any;

  beforeEach(async () => {
    // Note: To capture logger calls if needed, we could mock the logger, 
    // but for now we just disable it to avoid noisy test output.
    app = Fastify({
      logger: false,
    });

    // Mock the config dependency
    app.decorate("config", {
      NODE_ENV: "development",
    });

    // Register dummy config plugin to satisfy dependencies
    await app.register(fp(async () => {}, { name: "config" }));
    await app.register(errorHandlerPlugin);
  });

  afterEach(async () => {
    await app.close();
  });

  it("handles 404 Not Found", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/does-not-exist",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      error: "Not Found",
      message: "Route GET /does-not-exist not found",
    });
  });

  it("handles validation errors (400)", async () => {
    app.post(
      "/test",
      {
        schema: {
          body: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
            },
          },
        },
      },
      async () => ({ ok: true })
    );

    const response = await app.inject({
      method: "POST",
      url: "/test",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      statusCode: 400,
      error: "Validation Error",
      message: "Validation failed on body",
      details: [
        {
          field: "name",
          message: "must have required property 'name'",
          keyword: "required",
        },
      ],
    });
  });

  it("handles internal server errors (500)", async () => {
    app.get("/boom", async () => {
      throw new Error("Secret database crash");
    });

    const response = await app.inject({
      method: "GET",
      url: "/boom",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      error: "INTERNAL_ERROR",
      message: "Secret database crash",
    });
  });

  it("hides 500 error messages in production", async () => {
    app.config.NODE_ENV = "production";

    app.get("/boom2", async () => {
      throw new Error("Secret database crash");
    });

    const response = await app.inject({
      method: "GET",
      url: "/boom2",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      error: "INTERNAL_ERROR",
      message: "Internal Server Error",
    });
  });

  it("handles custom client errors (< 500)", async () => {
    app.get("/custom", async () => {
      const err: any = new Error("Custom conflict");
      err.statusCode = 409;
      err.code = "CONFLICT_ERROR";
      throw err;
    });

    const response = await app.inject({
      method: "GET",
      url: "/custom",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      statusCode: 409,
      error: "CONFLICT_ERROR",
      message: "Custom conflict",
    });
  });
});
