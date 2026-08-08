# 1. Selection of Fastify and TypeBox for API Services

Date: 2026-08-08

## Status

Accepted

## Context

We need to build robust, scalable, and type-safe backend services for RelayOS, specifically for the Platform API (`apps/api`) and the Ingestion Service (`apps/ingestion-service`). 
The framework chosen must handle high concurrency, provide excellent developer experience (DX) with TypeScript, and enforce strict payload validation to maintain system integrity.

## Decision

We have decided to use **Fastify** as our web framework and **TypeBox** for JSON schema validation and TypeScript type inference.

### Why Fastify?
- **Performance:** Fastify is one of the fastest Node.js web frameworks, which is crucial for our high-throughput Ingestion Service.
- **Ecosystem:** It provides a rich plugin ecosystem (e.g., `@fastify/cors`, `@fastify/rate-limit`, `@fastify/swagger`) that allows us to compose applications quickly.
- **Encapsulation:** Fastify's plugin architecture provides context encapsulation, making it easier to structure large applications like our Platform API without cross-contamination of state or routes.

### Why TypeBox?
- **Single Source of Truth:** TypeBox allows us to define our schemas once and derive both the JSON Schema (used by Fastify's internal Ajv compiler for runtime validation) and TypeScript types from them.
- **Integration:** Fastify natively supports TypeBox via `@fastify/type-provider-typebox`.

## Consequences

- **Positive:** We get massive performance benefits and guarantee that runtime payloads perfectly match our TypeScript types. Development is sped up by avoiding writing duplicate interfaces and validation logic.
- **Negative/Risk:** Developers coming from Express or NestJS might have a slight learning curve adapting to Fastify's hook system and plugin encapsulation model. We must enforce strict usage of the TypeBox provider to ensure consistency.
