import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import express, { type Request } from 'express';
import { renderLogTestPage } from './log-test-page.js';

// These bounds limit the work done by a test request. ESA's limits are under test.
const maxLines = 4096;
const maxBytes = 262144;
export const logTests = express.Router();

logTests.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
logTests.get('/', (_req, res) => {
  res.type('html').send(renderLogTestPage(maxLines, maxBytes));
});
logTests.use(express.urlencoded({ extended: false, limit: '2kb' }));

function startRun(req: Request) {
  return {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    host: req.get('host'),
    path: req.originalUrl.split('?')[0],
  };
}

function integerInRange(value: unknown, max: number): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return;
  const number = Number(value);
  if (number <= max) return number;
}

const methods = ['log', 'info', 'warn', 'error', 'debug', 'stderr'] as const;
type OutputMethod = (typeof methods)[number];
const levels = { log: 'INFO', info: 'INFO', warn: 'WARNING', error: 'ERROR', debug: 'DEBUG', stderr: 'ERROR' };

type WriteResult = 'returned' | 'unavailable' | 'threw';

function writeLog(method: OutputMethod, log: string): WriteResult {
  try {
    if (method === 'stderr') {
      if (typeof process === 'undefined' || typeof process.stderr?.write !== 'function') return 'unavailable';
      process.stderr.write(log + '\n');
    } else {
      if (typeof console[method] !== 'function') return 'unavailable';
      console[method](log);
    }
    return 'returned';
  } catch {
    // Report a synchronous runtime rejection without emitting another log.
    return 'threw';
  }
}

function statusForWrites(results: WriteResult[]): number {
  if (results.includes('threw')) return 500;
  if (results.includes('unavailable')) return 501;
  return 200;
}

logTests.post('/levels', (req, res) => {
  const run = startRun(req);
  const expected = methods.map(method => {
    const source = method === 'stderr' ? method : `console.${method}`;
    const log = `esa-log/${run.runId} ${source}`;
    return { source, level: levels[method], log, writeResult: writeLog(method, log) };
  });
  res.status(statusForWrites(expected.map(row => row.writeResult))).json({
    ...run, finishedAt: new Date().toISOString(), expected,
    unavailable: expected.filter(row => row.writeResult === 'unavailable').map(row => row.source),
  });
});

logTests.post('/multiline', (req, res) => {
  const method = methods.find(method => method === (req.body?.method ?? 'log'));
  const format = req.body?.format ?? 'lf';
  if (!method || !['lf', 'empty', 'crlf', 'literal'].includes(format)) {
    res.status(400).json({ error: '请使用页面提供的输出方式和换行格式。' });
    return;
  }
  const run = startRun(req);
  const [a, b, c] = ['a', 'b', 'c'].map(text => `esa-log/${run.runId} ${text}`);
  let input = [a, b, c].join('\n');
  let note;
  switch (format) {
    case 'empty':
      input = ['', a, '', b, ''].join('\n');
      note = '记录开头、中间和末尾的空行是否保留。';
      break;
    case 'crlf':
      input = [a, b, c].join('\r\n');
      note = '核对三条记录，并检查原始正文是否保留回车符。';
      break;
    case 'literal':
      input = [a, b, c].join('\\n');
      break;
  }
  const writeResult = writeLog(method, input);
  const segments = input.split('\n');
  res.status(statusForWrites([writeResult])).json({
    ...run, finishedAt: new Date().toISOString(), method, format, level: levels[method],
    input, segments, expected: note ? undefined : segments, note,
    writeResult,
  });
});

logTests.post('/count', (req, res) => {
  const lines = integerInRange(req.body?.lines, maxLines);
  const mode = req.body?.mode ?? 'calls';
  if (lines === undefined || (mode !== 'calls' && mode !== 'multiline')) {
    res.status(400).json({ error: `lines 须为 0 至 ${maxLines} 的整数，mode 须为 calls 或 multiline。` });
    return;
  }
  const run = startRun(req);
  const line = (i: number) => `esa-log/${run.runId} line=${i}/${lines}`;
  let callsReturned = 0;
  let writeResult: WriteResult = 'returned';
  if (mode === 'calls') {
    for (let i = 1; i <= lines; i++) {
      writeResult = writeLog('log', line(i));
      if (writeResult !== 'returned') break;
      callsReturned++;
    }
  } else if (lines > 0) {
    writeResult = writeLog('log', Array.from({ length: lines }, (_, i) => line(i + 1)).join('\n'));
    if (writeResult === 'returned') callsReturned = 1;
  }
  res.status(statusForWrites([writeResult])).json({
    ...run, finishedAt: new Date().toISOString(), mode, level: 'INFO', callsReturned,
    writeResult: lines ? writeResult : undefined,
    expectedLines: lines, firstLog: lines ? line(1) : null, lastLog: lines ? line(lines) : null,
  });
});

logTests.post('/length', (req, res) => {
  const bytes = integerInRange(req.body?.bytes, maxBytes);
  const encoding = req.body?.encoding ?? 'ascii';
  if (bytes === undefined || (encoding !== 'ascii' && encoding !== 'utf8')) {
    res.status(400).json({ error: `bytes 须为 0 至 ${maxBytes} 的整数，encoding 须为 ascii 或 utf8。` });
    return;
  }
  const run = startRun(req);
  const prefix = `esa-log/${run.runId} `;
  const suffix = '|END|';
  const withMarkers = bytes >= prefix.length + suffix.length;
  const fillBytes = withMarkers ? bytes - prefix.length - suffix.length : bytes;
  const fill = encoding === 'utf8'
    ? '测'.repeat(Math.floor(fillBytes / 3)) + 'x'.repeat(fillBytes % 3)
    : 'x'.repeat(fillBytes);
  const log = withMarkers ? prefix + fill + suffix : fill;
  const after = prefix + 'after-length';
  const bodyWrite = writeLog('log', log);
  const afterWrite = writeLog('log', after);
  res.status(statusForWrites([bodyWrite, afterWrite])).json({
    ...run, finishedAt: new Date().toISOString(), encoding, level: 'INFO', expectedLines: 2,
    bodyBytes: Buffer.byteLength(log, 'utf8'), characters: log.length,
    head: log.slice(0, 64), tail: log.slice(-16), withMarkers, after, bodyWrite, afterWrite,
  });
});
