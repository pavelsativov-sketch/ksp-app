import nextWorker from "../.open-next/worker.js";
import { closeMongoRequest, createMongoRequestState, runWithMongoRequest } from "./lib/mongo-request-context.ts";

export { AgentTaskWorkflow } from "./lib/agents/workflow.ts";

function scheduleMongoClose(requestState) {
  if (!requestState?.clientPromise) return;
  void closeMongoRequest(requestState);
}

export default {
  fetch(request, env, ctx) {
    const requestState = createMongoRequestState();
    const scopedEnv = Object.create(env);
    Object.defineProperty(scopedEnv, "MONGO_REQUEST_STATE", { value: requestState, enumerable: true });
    return runWithMongoRequest(async () => {
      try {
        const response = await nextWorker.fetch(request, scopedEnv, ctx);
        if (!response.body) {
          scheduleMongoClose(requestState);
          return response;
        }
        const reader = response.body.getReader();
        return new Response(new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                scheduleMongoClose(requestState);
                controller.close();
              } else {
                controller.enqueue(value);
              }
            } catch (error) {
              scheduleMongoClose(requestState);
              controller.error(error);
            }
          },
          async cancel(reason) {
            try { await reader.cancel(reason); }
            finally { scheduleMongoClose(requestState); }
          },
        }), { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) {
        scheduleMongoClose(requestState);
        throw error;
      }
    }, requestState);
  },
};
