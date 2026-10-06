const fs = require("fs");
if (fs.existsSync("src/lib/agents/runner.ts")) {
  let text = fs.readFileSync("src/lib/agents/runner.ts", "utf8");
  text = text.replace(/model: 'gemini-1\.5-pro'/g, "model: 'gemini-3.8-flash'");
  fs.writeFileSync("src/lib/agents/runner.ts", text);
}