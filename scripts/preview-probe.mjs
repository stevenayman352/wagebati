/**
 * Verifies the guest support entry page across the three cookie states, plus the
 * login CTA. Point it at any base URL:
 *
 *   node scripts/preview-probe.mjs http://localhost:4319
 *   node scripts/preview-probe.mjs https://host  --via-vercel
 *
 * A remote Vercel deployment has no way to inject a cookie through `vercel curl`
 * (it exposes no header flag), so the cookie states are only meaningful locally.
 * Markers are ASCII class names wherever possible: piping Arabic through a
 * PowerShell/console round-trip is not byte-stable and silently yields false
 * negatives.
 */

const base = process.argv[2] ?? "http://localhost:4319";
const viaVercel = process.argv.includes("--via-vercel");
const deployment = process.env.VERCEL_DEPLOYMENT ?? "";

const UUID = "3f1b9c2e-7a44-4f0e-9c1a-2b8d5e6f7a01";
const TOKEN = "a".repeat(43);

async function getPage(path, cookie) {
  if (viaVercel) {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync("npx", ["vercel", "curl", path, "--deployment", deployment], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      shell: true
    });
    return Buffer.from(res.stdout ?? Buffer.alloc(0)).toString("utf8");
  }
  const res = await fetch(new URL(path, base), {
    headers: cookie ? { cookie } : {},
    redirect: "manual"
  });
  return await res.text();
}

function report(label, html) {
  const markers = {
    "guest form (name=guestName)": html.includes('name="guestName"'),
    "continue card (MessagesSquare)": html.includes("MessagesSquare"),
    "resume link (/support/<id>?k=)": html.includes(`/support/${UUID}?k=`),
    "back button (lucide-arrow-left)": html.includes("lucide-arrow-left"),
    "login CTA card (hover:-translate-y-0.5)": html.includes("hover:-translate-y-0.5"),
    "login CTA title (تواصل مع الدعم)": html.includes("تواصل مع الدعم")
  };
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "(no title)";
  const wall = /<title>Login \? Vercel<\/title>/.test(html);
  console.log(`\n=== ${label} ===`);
  console.log(`  bytes=${html.length}  title="${title}"  vercelLoginWall=${wall}`);
  for (const [k, v] of Object.entries(markers)) {
    if (v) console.log(`  YES  ${k}`);
  }
  const missing = Object.entries(markers).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.log(`  no   ${missing.join(", ")}`);
}

report("novice  /support", await getPage("support"));
report("returning guest  /support", await getPage("support", `support_thread=${UUID}.${TOKEN}`));
report("garbage cookie  /support", await getPage("support", "support_thread=junk"));
report("empty token  /support", await getPage("support", `support_thread=${UUID}.`));
report("login", await getPage("login"));
