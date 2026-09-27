/**
 * Probes dynamic (streamed / PPR) App Router routes.
 *
 * preview-probe.mjs matches plain substrings, which works for prerendered
 * shells but NOT for streamed routes: their content arrives inside
 * `self.__next_f.push([1,"..."])` with text escaped (`\"`, `\u0627`), so a naive
 * `html.includes("lucide-arrow-left")` silently reports false negatives.
 * This decodes those flight chunks first, then matches.
 *
 *   node scripts/probe-dynamic.mjs http://localhost:4319 /admin/support "marker" "marker"
 */
const base = process.argv[2] ?? "http://localhost:4319";
const path = process.argv[3] ?? "/";
const markers = process.argv.slice(4);

const res = await fetch(new URL(path, base), { redirect: "manual" });
const html = await res.text();

/** Pulls and JSON-decodes every flight payload chunk appended by the client runtime. */
function decodeFlight(src) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = "";
  let m;
  while ((m = re.exec(src)) !== null) {
    try {
      out += JSON.parse(m[1]);
    } catch {
      /* not every chunk is a plain string; skip it */
    }
  }
  return out;
}

const flight = decodeFlight(html);
const decoded = flight
  .replace(/\\"/g, '"')
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\n/g, "\n");
const haystack = html + "\n" + decoded;

console.log(`=== ${path} ===`);
console.log(`  status=${res.status} bytes=${html.length} flight=${flight.length} decoded=${decoded.length}`);
if (res.headers.get("location")) console.log(`  location=${res.headers.get("location")}`);

if (!markers.length) {
  console.log(html.slice(0, 600));
  process.exit(0);
}
for (const marker of markers) {
  console.log(`  ${haystack.includes(marker) ? "YES" : "no "}  ${marker}`);
}
