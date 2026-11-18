// Run files. Readings live in renderer memory during a session. A run file is only
// written when the player presses "Save run file" on the debrief screen, and goes to
// ~/Documents/Peek/runs. "Delete my data" removes every file Peek created there.

import { app } from 'electron';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'peek-run-';

export function runsDir(): string {
  return join(app.getPath('documents'), 'Peek', 'runs');
}

export function saveRun(jsonl: string): string {
  const dir = runsDir();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${PREFIX}${stamp}.jsonl`);
  writeFileSync(file, jsonl, 'utf8');
  return file;
}

export function deleteRuns(): number {
  let n = 0;
  try {
    for (const f of readdirSync(runsDir())) {
      if (f.startsWith(PREFIX) && f.endsWith('.jsonl')) {
        unlinkSync(join(runsDir(), f));
        n++;
      }
    }
  } catch {
    // folder does not exist: nothing to delete
  }
  return n;
}
