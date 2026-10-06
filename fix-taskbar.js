const fs = require("fs");
let text = fs.readFileSync("src/components/workspace/taskbar.tsx", "utf8");
text = text.replace(/url: '\/school'/g, "url: '/school/dashboard'");
fs.writeFileSync("src/components/workspace/taskbar.tsx", text);