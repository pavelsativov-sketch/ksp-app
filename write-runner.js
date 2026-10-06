const fs = require("fs");
const runnerContent = `
import { ObjectId } from 'mongodb';
import { getDb, COL } from '@/lib/mongo';
import { tools } from './tools';
import OpenAI from 'openai';

function getAgentClient() {
  if (process.env.OPENAI_API_KEY) return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), model: 'gpt-4o' };
  if (process.env.GEMINI_API_KEY) return { client: new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' }), model: 'gemini-1.5-pro' };
  if (process.env.GROQ_API_KEY) return { client: new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }), model: 'llama3-groq-70b-8192-tool-use-preview' };
  throw new Error('No API key configured for Agent');
}

export async function runAgentTask(taskId: string, prompt: string) {
  const agentTasks = await (await getDb()).collection(COL.agentTasks === undefined ? 'agentTasks' : (COL as any).agentTasks);
  const agentExecutions = await (await getDb()).collection(COL.agentExecutions === undefined ? 'agentExecutions' : (COL as any).agentExecutions);

  try {
    await logExecution(agentExecutions, taskId, 'START', 'Agent initialized', { prompt });

    const { client, model } = getAgentClient();

    let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are an autonomous AI Agent in Mektep OS (a virtual school OS). You have access to tools to execute terminal commands, and browse. Think step by step. Call tools to accomplish the user goal.' },
      { role: 'user', content: prompt }
    ];

    let isDone = false;
    let loops = 0;
    const MAX_LOOPS = 10;

    while (!isDone && loops < MAX_LOOPS) {
      loops++;
      await logExecution(agentExecutions, taskId, 'THINK', \`Thinking (Step \${loops})...\`);

      const response = await client.chat.completions.create({
        model,
        messages,
        tools: [
          { type: 'function', function: { name: 'executeCommand', description: 'Run a terminal command', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
          { type: 'function', function: { name: 'browserNavigate', description: 'Navigate to URL', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
          { type: 'function', function: { name: 'finishTask', description: 'Mark the task as complete', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } }
        ],
        tool_choice: 'auto'
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (message.content) {
        await logExecution(agentExecutions, taskId, 'REASONING', message.content);
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          await logExecution(agentExecutions, taskId, 'TOOL_CALL', \`Using \${toolCall.function.name}\`, args);

          let resultStr = '';
          try {
            if (toolCall.function.name === 'executeCommand') {
              const res = await tools.executeCommand(args);
              resultStr = JSON.stringify(res);
            } else if (toolCall.function.name === 'browserNavigate') {
              const res = await tools.navigateBrowser(args);
              resultStr = JSON.stringify(res);
            } else if (toolCall.function.name === 'finishTask') {
              resultStr = JSON.stringify({ success: true, message: 'Finished' });
              isDone = true;
              await logExecution(agentExecutions, taskId, 'END', 'Task completed', args);
            } else {
              resultStr = JSON.stringify({ error: 'Unknown tool' });
            }
          } catch (e: any) {
            resultStr = JSON.stringify({ error: e.message });
          }

          await logExecution(agentExecutions, taskId, 'TOOL_RESULT', \`Result of \${toolCall.function.name}\`, { result: resultStr });
          
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultStr
          });
        }
      } else {
        isDone = true;
        await logExecution(agentExecutions, taskId, 'END', 'Task completed without specific finish tool', { result: message.content });
      }
    }

    if (!isDone) {
      await logExecution(agentExecutions, taskId, 'WARNING', 'Max loops reached. Stopping.');
    }

    await agentTasks.updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { status: 'completed', updatedAt: new Date() } }
    );

  } catch (error: any) {
    await agentTasks.updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { status: 'failed', error: error.message, updatedAt: new Date() } }
    );
    await logExecution(agentExecutions, taskId, 'ERROR', 'Agent crashed', { error: error.message });
  }
}

async function logExecution(collection: any, taskId: string, type: string, message: string, data?: any) {
  await collection.insertOne({
    taskId: new ObjectId(taskId),
    type,
    message,
    data,
    timestamp: new Date()
  });
}
`;
fs.writeFileSync('src/lib/agents/runner.ts', runnerContent);