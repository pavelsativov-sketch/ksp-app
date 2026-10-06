const http = require("http");

const pages = [
  "/school/workspace",
  "/school",
  "/school/attendance",
  "/school/quality",
  "/school/vsk",
  "/api/agents/terminal",
  "/api/agents/browser-preview?url=https://example.com",
];

async function test(path) {
  return new Promise((resolve) => {
    const method = path.includes("/terminal") ? "POST" : "GET";
    const opts = { hostname: "localhost", port: 3000, path, method, timeout: 10000 };
    
    const body = method === "POST" ? JSON.stringify({ cmd: "echo test" }) : null;
    if (body) opts.headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) };

    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ path, status: res.statusCode, ok: res.statusCode < 400, size: data.length }));
    });
    req.on("error", (e) => resolve({ path, status: 0, ok: false, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ path, status: 0, ok: false, error: "timeout" }); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log("Testing Mektep Control AI pages...\n");
  for (const p of pages) {
    const r = await test(p);
    const icon = r.ok ? "✓" : "✗";
    console.log(`${icon} [${r.status}] ${r.path} ${r.size ? `(${r.size} bytes)` : ""} ${r.error || ""}`);
  }
  console.log("\nDone.");
})();