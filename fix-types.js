const fs = require("fs");

function replaceInFile(path, regex, replacement) {
  if (fs.existsSync(path)) {
    let text = fs.readFileSync(path, "utf8");
    text = text.replace(regex, replacement);
    fs.writeFileSync(path, text);
  }
}

// Fix getCollection in agents API
const getColRegex = /import\s*\{\s*getCollection\s*\}\s*from\s*['"]@\/lib\/mongo['"];/g;
const getColRepl = `import { tryDb, COL } from "@/lib/mongo";`;
const useColRegex = /getCollection\(['"]([\w_]+)['"]\)/g;
const useColRepl = `tryDb().collection(COL.$1 === undefined ? '$1' : COL.$1)`;

replaceInFile("src/lib/agents/orchestrator.ts", getColRegex, getColRepl);
replaceInFile("src/lib/agents/orchestrator.ts", useColRegex, useColRepl);
replaceInFile("src/lib/agents/runner.ts", getColRegex, getColRepl);
replaceInFile("src/lib/agents/runner.ts", useColRegex, useColRepl);
replaceInFile("src/app/api/agents/task/[id]/route.ts", getColRegex, getColRepl);
replaceInFile("src/app/api/agents/task/[id]/route.ts", useColRegex, useColRepl);
replaceInFile("src/app/api/workspace/files/route.ts", getColRegex, getColRepl);
replaceInFile("src/app/api/workspace/files/route.ts", useColRegex, useColRepl);

// Fix store parameter types
if (fs.existsSync("src/lib/store/workspace.ts")) {
  let store = fs.readFileSync("src/lib/store/workspace.ts", "utf8");
  store = store.replace(/\bset\b/g, 'set: any');
  store = store.replace(/\bget\b/g, 'get: any');
  store = store.replace(/\(id\)/g, '(id: string)');
  store = store.replace(/\(id, title, type\)/g, '(id: string, title: string, type: string)');
  store = store.replace(/\(w\)/g, '(w: any)');
  store = store.replace(/\(state\)/g, '(state: any)');
  fs.writeFileSync("src/lib/store/workspace.ts", store);
}