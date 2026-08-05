import { afterAll, beforeAll } from "vitest";

// Start Postgres + Redis containers before integration tests run,
// then inject connection strings into process.env so app code picks them up.
// Teardown happens automatically via afterAll.
beforeAll(async () => {
  // TODO: spin up @testcontainers/postgresql and @testcontainers/redis here
  // and write DATABASE_URL / REDIS_URL into process.env.
});

afterAll(async () => {
  // TODO: stop containers
});
