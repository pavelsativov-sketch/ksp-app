import http from "node:http";
import crypto from "node:crypto";
import { chromium } from "playwright";

const PORT = parseInt(process.env.PORT || "3000", 10);
const SECRET = process.env.AUTH_SECRET || "1078d15f9ca9d1a1fa076aba007a7d445675c0818fe6a2e1";

let browserInstance = null;
const sessions = new Map();

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log("[RUNNER] Launching Chromium instance...");
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

// Cleanup stale sessions after 10 min idle
setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActive > 10 * 60 * 1000) {
      console.log(`[RUNNER] Cleaning up idle session ${id}`);
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
  const mac = crypto.createHmac("sha256", Buffer.from(SECRET)).update(`${timestamp}.${rawBody}`).digest("base64url");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(signature));
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health" || url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "ok",
      runner: "Codespaces 16GB Dedicated Browser Runner",
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
        const page = await context.newPage();
        await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
        sessions.set(id, { context, page, lastActive: Date.now() });
        console.log(`[RUNNER] Created new session ${id} for user ${body.userId}. Active: ${sessions.size}`);

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

      // JSON response with optional screenshot base64
      const responsePayload = {
        ok: true,
        sessionId,
        currentUrl: page.url(),
        pageTitle: await page.title().catch(() => ""),
        result,
      };

      if (captureScreenshot || action !== "screenshot") {
        const shot = await page.screenshot({ type: "jpeg", quality: 80 });
        responsePayload.screenshotBase64 = shot.toString("base64");
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(responsePayload));
    } catch (err) {
      console.error(`[RUNNER ERROR] Action ${action} failed:`, err);
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message || "Action failed", status: 502 }));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`=======================================================`);
  console.log(`🚀 Codespaces 16GB Dedicated Browser Runner started!`);
  console.log(`Listening on http://0.0.0.0:${PORT}`);
  console.log(`Endpoint: http://0.0.0.0:${PORT}/_agent/browser`);
  console.log(`=======================================================`);
});
