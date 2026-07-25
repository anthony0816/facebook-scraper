import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACE_FILE = join(__dirname, 'visited.json');

function readTrace() {
  if (!existsSync(TRACE_FILE)) return {};
  return JSON.parse(readFileSync(TRACE_FILE, 'utf-8'));
}

function writeTrace(data) {
  writeFileSync(TRACE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function isVisited(url, condition=undefined) {
  const trace = readTrace();
  const row = trace[url]
  if(condition) return url in trace && condition(row)
  return url in trace
}

export function markVisited(url) {
  const trace = readTrace();
  trace[url] = {
    publishedAt: new Date().toISOString(),
    status: 'success',
  };
  writeTrace(trace);
}

export function markVisitedOnError(url, error) {
  const trace = readTrace();
  trace[url] = {
    publishedAt: new Date().toISOString(),
    status: 'error',
    error
  };
  writeTrace(trace);
}

export function clearVisited() {
  if (existsSync(TRACE_FILE)) {
    unlinkSync(TRACE_FILE);
  }
}
