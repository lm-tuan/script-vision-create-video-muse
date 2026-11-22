import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 3900);
const ROOT = resolve(process.env.CODEX_WORKDIR || process.cwd());
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const CODEX_HOME = process.env.CODEX_HOME || (process.platform === 'win32' && process.env.USERPROFILE
  ? resolve(process.env.USERPROFILE, '.codex') : undefined);
const API_TOKEN = process.env.CODEX_API_TOKEN || '';
const ALLOW_WRITES = process.env.CODEX_ALLOW_WRITES === '1';
const MAX_JOBS = 100;
const MAX_EVENTS = 100;
function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
const MAX_PROMPT_CHARS = positiveInteger(process.env.CODEX_MAX_PROMPT_CHARS, 200_000);
const MAX_BODY_BYTES = positiveInteger(process.env.CODEX_MAX_BODY_BYTES, 2 * 1024 * 1024);
const TIMEOUT_MS = 10 * 60 * 1000;
const MODEL = process.env.CODEX_MODEL?.trim() || 'gpt-6.2-sol';
const REASONING_EFFORT = process.env.CODEX_REASONING_EFFORT?.trim() || 'high';
const jobs = new Map();
let activeJob = null;

function log(job, message) {
  const elapsed = job ? ` [${job.id.slice(0, 8)} +${((Date.now() - Date.parse(job.startedAt)) / 1000).toFixed(1)}s]` : '';
  console.log(`[${new Date().toISOString()}] [local-api]${elapsed} ${message}`);
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  if (!API_TOKEN) return true;
  const supplied = req.headers.authorization?.replace(/^Bearer /i, '') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(API_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')); }
  catch { throw new Error('Invalid JSON body'); }
}

function publicJob(job) {
  const { child, timer, heartbeat, ...data } = job;
  return data;
}

function finish(job, status, error = null) {
  if (job.status !== 'running') return;
  clearTimeout(job.timer);
  clearInterval(job.heartbeat);
  job.status = status;
  job.error = error;
  job.finishedAt = new Date().toISOString();
  job.child = null;
  if (activeJob === job.id) activeJob = null;
  log(job, `${status}; resultChars=${job.result?.length || 0}; events=${job.events.length}${error ? `; error=${JSON.stringify(error)}` : ''}`);
}

function startJob(prompt, sandbox) {
  const job = {
    id: randomUUID(), status: 'running', sandbox, threadId: null,
    result: null, error: null, events: [], stderr: '',
    startedAt: new Date().toISOString(), finishedAt: null,
    child: null, timer: null, heartbeat: null,
  };
  jobs.set(job.id, job);
  activeJob = job.id;
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    if (oldest === activeJob) break;
    jobs.delete(oldest);
  }

  const args = ['exec', '--json', '--ephemeral', '--sandbox', sandbox, '-C', ROOT];
  if (MODEL) args.push('--model', MODEL);
  if (REASONING_EFFORT) args.push('-c', `model_reasoning_effort=${JSON.stringify(REASONING_EFFORT)}`);
  if (!existsSync(resolve(ROOT, '.git'))) args.push('--skip-git-repo-check');
  args.push('-');
  log(job, `started; promptChars=${prompt.length}; sandbox=${sandbox}; model=${MODEL || 'inherited from Codex'}; reasoning=${REASONING_EFFORT || 'inherited from Codex'}`);
  const child = spawn(CODEX_BIN, args, {
    cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: CODEX_HOME ? { ...process.env, CODEX_HOME } : process.env,
  });
  job.child = child;
  let lastEventAt = Date.now();
  job.heartbeat = setInterval(() => {
    log(job, `running; events=${job.events.length}; lastEventAgo=${Math.round((Date.now() - lastEventAt) / 1000)}s; timeout=600s`);
  }, 15_000);
  job.heartbeat.unref();
  job.timer = setTimeout(() => {
    finish(job, 'timed_out', 'Codex exceeded the 10 minute limit');
    child.kill();
  }, TIMEOUT_MS);
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  function handleEvent(event) {
    lastEventAt = Date.now();
    job.events.push(event);
    if (job.events.length > MAX_EVENTS) job.events.shift();
    log(job, `event=${JSON.stringify(event.type)}${event.item?.type ? `; item=${JSON.stringify(event.item.type)}` : ''}${event.usage ? `; usage=${JSON.stringify(event.usage)}` : ''}`);
    if (event.type === 'thread.started') job.threadId = event.thread_id;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') job.result = event.item.text;
    if (event.type === 'turn.failed') job.error = event.error?.message || 'Codex turn failed';
    if (event.type === 'error') job.error = event.message || 'Codex error';
  }
  let pending = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleEvent(event);
      } catch { job.stderr = (job.stderr + '\nInvalid Codex event').slice(-4000); }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    job.stderr = (job.stderr + chunk).slice(-4000);
    log(job, `stderr=${JSON.stringify(chunk.slice(-1000))}`);
  });
  child.on('error', error => finish(job, 'failed', `Could not start Codex: ${error.message}`));
  child.on('close', code => {
    if (pending.trim()) {
      try {
        const event = JSON.parse(pending);
        handleEvent(event);
      } catch { /* CLI output should be JSONL; stderr already carries diagnostics. */ }
    }
    finish(job, code === 0 && !job.error ? 'completed' : 'failed', job.error || (code === 0 ? null : `Codex exited with code ${code}`));
  });
  return job;
}

export const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' });
  const path = new URL(req.url, `http://${HOST}`).pathname;
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, workdir: ROOT, activeJob });
  if (req.method === 'POST' && path === '/runs') {
    let body;
    try { body = await readJson(req); } catch (error) { return send(res, 400, { error: error.message }); }
    if (activeJob) return send(res, 409, { error: 'A Codex run is already active', activeJob });
    if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_CHARS) {
      return send(res, 400, { error: `prompt must be a nonempty string of at most ${MAX_PROMPT_CHARS} characters` });
    }
    const sandbox = body.sandbox || 'read-only';
    if (!['read-only', 'workspace-write'].includes(sandbox)) return send(res, 400, { error: 'Invalid sandbox' });
    if (sandbox === 'workspace-write' && !ALLOW_WRITES) return send(res, 403, { error: 'Set CODEX_ALLOW_WRITES=1 to enable workspace-write' });
    return send(res, 202, publicJob(startJob(body.prompt, sandbox)));
  }
  const match = /^\/runs\/([0-9a-f-]{36})$/.exec(path);
  if (match) {
    const job = jobs.get(match[1]);
    if (!job) return send(res, 404, { error: 'Run not found' });
    if (req.method === 'GET') return send(res, 200, publicJob(job));
    if (req.method === 'DELETE') {
      if (job.status === 'running') {
        const child = job.child;
        finish(job, 'cancelled', 'Cancelled by client');
        child?.kill();
      }
      return send(res, 200, publicJob(job));
    }
  }
  send(res, 404, { error: 'Not found' });
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  log(null, `workdir=${ROOT}; model=${MODEL || 'inherited from Codex'}; reasoning=${REASONING_EFFORT || 'inherited from Codex'}; timeout=600s`);
  log(null, 'Run npm run local-api:model to check the resolved CLI model and reasoning effort.');
  server.listen(PORT, HOST, () => console.log(`Codex API listening at http://${HOST}:${PORT}`));
}
