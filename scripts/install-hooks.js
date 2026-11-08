import { chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Git benötigt auf Unix ein ausführbares Hook-Skript, auch nach einem frischen Clone.
chmodSync(new URL('../.githooks/pre-commit', import.meta.url), 0o755);
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
  cwd: new URL('../', import.meta.url), stdio: 'inherit', windowsHide: true,
});
