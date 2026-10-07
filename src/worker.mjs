import nextWorker from "../.open-next/worker.js";

export { AgentTaskWorkflow } from "./lib/agents/workflow.ts";

export default {
  fetch(request, env, ctx) {
    return nextWorker.fetch(request, env, ctx);
  },
};
