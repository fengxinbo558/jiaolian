import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const distRoot = join(projectRoot, "dist");
const outputRoot = join(projectRoot, ".vefaas-build");

async function removeMatching(directory, predicate) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await removeMatching(path, predicate);
    else if (predicate(path)) await rm(path);
  }
}

await removeMatching(distRoot, (path) => {
  const inGeneratedBatch = path.includes("/generated-batch-01/") || path.includes("/generated-batch-02/");
  const originalGeneratedMedia = inGeneratedBatch && (path.endsWith(".gif") || path.endsWith("-keyframes.png"));
  const unusedPlanPng = path.includes("/assets/plan-covers/") && path.endsWith(".png");
  return originalGeneratedMedia || unusedPlanPng;
});

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(distRoot, join(outputRoot, "dist"), { recursive: true });
await cp(join(projectRoot, "server"), join(outputRoot, "server"), { recursive: true });
await writeFile(join(outputRoot, "package.json"), JSON.stringify({
  name: "form-fitness-coach-runtime",
  private: true,
  type: "module",
  scripts: { start: "node server/index.mjs" },
}, null, 2));

console.log("Prepared compact veFaaS runtime in .vefaas-build");
