const fs = require("fs");
if (fs.existsSync("src/lib/agents/runner.ts")) {
  let text = fs.readFileSync("src/lib/agents/runner.ts", "utf8");
  text = text.replace(/if \(process\.env\.OPENAI_API_KEY\).*?;\n/, ''); // remove openai priority
  fs.writeFileSync("src/lib/agents/runner.ts", text);
}