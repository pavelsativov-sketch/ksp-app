const http = require("http");
const tests = [
  { url: "/api/agents/browser-stream?action=navigate&url=https://example.com", method: "GET" },
  { url: "/api/agents/terminal", method: "POST", body: JSON.stringify({ cmd: "echo hello" }) },
];
(async () => {
  for (const t of tests) {
    await new Promise(r => {
      const opts = { hostname: "localhost", port: 3000, path: t.url, method: t.method, timeout: 20000 };
      if (t.body) opts.headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(t.body) };
      const req = http.request(opts, res => {
        let size = 0;
        res.on("data", c => size += c.length);
        res.on("end", () => { console.log(`[${res.statusCode}] ${t.method} ${t.url.split("?")[0]} -> ${size} bytes`); r(); });
      });
      req.on("error", e => { console.log(`[ERR] ${t.url} -> ${e.message}`); r(); });
      req.on("timeout", () => { req.destroy(); console.log(`[TIMEOUT] ${t.url}`); r(); });
      if (t.body) req.write(t.body);
      req.end();
    });
  }
})();