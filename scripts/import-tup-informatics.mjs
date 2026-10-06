#!/usr/bin/env node
/**
 * Creates a local, versioned fallback from the current TUP Word documents.
 * The public site will become the primary source once its address is configured.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const root = path.resolve(import.meta.dirname, "..");
const downloads = path.resolve(process.env.USERPROFILE ?? "C:\\Users\\PC", "Downloads");
const sources = [
  { file: "ТУП  1-4кл.docx", profile: "all" },
  { file: "ТУП 5-9 кл.docx", profile: "all" },
  { file: "ТУП 10-11 кл ЕМН.docx", profile: "emn" },
  { file: "ТУП 10-11 кл ОГН.docx", profile: "ogn" },
];

function xmlText(xml) {
  return xml
    .replace(/<w:tab[^>]*\/>/g, " ")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, " ");
}

function clean(text) {
  return text.replace(/\s+/g, " ").replace(/\s+([;,.])/g, "$1").trim();
}

async function objectivesFromDoc(file, profile) {
  const source = path.join(downloads, file);
  if (!fs.existsSync(source)) throw new Error(`Missing source document: ${source}`);
  const zip = await JSZip.loadAsync(fs.readFileSync(source));
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error(`word/document.xml missing in ${file}`);
  const text = xmlText(xml);
  const marker = text.search(/Система целей обучения/i);
  const section = marker >= 0 ? text.slice(marker) : text;
  const pattern = /((?:1[01]|[1-9])\.\d+\.\d+\.\d+)\s+([\s\S]*?)(?=(?:1[01]|[1-9])\.\d+\.\d+\.\d+\s+|$)/g;
  const rows = [];
  for (const match of section.matchAll(pattern)) {
    const code = match[1];
    const grade = Number(code.split(".")[0]);
    if (profile === "all" ? grade > 9 : grade < 10) continue;
    const description = clean(match[2])
      .replace(/\s*\|\s*/g, " ")
      .replace(/Параграф[\s\S]*$/i, "")
      .trim();
    if (description.length < 8 || description.length > 1200) continue;
    rows.push({ code, grade, text_ru: description, profile });
  }
  return rows;
}

const all = (await Promise.all(sources.map((source) => objectivesFromDoc(source.file, source.profile)))).flat();
const unique = Array.from(new Map(all.map((row) => [`${row.profile}:${row.code}`, row])).values())
  .sort((a, b) => a.profile.localeCompare(b.profile) || a.code.localeCompare(b.code, "ru", { numeric: true }));
const output = path.join(root, "supabase", "data", "tup_informatics_current.json");
fs.writeFileSync(output, `${JSON.stringify(unique, null, 2)}\n`, "utf8");
console.log(`Wrote ${unique.length} current TUP objectives to ${output}`);
