const fs = require("fs");
if (fs.existsSync("src/app/school/workspace/page.tsx")) {
  let text = fs.readFileSync("src/app/school/workspace/page.tsx", "utf8");
  text = text.replace(/className="w-full h-full/g, 'className="absolute inset-0 w-full h-full z-50');
  fs.writeFileSync("src/app/school/workspace/page.tsx", text);
}