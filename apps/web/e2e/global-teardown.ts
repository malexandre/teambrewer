import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { RUNTIME_FILE } from "./fixtures";

export default function globalTeardown(): void {
  const runtimePath = resolve(import.meta.dirname, RUNTIME_FILE);
  let runtime: { containerId?: string; apiPid?: number };
  try {
    runtime = JSON.parse(readFileSync(runtimePath, "utf8")) as typeof runtime;
  } catch {
    return;
  }

  if (runtime.apiPid) {
    try {
      process.kill(runtime.apiPid);
    } catch {
      // Already gone.
    }
  }
  if (runtime.containerId) {
    try {
      execFileSync("docker", ["rm", "-f", runtime.containerId], { stdio: "ignore" });
    } catch {
      // Already removed.
    }
  }
  rmSync(runtimePath, { force: true });
}
