import { registerTool } from "./registry.js";

registerTool("sayHello", async (input) => {
  const message = typeof input["message"] === "string" ? input["message"] : "Hello!";
  return { output: { reply: `sayHello received: "${message}"` } };
});
