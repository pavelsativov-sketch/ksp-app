import nextWorker from "../.open-next/worker.js";
import { closeMongoRequest, mongoRequestState, runWithMongoRequest } from "./lib/mongo-request-context.ts";

export { AgentTaskWorkflow } from "./lib/agents/workflow.ts";

async function closeAfterResponse(response, requestState) {
  const body = response.body;
  if (!body) {
    await closeMongoRequest(requestState);
    return response;
  }

  const reader = body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await closeMongoRequest(requestState);
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        await closeMongoRequest(requestState);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await closeMongoRequest(requestState);
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export default {
  fetch(request, env, ctx) {
    return runWithMongoRequest(async () => {
      const requestState = mongoRequestState();
      try {
        const response = await nextWorker.fetch(request, env, ctx);
        return closeAfterResponse(response, requestState);
      } catch (error) {
        await closeMongoRequest(requestState);
        throw error;
      }
    });
  },
};
