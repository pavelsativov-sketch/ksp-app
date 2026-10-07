import nextWorker from "../.open-next/worker.js";
import { runWithMongoRequest } from "./lib/mongo-request-context.ts";

export { AgentTaskWorkflow } from "./lib/agents/workflow.ts";

export default {
  fetch(request, env, ctx) {
    return runWithMongoRequest(() => nextWorker.fetch(request, env, ctx));
  },
};
