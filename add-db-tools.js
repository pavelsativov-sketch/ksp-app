const fs = require("fs");
if (fs.existsSync("src/lib/agents/runner.ts")) {
  let text = fs.readFileSync("src/lib/agents/runner.ts", "utf8");
  
  // Add tools to JSON schema array
  text = text.replace(/name: 'readFile'.*?\}\s*\}\s*\},/, `name: 'readFile', description: 'Read a file', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
          { type: 'function', function: { name: 'createLessonPlan', description: 'Create a lesson plan (KSP) in the database', parameters: { type: 'object', properties: { subject: { type: 'string' }, grade: { type: 'string' }, topic: { type: 'string' }, content: { type: 'string' } }, required: ['subject', 'grade', 'topic', 'content'] } } },
          { type: 'function', function: { name: 'getAttendanceRisks', description: 'Analyze attendance to find risky classes', parameters: { type: 'object', properties: {}, required: [] } } },`);

  // Add execution block
  text = text.replace(/else if \(toolCall\.function\.name === 'readFile'\) \{([\s\S]*?)\} else if \(toolCall\.function\.name === 'finishTask'\)/, `else if (toolCall.function.name === 'readFile') {
              $1
            } else if (toolCall.function.name === 'createLessonPlan') {
              const res = await tools.createLessonPlan({ ...args, schoolId: 'demo' });
              resultStr = JSON.stringify(res);
            } else if (toolCall.function.name === 'getAttendanceRisks') {
              const res = await tools.getAttendanceRisks({ schoolId: 'demo' });
              resultStr = JSON.stringify(res);
            } else if (toolCall.function.name === 'finishTask')`);

  fs.writeFileSync("src/lib/agents/runner.ts", text);
}