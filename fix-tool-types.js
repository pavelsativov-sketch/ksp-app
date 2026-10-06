const fs = require("fs");
if (fs.existsSync("src/lib/agents/runner.ts")) {
  let text = fs.readFileSync("src/lib/agents/runner.ts", "utf8");
  text = text.replace(/toolCall\.function/g, '(toolCall as any).function');
  fs.writeFileSync("src/lib/agents/runner.ts", text);
}