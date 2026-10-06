import "dotenv/config";
import { generateKsp } from "./src/lib/ai/generate";

async function run() {
  console.log("Generating KSP via Gemini...");
  const t0 = Date.now();
  const ksp = await generateKsp({
    grade: 5,
    subject: "Математика",
    topic: "Сложение дробей",
    language: "ru"
  });
  console.log("Time:", Date.now() - t0, "ms");
  
  let totalLength = 0;
  totalLength += (ksp.stages.beginning.teacherActions || "").length;
  totalLength += (ksp.stages.middle.teacherActions || "").length;
  totalLength += (ksp.stages.end.teacherActions || "").length;
  
  console.log("Teacher actions total length:", totalLength);
  console.log("Sample middle stage teacher actions:");
  console.log(ksp.stages.middle.teacherActions);
}
run();
