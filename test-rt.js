const { dictionaries } = require("./src/lib/i18n/dictionaries.js") || require("ts-node").register() && require("./src/lib/i18n/dictionaries.ts");
console.log("t.nav =", dictionaries.ru.nav);