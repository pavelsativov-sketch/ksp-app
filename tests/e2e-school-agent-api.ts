import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { SignJWT } from "jose";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log("=== STARTING SCHOOL SYSTEM & AGENT E2E VERIFICATION ===");

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("AUTH_SECRET is missing from .env.local");
  }

  // Create JWT session for agent-e2e@mekty.dev (director of School-gymnasium #25)
  const secretKey = new TextEncoder().encode(authSecret);
  const token = await new SignJWT({
    sub: "6ac320ed8df2aaddbfe63d3b",
    sessionVersion: 0,
    email: "agent-e2e@mekty.dev",
    fullName: "Директор E2E",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);

  const cookieHeader = `ksp_session=${token}`;

  // 1. Check GET /school
  console.log("\n[Test 1] Testing GET /school ...");
  const schoolRes = await fetch(`${BASE_URL}/school`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`GET /school status: ${schoolRes.status}`);
  if (schoolRes.status !== 200) {
    throw new Error(`Expected 200 from /school, got ${schoolRes.status}`);
  }
  const schoolHtml = await schoolRes.text();
  console.log(`GET /school content length: ${schoolHtml.length} bytes`);
  console.log("✓ /school page renders successfully for teacher/director");

  // 2. Check GET /school/connectors
  console.log("\n[Test 2] Testing GET /school/connectors ...");
  const connRes = await fetch(`${BASE_URL}/school/connectors`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`GET /school/connectors status: ${connRes.status}`);
  if (connRes.status !== 200) {
    throw new Error(`Expected 200 from /school/connectors, got ${connRes.status}`);
  }
  const connHtml = await connRes.text();
  console.log(`connHtml snippet: ${connHtml.slice(0, 300)}`);
  const hasBilimClassLink = connHtml.includes("/2026/frontoffice/dashboard") || connHtml.includes("bilimclass.kz");
  console.log(`Contains BilimClass dashboard link: ${hasBilimClassLink}`);
  if (!hasBilimClassLink) {
    console.log("Full connHtml:\n", connHtml);
    throw new Error("BilimClass dashboard link missing in /school/connectors");
  }
  console.log("✓ /school/connectors contains BilimClass integration");

  // 3. Check POST /api/agents/control
  console.log("\n[Test 3] Testing POST /api/agents/control ...");
  const controlRes = await fetch(`${BASE_URL}/api/agents/control`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ control: "ai" }),
  });
  console.log(`POST /api/agents/control status: ${controlRes.status}`);
  const controlData = await controlRes.json();
  console.log("Control response:", controlData);
  if (controlRes.status !== 200 || !controlData.ok) {
    throw new Error("Failed to set agent control");
  }
  console.log("✓ Agent control set to AI");

  // 4. Check POST /api/agents/task (BilimClass teacher prompt)
  console.log("\n[Test 4] Testing POST /api/agents/task with BilimClass prompt ...");
  const taskPrompt = "Открой дэшборд BilimClass и поставь что урок 7 Б РУС проведен";
  const taskRes = await fetch(`${BASE_URL}/api/agents/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ prompt: taskPrompt }),
  });
  console.log(`POST /api/agents/task status: ${taskRes.status}`);
  const taskData = await taskRes.json();
  console.log("Task response:", taskData);
  if (taskRes.status !== 201 && taskRes.status !== 409) {
    throw new Error(`Failed to start agent task: ${JSON.stringify(taskData)}`);
  }
  let taskId = taskData.taskId;
  if (taskRes.status === 409) {
    console.log("Task already running, fetching existing tasks list...");
    const listRes = await fetch(`${BASE_URL}/api/agents/task`, {
      headers: { Cookie: cookieHeader },
    });
    const listData = (await listRes.json()) as { tasks?: { _id: string }[] };
    taskId = listData.tasks?.[0]?._id;
  }
  console.log(`✓ Agent task ID: ${taskId}`);

  // 5. Check GET /api/agents/task list
  console.log("\n[Test 5] Fetching tasks list ...");
  const statusRes = await fetch(`${BASE_URL}/api/agents/task`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`GET /api/agents/task status: ${statusRes.status}`);
  const statusData = (await statusRes.json()) as {
    tasks?: { _id: string; status?: string; prompt?: string; steps?: unknown[] }[];
  };
  const foundTask = statusData.tasks?.find((t) => t._id === taskId);
  console.log("Task details:", {
    status: foundTask?.status,
    prompt: foundTask?.prompt,
    stepsCount: foundTask?.steps?.length,
  });
  console.log("✓ Task details retrieved successfully");

  // 6. Stop task cleanly
  if (taskId) {
    console.log("\n[Test 6] Stopping task cleanly ...");
    const stopRes = await fetch(`${BASE_URL}/api/agents/task/${taskId}/stop`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    });
    console.log(`Stop task status: ${stopRes.status}`);
    const stopData = await stopRes.json();
    console.log("Stop response:", stopData);
    if (stopRes.status !== 200 || !stopData.ok) {
      throw new Error("Failed to stop task cleanly");
    }
    console.log("✓ Task stopped cleanly");
  }

  console.log("\n=======================================================");
  console.log("ALL E2E LIVE SYSTEM TESTS PASSED SUCCESSFULLY! 🚀");
  console.log("=======================================================");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
