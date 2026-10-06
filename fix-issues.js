const fs = require("fs");

// Fix 1: src/app/api/agents/task/route.ts (Authentication)
const taskRoutePath = "src/app/api/agents/task/route.ts";
if (fs.existsSync(taskRoutePath)) {
  let text = fs.readFileSync(taskRoutePath, "utf8");
  // Ensure requireApiAuth is imported
  if (!text.includes("requireApiAuth")) {
    text = "import { requireApiAuth } from '@/lib/api-auth';\n" + text;
  }
  
  // Replace the POST handler content
  text = text.replace(
    /export async function POST\(req: Request\) \{[\s\S]*?\}/,
    `export async function POST(req: Request) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;

    const { schoolId, prompt } = await req.json();

    if (!schoolId || !prompt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const taskId = await startAgentTask(user.id, schoolId, prompt);

    return NextResponse.json({ taskId }, { status: 201 });
  } catch (error: any) {
    console.error('Error starting agent task:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}`
  );
  fs.writeFileSync(taskRoutePath, text);
}

// Fix 2: src/app/api/agents/task/[id]/route.ts (Next.js 16 params)
const sseRoutePath = "src/app/api/agents/task/[id]/route.ts";
if (fs.existsSync(sseRoutePath)) {
  let text = fs.readFileSync(sseRoutePath, "utf8");
  text = text.replace(
    /export async function GET\(req: Request, \{ params \}: \{ params: \{ id: string \} \}\) \{[\s\S]*?const taskId = params\.id;/,
    `import { RouteContext } from '@/lib/types/ksp'; // fallback if needed, but we can just use Promise
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await props.params;`
  );
  // Also remove the extra import if we injected it
  text = text.replace(/import { RouteContext } from '@\/lib\/types\/ksp'; \/\/ fallback if needed, but we can just use Promise\n/, "");
  fs.writeFileSync(sseRoutePath, text);
}