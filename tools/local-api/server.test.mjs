import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// Node itself acts as the CLI executable. Its first argument, "exec", is this
// small fixture in the temporary working directory, so no API call is made.
const workdir = mkdtempSync(join(tmpdir(), 'codex-api-test-'));
// The extensionless fixture uses top-level await, including on Node 18/20.
writeFileSync(join(workdir, 'package.json'), '{"type":"module"}');
writeFileSync(join(workdir, 'exec'), `
let prompt = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) prompt += chunk;
const emit = event => process.stdout.write(JSON.stringify(event) + '\\n');
emit({ type: 'thread.started', thread_id: 'thread-test-123' });
if (prompt === 'hang') {
  setInterval(() => {}, 1000);
} else if (prompt === 'fail') {
  emit({ type: 'turn.failed', error: { message: 'fake CLI failure' } });
  process.exitCode = 1;
} else {
  const sandbox = process.argv[process.argv.indexOf('--sandbox') + 1];
  const text = prompt.startsWith('length:') ? String(prompt.length) : prompt + ' / ' + sandbox;
  emit({ type: 'item.completed', item: { type: 'agent_message', text } });
  emit({ type: 'turn.completed' });
}
`);
process.env.CODEX_BIN = process.execPath;
process.env.CODEX_WORKDIR = workdir;
process.env.CODEX_API_TOKEN = 'test-token';
delete process.env.CODEX_ALLOW_WRITES;
const { server } = await import('./server.mjs');
let base;
const auth = { authorization: 'Bearer test-token' };

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  rmSync(workdir, { recursive: true, force: true });
});

async function post(body) {
  return fetch(`${base}/runs`, {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getRun(id) {
  return fetch(`${base}/runs/${id}`, { headers: auth }).then(r => r.json());
}

async function waitForRun(id) {
  for (let i = 0; i < 100; i++) {
    const job = await getRun(id);
    if (job.status !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Run did not finish within 1 second');
}

test('requires the API token', async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('validates prompts and denies writes by default', async () => {
  const health = await fetch(`${base}/health`, { headers: auth }).then(r => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.workdir, workdir);
  assert.equal((await post({ prompt: '' })).status, 400);
  assert.equal((await post({ prompt: 'task', sandbox: 'invalid' })).status, 400);
  assert.equal((await post({ prompt: 'edit', sandbox: 'workspace-write' })).status, 403);
});

test('runs the CLI, parses JSONL, and returns the final response', async () => {
  const response = await post({ prompt: 'hello' });
  assert.equal(response.status, 202);
  const created = await response.json();
  assert.equal(created.sandbox, 'read-only');
  const job = await waitForRun(created.id);
  assert.equal(job.status, 'completed');
  assert.equal(job.threadId, 'thread-test-123');
  assert.equal(job.result, 'hello / read-only');
  assert.equal(job.error, null);
  assert.deepEqual(job.events.map(event => event.type), [
    'thread.started', 'item.completed', 'turn.completed',
  ]);
  assert.ok(job.finishedAt);
});

test('accepts a long prompt and rejects prompts above the configured limit', async () => {
  const longPrompt = 'length:' + 'a'.repeat(100_000);
  const accepted = await post({ prompt: longPrompt });
  assert.equal(accepted.status, 202);
  const created = await accepted.json();
  assert.equal((await waitForRun(created.id)).result, String(longPrompt.length));

  const tooLong = await post({ prompt: 'a'.repeat(200_001) });
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error, /200000 characters/);
});

test('logs run progress without logging the prompt and hides internal timers', async () => {
  const messages = [];
  const original = console.log;
  console.log = (...args) => messages.push(args.join(' '));
  try {
    const prompt = 'private-prompt-for-log-test';
    const created = await (await post({ prompt })).json();
    assert.equal('heartbeat' in created, false);
    const job = await waitForRun(created.id);
    assert.equal(job.status, 'completed');
    assert.equal('heartbeat' in job, false);
    assert.ok(messages.some(message => message.includes('started; promptChars=')));
    assert.ok(messages.some(message => message.includes('event="turn.completed"')));
    assert.ok(messages.some(message => message.includes('completed; resultChars=')));
    assert.ok(messages.every(message => !message.includes(prompt)));
  } finally {
    console.log = original;
  }
});

test('rejects a request body above the byte limit', async () => {
  const response = await post({ prompt: 'task', padding: 'x'.repeat(2 * 1024 * 1024) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /2097152 bytes/);
});

test('reports a failed Codex turn', async () => {
  const created = await (await post({ prompt: 'fail' })).json();
  const job = await waitForRun(created.id);
  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'fake CLI failure');
});

test('rejects concurrent runs and allows cancellation', async () => {
  const created = await (await post({ prompt: 'hang' })).json();
  const conflict = await post({ prompt: 'second task' });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).activeJob, created.id);
  const cancelled = await fetch(`${base}/runs/${created.id}`, { method: 'DELETE', headers: auth });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).status, 'cancelled');
  assert.equal((await getRun(created.id)).status, 'cancelled');
  const next = await (await post({ prompt: 'after cancel' })).json();
  assert.equal((await waitForRun(next.id)).status, 'completed');
});
