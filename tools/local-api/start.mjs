import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

function findCodex() {
  const configured = process.env.CODEX_BIN;
  if (configured) return configured;

  if (process.platform !== 'win32') return 'codex';

  for (const directory of (process.env.PATH || '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, 'codex.exe');
    if (existsSync(candidate)) return candidate;
  }

  const extensionsRoot = join(process.env.USERPROFILE || '', '.vscode', 'extensions');
  if (existsSync(extensionsRoot)) {
    const extensions = readdirSync(extensionsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('openai.chatgpt-'))
      .map(entry => entry.name)
      .sort()
      .reverse();
    for (const extension of extensions) {
      const candidate = join(extensionsRoot, extension, 'bin', 'windows-x86_64', 'codex.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('Cannot find codex.exe. Set CODEX_BIN to its full path before starting the server.');
}

const codexBin = findCodex();
const env = {
  ...process.env,
  CODEX_BIN: codexBin,
  CODEX_MODEL: process.env.CODEX_MODEL?.trim() || 'gpt-6.2-sol',
  CODEX_REASONING_EFFORT: process.env.CODEX_REASONING_EFFORT?.trim() || 'high',
};
if (process.platform === 'win32' && existsSync(codexBin)) {
  env.PATH = `${dirname(resolve(codexBin))}${delimiter}${process.env.PATH || ''}`;
}

console.log(`Using Codex CLI: ${codexBin}`);
const checkModel = process.argv.includes('--check-model');
const args = checkModel
  ? ['exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', resolve(env.CODEX_WORKDIR || projectRoot)]
  : [join(projectRoot, 'server.mjs')];
if (checkModel) {
  if (env.CODEX_MODEL?.trim()) args.push('--model', env.CODEX_MODEL.trim());
  if (env.CODEX_REASONING_EFFORT?.trim()) args.push('-c', `model_reasoning_effort=${JSON.stringify(env.CODEX_REASONING_EFFORT.trim())}`);
  args.push('Reply exactly LOCAL_API_MODEL_CHECK. Do not use tools or modify files.');
  console.log('Checking resolved model with a small read-only Codex request (uses account quota)...');
}
const child = spawn(checkModel ? codexBin : process.execPath, args, {
  cwd: projectRoot,
  env,
  stdio: checkModel ? ['ignore', 'inherit', 'inherit'] : 'inherit',
  windowsHide: true,
});
child.on('error', error => {
  console.error(`Could not start API server: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
