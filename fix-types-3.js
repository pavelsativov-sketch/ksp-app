const fs = require("fs");
if (fs.existsSync("src/lib/store/workspace.ts")) {
  let store = fs.readFileSync("src/lib/store/workspace.ts", "utf8");
  store = store.replace(/\(w: WindowState =>/g, '(w: WindowState) =>');
  fs.writeFileSync("src/lib/store/workspace.ts", store);
}