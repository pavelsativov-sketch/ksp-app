const fs = require("fs");
if (fs.existsSync("src/lib/agents/runner.ts")) {
  let text = fs.readFileSync("src/lib/agents/runner.ts", "utf8");
  text = text.replace(/tools: \[/, `tools: [
          { type: 'function', function: { name: 'writeFile', description: 'Write a file', parameters: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' } }, required: ['filename', 'content'] } } },
          { type: 'function', function: { name: 'readFile', description: 'Read a file', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
`);
  text = text.replace(/else if \(toolCall\.function\.name === 'finishTask'\)/, `else if (toolCall.function.name === 'writeFile') {
              const res = await tools.writeFile(args);
              resultStr = JSON.stringify(res);
            } else if (toolCall.function.name === 'readFile') {
              const res = await tools.readFile(args);
              resultStr = JSON.stringify(res);
            } else if (toolCall.function.name === 'finishTask')`);
  fs.writeFileSync("src/lib/agents/runner.ts", text);
}