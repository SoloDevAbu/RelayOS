# 2. Decoupling the Ingestion Service from the Platform API

Date: 2026-08-08

## Status

Accepted

## Context

RelayOS needs to handle inbound workflow triggers via API calls from external users and systems. 
Initially, it might seem simpler to place the `/trigger` endpoints directly within the Platform API (`apps/api`). However, the workload profile for triggering workflows is vastly different from standard CRUD operations (like managing projects or viewing dashboard stats).

## Decision

We have decided to extract the trigger endpoints into a dedicated, thin **Ingestion Service** (`apps/ingestion-service`).

The Ingestion Service has exactly two responsibilities:
1. **Validate:** Check the incoming API key (via `api-key-lookup.ts`) and validate the payload schema.
2. **Enqueue:** Push the validated payload into a message queue (BullMQ, via `enqueue-execution.ts`).

It does **not** execute workflows, perform heavy database writes, or serve dashboard reads.

## Consequences

- **High Availability:** The Ingestion Service can be scaled independently of the Platform API. Spikes in workflow triggers won't degrade the performance of the UI/Dashboard.
- **Failure Isolation:** If the workflow execution engine or the Platform API goes down, the Ingestion Service can continue to accept and queue incoming requests, ensuring no data loss.
- **Simplicity:** The service remains extremely thin, allowing us to enforce strict limits (like a 1MB body limit) specifically tailored to triggers.
- **Complexity:** This introduces an additional service to deploy and monitor, and requires relying on Redis/BullMQ as the communication layer between ingestion and execution.
