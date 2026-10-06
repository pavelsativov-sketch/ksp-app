import JSZip from "jszip";
import { readFileSync } from "node:fs";

const zip = await JSZip.loadAsync(readFileSync(".tmp-docx-qa/sample-kz.docx"));
const docs = Object.values(zip.files).filter((f) => !f.dir && /^word\/(?:document|footer\d+)\.xml$/.test(f.name));
const text = (await Promise.all(docs.map((f) => f.async("string")))).join("\n");
const expected = ["Оқушының аты-жөні", "Тапсырма", "Таратылатын сөздер", "Сәйкестендіріңіз", "Мұғалімге арналған жауаптар", "Дескрипторлар мен баллдар", "Бет "];
const missing = expected.filter((s) => !text.includes(s));
console.log(missing.length ? `Missing Kazakh labels: ${missing.join(", ")}` : `DOCX XML labels verified (${expected.length}); pages in DOCX package: ${Object.keys(zip.files).filter((name) => name.startsWith("word/" ) && name.includes("document.xml")).length}`);
process.exitCode = missing.length ? 1 : 0;
