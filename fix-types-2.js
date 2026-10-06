const fs = require("fs");

// Fix store parameter types
if (fs.existsSync("src/lib/store/workspace.ts")) {
  let store = fs.readFileSync("src/lib/store/workspace.ts", "utf8");
  store = store.replace(/\(w =>/g, '(w: WindowState =>');
  store = store.replace(/w =>/g, '(w: WindowState) =>');
  fs.writeFileSync("src/lib/store/workspace.ts", store);
}

// Fix school.ts
if (fs.existsSync("src/lib/school.ts")) {
  let text = fs.readFileSync("src/lib/school.ts", "utf8");
  text = text.replace(/const schoolIds = schools\.map\(s => s\._id\)\.filter\(\(id\): id is ObjectId => id !== undefined\);/g, 'const schoolIds = schools.map(s => s._id).filter(id => id !== undefined) as any;');
  // Also try catching the original pattern if my last regex didn't match
  text = text.replace(/const schoolIds = schools\.map\(s => s\._id\);/g, 'const schoolIds = schools.map(s => s._id).filter(id => id !== undefined) as any;');
  fs.writeFileSync("src/lib/school.ts", text);
}

// Fix dictionaries.ts
if (fs.existsSync("src/lib/i18n/dictionaries.ts")) {
  let text = fs.readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
  // Remove the school: ru.school inside ru
  text = text.replace(/school:\s*ru\.school,\s*planEditor:\s*ru\.planEditor,/g, '');
  fs.writeFileSync("src/lib/i18n/dictionaries.ts", text);
}