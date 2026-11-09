import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);

test("clasp packages only Editor add-on files, excluding tests, raw JSON and dependencies", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rent-addon-clasp-"));
  try {
    await Promise.all([
      writeFile(path.join(directory, ".clasp.json"), JSON.stringify({ scriptId: "test-project", rootDir: "." })),
      writeFile(path.join(directory, ".claspignore"), await readFile(".claspignore")),
      ...["main.gs", "configs.gs", "invoiceservice.gs", "trigger.gs"].map(file =>
        writeFile(path.join(directory, file), "// test")),
      writeFile(path.join(directory, "Settings.html"), "<html></html>"),
      writeFile(path.join(directory, "appsscript.json"), await readFile("appsscript.json")),
      writeFile(path.join(directory, "rent-data.json"), '{"private":"not uploaded"}'),
      writeFile(path.join(directory, "package.json"), "{}")
    ]);
    const cli = path.resolve("node_modules/@google/clasp/build/src/index.js");
    const { stdout } = await execute(process.execPath, [cli, "--json", "show-file-status"], { cwd: directory });
    assert.deepEqual(JSON.parse(stdout).filesToPush.map(file => path.basename(file)).sort(),
      ["Settings.html", "appsscript.json", "configs.gs", "invoiceservice.gs", "main.gs", "trigger.gs"].sort());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
