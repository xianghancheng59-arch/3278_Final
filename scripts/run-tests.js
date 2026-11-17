const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// libSQL can retain file handles until the test process exits on Windows.
const directory = mkdtempSync(path.join(tmpdir(), 'campusswap-sqlite-'));
try {
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
    env: { ...process.env, C_SQLITE_TEST_DIR: directory },
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
