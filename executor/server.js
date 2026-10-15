const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
app.use(bodyParser.json({ limit: '100kb' }));

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function verifyRequest(req, secret) {
  const timestamp = req.headers['x-mekty-timestamp'] || '';
  const signature = req.headers['x-mekty-signature'] || '';
  const ms = Number(timestamp);
  if (!Number.isSafeInteger(ms) || Math.abs(Date.now() - ms) > 60_000 || !signature) return false;
  const raw = JSON.stringify(req.body || {});
  const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest();
  return base64Url(hmac) === signature;
}

const ALLOWED = (process.env.ALLOWED_COMMANDS || 'echo,ls,cat,git').split(',').map(s => s.trim()).filter(Boolean);
const SECRET = process.env.EXECUTOR_AUTH_SECRET;

app.post('/run', async (req, res) => {
  if (!SECRET || !verifyRequest(req, SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  const { userId, command, args = [], timeoutMs = 30000 } = req.body || {};
  if (!userId || typeof command !== 'string') return res.status(400).json({ error: 'Invalid request' });
  if (!ALLOWED.includes(command)) return res.status(403).json({ error: 'Command not allowed' });

  try {
    const child = spawn(command, Array.isArray(args) ? args : [], { shell: false });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, Math.max(1000, Math.min(120000, Number(timeoutMs))));

    child.stdout.on('data', (chunk) => stdout += chunk.toString());
    child.stderr.on('data', (chunk) => stderr += chunk.toString());

    child.on('close', (code) => {
      clearTimeout(timer);
      return res.json({ ok: true, stdout, stderr, code: code === null ? null : Number(code), killed });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      return res.status(500).json({ error: String(err.message).slice(0, 300) });
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Executor listening on port ${PORT}, allowed commands: ${ALLOWED.join(',')}`));
