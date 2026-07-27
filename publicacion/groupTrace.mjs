import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ensureActiveProfilePath } from './profileManager.mjs';

function traceFile() {
  return join(ensureActiveProfilePath(), 'visited.json');
}

function readTrace() {
  const file = traceFile();
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf-8'));
}

function writeTrace(data) {
  const file = traceFile();
  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function dirname(path) {
  return path.substring(0, path.lastIndexOf('/') === -1 ? path.lastIndexOf('\\') : path.lastIndexOf('/'));
}

export function isVisited(url, condition=undefined) {
  const trace = readTrace();
  const row = trace[url];
  if(condition) return url in trace && condition(row);
  return url in trace;
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
    error,
  };
  writeTrace(trace);
}

export function clearVisited() {
  const file = traceFile();
  if (existsSync(file)) unlinkSync(file);
}
