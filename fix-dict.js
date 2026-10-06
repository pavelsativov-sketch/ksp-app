const fs = require("fs");
let text = fs.readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
text = text.replace(/PLACEHOLDER-TMP/g, "placeholder");
fs.writeFileSync("src/lib/i18n/dictionaries.ts", text);
console.log("Fixed");