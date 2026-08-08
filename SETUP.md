# RelayOS Local Setup Guide

Follow this guide to get the RelayOS platform running locally on your machine.

## Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: v18 or newer (v20+ recommended)
- **pnpm**: v9 or newer (run `npm install -g pnpm`)
- **PostgreSQL**: v14+ running locally (or via Docker)
- **Redis**: v6+ running locally (or via Docker)

## 1. Install Dependencies

In the root of the Turborepo, install all monorepo dependencies:

```bash
pnpm install
```

## 2. Environment Variables

We need to provide configuration to the various apps. An example environment file is provided in the root directory.

```bash
cp .env.example .env
```

Ensure the following default values in `.env` match your local setup:
- `DATABASE_URL`: Defaults to `postgresql://postgres:postgres@localhost:5432/workflow_engine` (update username/password if needed).
- `REDIS_URL`: Defaults to `redis://localhost:6379`.

## 3. Database Migration

Set up your PostgreSQL database schema by running the Drizzle migrations located in `packages/db`:

```bash
cd packages/db
pnpm db:generate
pnpm db:migrate
```

*Note: Depending on how `packages/db` is configured, you might just run `pnpm db:push` for local development iterations.*

## 4. Run the Platform

RelayOS uses Turborepo to orchestrate starting multiple services concurrently. You can start all required services at once from the root directory:

```bash
pnpm dev
```

Alternatively, you can run services individually using filters:

```bash
# Run the Platform API
pnpm turbo dev --filter=platform-api

# Run the Ingestion Service
pnpm turbo dev --filter=ingestion-service

# Run the Workflow Engine Worker
pnpm turbo dev --filter=workflow-service

# Run the Tool Runtime Server
pnpm turbo dev --filter=tool-runtime
```

## 5. Running Tests

To verify your installation and ensure all services are functioning as expected:

```bash
pnpm test
```

For type checking across the entire monorepo:

```bash
pnpm check-types
```
