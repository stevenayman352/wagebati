import { spawnSync } from "node:child_process";

const ALIAS = "wajebaty-preview.vercel.app";

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { shell: true, stdio: ["pipe", "pipe", "pipe"], ...options });
  return {
    code: res.status,
    out: (res.stdout?.toString() ?? "") + (res.stderr?.toString() ?? "")
  };
}

const deploy = run("npx", ["vercel", "deploy", "--yes"]);
const match = deploy.out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/);
if (!match) {
  console.error(deploy.out || deploy.code != null ? `vercel deploy failed (exit ${deploy.code})` : "no output");
  process.exit(1);
}
const url = match[0];
console.log(`Deployed: ${url}`);

const alias = run("npx", ["vercel", "alias", "set", url, ALIAS], { input: "yes\ny\n" });
console.log(alias.out.trim() || `alias: ${ALIAS}`);
if (alias.code !== 0) {
  console.error(`vercel alias failed (exit ${alias.code})`);
  process.exit(1);
}

console.log(`\nStable preview: https://${ALIAS}`);