// The shell scripts run under the bash 3.2 that ships with macOS. That bash reads a non-ASCII byte straight after a
// variable name as part of the name: "$DIR…" became the unset variable "DIR\xe2" on Asil's Mac and stopped the
// installer. So the scripts stay plain ASCII, and each must parse.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runtime = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = ["scripts/install-board.sh", "scripts/board.sh", "desktop/build-mac-app.sh", "desktop/launcher.sh"];

describe("the shell scripts", () => {
  for (const script of SCRIPTS) {
    it(`${script} is plain ASCII and parses`, () => {
      const file = path.join(runtime, script);
      const lines = readFileSync(file, "utf-8").split("\n");
      const nonAscii = lines.flatMap((line, i) => (/[^\x00-\x7F]/.test(line) ? [`${i + 1}: ${line}`] : []));
      expect(nonAscii).toEqual([]);
      execFileSync("bash", ["-n", file]);
    });
  }
});
