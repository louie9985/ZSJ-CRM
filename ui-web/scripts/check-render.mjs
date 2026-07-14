import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.resolve(uiRoot, '../packages/web/node_modules/vite/bin/vite.js');

const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });

const waitFor = async (probe, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${label}超时${lastError ? `：${lastError.message}` : ''}`);
};

const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform !== 'win32') return 'google-chrome';
  const candidates = [
    path.join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ];
  return candidates.find((candidate) => candidate && spawnSync('cmd', ['/c', 'if', 'exist', candidate, 'exit', '0'], { shell: false }).status === 0) ?? candidates[0];
};

const stopProcessTree = (child) => {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
};

const connectCdp = async (webSocketUrl) => {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const exceptions = [];
  let messageId = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++messageId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { exceptions, send, socket };
};

const appPort = await reservePort();
const debugPort = await reservePort();
const profileDir = await mkdtemp(path.join(tmpdir(), 'zsj-ui-render-'));
const vite = spawn(process.execPath, [viteEntry, '.', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort', '--force'], {
  cwd: uiRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let cdp;

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${appPort}/?view=dashboard`)).ok, 20_000, 'Vite 启动');

  browser = spawn(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    'about:blank',
  ], { stdio: 'ignore' });

  await waitFor(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok, 10_000, '无头浏览器启动');
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about%3Ablank`, { method: 'PUT' }).then((response) => response.json());
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const views = [
    ['dashboard', '上午好'],
    ['mail', '收件箱'],
    ['chat', '中世健智能助手'],
    ['finance', '资金总览'],
  ];

  for (const [view, expectedText] of views) {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/?view=${view}` });
    const renderedText = await waitFor(async () => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: "document.getElementById('root')?.innerText ?? ''",
        returnByValue: true,
      });
      return result.result.value.includes(expectedText) ? result.result.value : '';
    }, 8_000, `${view} 界面渲染`);
    console.log(`PASS: ${view} 已渲染（${renderedText.length} 个字符）`);
  }
} catch (error) {
  const details = cdp?.exceptions.length ? `\n${cdp.exceptions.join('\n')}` : '';
  console.error(`FAIL: ${error.message}${details}`);
  process.exitCode = 1;
} finally {
  cdp?.socket.close();
  stopProcessTree(browser);
  stopProcessTree(vite);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
