const fs = require("fs");
const files = [
  "src/lib/agents/orchestrator.ts",
  "src/lib/agents/runner.ts",
  "src/app/api/agents/task/[id]/route.ts",
  "src/app/api/workspace/files/route.ts"
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let text = fs.readFileSync(file, "utf8");
    text = text.replace(/import\s*\{\s*tryDb,\s*COL\s*\}\s*from\s*["']@\/lib\/mongo["'];/g, 'import { getDb, COL } from "@/lib/mongo";');
    text = text.replace(/tryDb\(\)\.collection\(COL\.(\w+) === undefined \? '(\w+)' : COL\.(\w+)\)/g, '(await getDb()).collection(COL.$1 === undefined ? "$1" : (COL as any).$1)');
    // Some typo fixes:
    text = text.replace(/COL\.agent_tasks/g, 'COL.agentTasks');
    text = text.replace(/COL\.agent_executions/g, 'COL.agentExecutions');
    text = text.replace(/COL\.workspace_files/g, 'COL.workspaceFiles');
    fs.writeFileSync(file, text);
  }
}