/**
 * Browser Runner script that runs inside the persistent Vercel Sandbox VM.
 * Bundled as a TypeScript string to guarantee 100% reliable inclusion in Vercel Serverless deployments.
 */
export const RUNNER_SCRIPT = `import http from "node:http";
import crypto from "node:crypto";
import net from "node:net";
import dns from "node:dns/promises";
import { chromium } from "playwright";

const PORT = parseInt(process.env.PORT || "3000", 10);
const SECRET = process.env.AUTH_SECRET;
if (!SECRET || SECRET.length < 20) {
  console.error("[RUNNER] FATAL: AUTH_SECRET env variable is required and must be at least 20 chars.");
  process.exit(1);
}

let browserInstance = null;
const sessions = new Map();

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log("[RUNNER] Launching Chromium instance in Vercel Sandbox...");
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browserInstance;
}

const BLOCKED_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function toV4Number(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function matchesCidr(ip, cidr, prefix) {
  const base = toV4Number(cidr);
  if (base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ip & mask) >>> 0) === ((base & mask) >>> 0);
}

function isBlockedAddress(addr) {
  const type = net.isIP(addr);
  if (type === 4) {
    const ip = toV4Number(addr);
    if (ip === null) return true;
    return BLOCKED_V4.some(([cidr, prefix]) => matchesCidr(ip, cidr, prefix));
  }
  if (type === 6) {
    const low = addr.toLowerCase().split("%")[0];
    if (low === "::" || low === "::1") return true;
    if (/^fe[89ab]/.test(low)) return true;
    if (/^f[cd]/.test(low)) return true;
    if (low.startsWith("ff")) return true;
    if (/::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(low)) return true;
    const dotted = low.match(/^::(?:ffff:)?(\\d{1,3}(?:\\.\\d{1,3}){3})$/);
    if (dotted) return isBlockedAddress(dotted[1]);
    if (low.startsWith("2001:0:") || low.startsWith("2002:")) return true;
    return false;
  }
  return true;
}

function isLocalHostname(host) {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

const dnsCache = new Map();
const DNS_TTL_MS = 30_000;

async function isPublicRequest(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\\[|\\]$/g, "").toLowerCase();
  if (!host) return false;
  if (net.isIP(host)) return !isBlockedAddress(host);
  if (!/^[a-z0-9.-]+$/.test(host) || isLocalHostname(host)) return false;

  const cached = dnsCache.get(host);
  const now = Date.now();
  let addresses;
  if (cached && now - cached.at < DNS_TTL_MS) {
    addresses = cached.addresses;
  } else {
    try {
      const resolved = await dns.lookup(host, { all: true });
      addresses = resolved.map((entry) => entry.address);
    } catch {
      addresses = [];
    }
    dnsCache.set(host, { at: now, addresses });
  }
  if (addresses.length === 0) return false;
  return !addresses.some(isBlockedAddress);
}

async function installRequestGuard(context) {
  await context.route("**/*", async (route) => {
    if (await isPublicRequest(route.request().url())) return route.continue();
    return route.abort();
  });
}

async function applyStorageState(context, storageState) {
  if (!storageState || typeof storageState !== "object") return;
  const state = storageState;
  if (Array.isArray(state.cookies) && state.cookies.length) {
    await context.addCookies(state.cookies).catch(() => {});
  }
  if (Array.isArray(state.origins) && state.origins.length) {
    await context.addInitScript((origins) => {
      for (const origin of origins) {
        for (const item of origin.localStorage || []) {
          try {
            window.localStorage.setItem(item.name, item.value);
          } catch {}
        }
      }
    }, state.origins);
  }
}

// Cleanup stale sessions after 10 min idle
setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActive > 10 * 60 * 1000) {
      console.log(\`[RUNNER] Cleaning up idle session \${id}\`);
      try {
        await session.context.close();
      } catch {}
      sessions.delete(id);
    }
  }
}, 60000);

function verifySignature(timestamp, rawBody, signature) {
  if (!signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(Date.now() - ts) > 120000) return false;
  const mac = crypto.createHmac("sha256", Buffer.from(SECRET)).update(\`\${timestamp}.\${rawBody}\`).digest("base64url");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(signature));
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host}\`);

  if (url.pathname === "/health" || url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "ok",
      runner: "Vercel Sandbox Browser Runner",
      activeSessions: sessions.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    }));
  }

  if (url.pathname !== "/_agent/browser") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const timestamp = req.headers["x-mekty-timestamp"];
    const signature = req.headers["x-mekty-signature"];

    if (!verifySignature(timestamp, rawBody, signature)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized: invalid signature or timestamp" }));
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid JSON" }));
    }

    const { action, sessionId, args = {}, captureScreenshot } = body;

    try {
      if (action === "limits") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          ok: true,
          activeSessionCount: sessions.size,
          maxConcurrentSessions: 50,
          allowedBrowserAcquisitions: 100,
          timeUntilNextAllowedBrowserAcquisition: 0,
          dailyBrowserSecondsUsed: 0,
        }));
      }

      if (action === "create") {
        const browser = await getBrowser();
        const id = crypto.randomUUID();
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          javaScriptEnabled: true,
          serviceWorkers: "block",
        });
        await applyStorageState(context, body.storageState);
        await installRequestGuard(context);
        const page = await context.newPage();
        await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
        sessions.set(id, { context, page, lastActive: Date.now() });
        console.log(\`[RUNNER] Created new session \${id} for user \${body.userId}. Active: \${sessions.size}\`);

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ sessionId: id, currentUrl: "about:blank" }));
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(410, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Session expired or not found", status: 410 }));
      }
      session.lastActive = Date.now();
      const { page, context } = session;

      if (action === "close") {
        await context.close().catch(() => {});
        sessions.delete(sessionId);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, sessionId }));
      }

      if (action === "status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          ok: true,
          sessionId,
          currentUrl: page.url(),
          result: { open: !page.isClosed(), url: page.url() },
        }));
      }

      let result = null;
      if (action === "navigate") {
        const targetUrl = String(args.url || body.currentUrl || "");
        if (targetUrl && targetUrl !== "about:blank") {
          const resp = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
          await page.waitForTimeout(200);
          result = { url: page.url(), status: resp?.status() ?? 200 };
        }
      } else if (action === "click") {
        await page.mouse.click(Number(args.x ?? 0), Number(args.y ?? 0), {
          clickCount: Number(args.clickCount ?? 1),
        });
        await page.waitForTimeout(150);
      } else if (action === "type") {
        const text = String(args.text ?? "");
        if (text) {
          await page.keyboard.type(text, { delay: 10 });
        }
        await page.waitForTimeout(100);
      } else if (action === "press") {
        const key = String(args.key ?? "Enter");
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      } else if (action === "wheel") {
        await page.mouse.wheel(Number(args.dx ?? 0), Number(args.dy ?? 0));
        await page.waitForTimeout(100);
      } else if (action === "move") {
        await page.mouse.move(Number(args.x ?? 0), Number(args.y ?? 0));
      } else if (action === "back") {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
      } else if (action === "forward") {
        await page.goForward({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
      } else if (action === "reload") {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      } else if (action === "mouseDown") {
        await page.mouse.down();
      } else if (action === "mouseUp") {
        await page.mouse.up();
      } else if (action === "title") {
        result = await page.title().catch(() => "");
      } else if (action === "evaluate") {
        const script = String(args.script ?? "null");
        const arg = args.arg;
        result = arg === undefined
          ? await page.evaluate(new Function(\`return (\${script})\`)())
          : await page.evaluate(new Function("arg", \`return (\${script})(arg);\`), arg);
      } else if (action === "storageState") {
        result = await context.storageState({ indexedDB: true }).catch(() => null);
      } else if (action === "fill") {
        const sel = String(args.selector ?? "");
        const val = String(args.value ?? "");
        if (sel) {
          await page.locator(sel).first().fill(val, { timeout: 5000 }).catch(async () => {
            await page.locator(sel).first().click({ timeout: 3000 }).catch(() => {});
            await page.keyboard.type(val, { delay: 20 });
          });
          await page.waitForTimeout(100);
        }
      } else if (action === "wait") {
        const ms = Math.min(Number(args.ms ?? 500), 5000);
        await page.waitForTimeout(ms);
      } else if (action === "screenshot" && !captureScreenshot) {
        const screenshot = await page.screenshot({ type: "jpeg", quality: 80 });
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Mekty-Session": sessionId,
          "X-Page-Title": encodeURIComponent(await page.title().catch(() => "")),
          "X-Page-Url": encodeURIComponent(page.url()),
        });
        return res.end(screenshot);
      }

      const responsePayload = {
        ok: true,
        sessionId,
        currentUrl: page.url(),
        pageTitle: await page.title().catch(() => ""),
        result,
      };

      const VISUAL_ACTIONS = new Set([
        "screenshot", "navigate", "click", "type", "press", "wheel",
        "back", "forward", "reload", "fill", "mouseDown", "mouseUp",
      ]);
      if (captureScreenshot || (action !== "screenshot" && VISUAL_ACTIONS.has(action))) {
        const shot = await page.screenshot({ type: "jpeg", quality: 80 });
        responsePayload.screenshotBase64 = shot.toString("base64");
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(responsePayload));
    } catch (err) {
      console.error(\`[RUNNER ERROR] Action \${action} failed:\`, err);
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message || "Action failed", status: 502 }));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(\`=======================================================\`);
  console.log(\`🚀 Vercel Sandbox Browser Runner started!\`);
  console.log(\`Listening on http://0.0.0.0:\${PORT}\`);
  console.log(\`Endpoint: http://0.0.0.0:\${PORT}/_agent/browser\`);
  console.log(\`=======================================================\`);
});
`;
