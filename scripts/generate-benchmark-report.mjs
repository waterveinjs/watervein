import fs from "node:fs";
import path from "node:path";

const resultsDir = process.argv[2] ?? "js-framework-benchmark/webdriver-ts/results";
const outputFile = process.argv[3] ?? "benchmark-report/index.html";
const frameworks = [
  ["vanillajs", "Vanilla JS"], ["vanjs", "VanJS"], ["react-hooks", "React"],
  ["preact-hooks", "Preact"], ["mikado", "Mikado"], ["vue", "Vue"],
  ["solid", "SolidJS"], ["svelte", "Svelte"], ["watervein", "Watervein"],
];
const benchmarkNames = {
  "01_run1k":"Create 1,000 rows","02_replace1k":"Replace 1,000 rows",
  "03_update10th1k_x16":"Update every 10th row ×16","04_select1k":"Select a row",
  "05_swap1k":"Swap two rows","06_remove-one-1k":"Remove one row",
  "07_create10k":"Create 10,000 rows","08_create1k-after1k_x2":"Append 1,000 rows ×2",
  "09_clear1k_x8":"Clear 1,000 rows ×8","21_ready-memory":"Memory after page load",
  "22_run-memory":"Memory after 1,000 rows","25_run-clear-memory":"Memory after create/clear cycles",
  "41_size-uncompressed":"Uncompressed bundle","42_size-compressed":"Compressed bundle",
  "43_first-paint":"First paint",
};
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p); else if(e.isFile() && e.name.endsWith(".json")) files.push(p);
  }
}
walk(resultsDir);
const records=[];
for(const file of files) {
  try {
    const r=JSON.parse(fs.readFileSync(file,"utf8"));
    if(!r.framework || !r.benchmark || !r.values) continue;
    const match=frameworks.find(([key]) => {
      if(key==="watervein") return r.framework.startsWith("watervein-");
      if(key==="vanillajs") return r.framework.startsWith("vanillajs-");
      if(key==="react-hooks") return r.framework.startsWith("react-");
      if(key==="preact-hooks") return r.framework.startsWith("preact-");
      return r.framework.startsWith(key+"-");
    });
    if(!match) continue;
    records.push({framework:match[1],key:match[0],benchmark:r.benchmark,
      label:benchmarkNames[r.benchmark]||r.benchmark,type:r.type,values:r.values});
  } catch(e) { console.warn("Skipping invalid result",file,e); }
}
const coverage=frameworks.map(([key,name])=>({key,name,count:records.filter(r=>r.key===key).length}));
const metadata={generatedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||"local",
  runId:process.env.GITHUB_RUN_ID||"local",browser:"Playwright Chromium",
  benchmarkRevision:"1e4e53d411defc4a02e5842efda9bfe73be8567b"};
const data=JSON.stringify({records,coverage,metadata}).replace(/</g,"\\u003c");
const html = [
"<!doctype html>",
'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
"<title>Watervein framework benchmark comparison</title>",
"<style>",
':root{color-scheme:light dark;font:14px/1.5 system-ui,sans-serif}body{margin:0;background:Canvas;color:CanvasText}main{max-width:1440px;margin:auto;padding:30px 20px 60px}h1{font-size:2rem;margin-bottom:4px}h2{margin:30px 0 10px;font-size:1.25rem}p{color:GrayText}.meta,.coverage,.controls{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.pill{border:1px solid color-mix(in srgb,CanvasText 20%,transparent);border-radius:999px;padding:5px 10px}.good{color:#16834a}.missing{color:#b7791f}.watervein{font-weight:700}.table-wrap{overflow:auto;max-height:70vh;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:8px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:9px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid color-mix(in srgb,CanvasText 14%,transparent)}th{position:sticky;top:0;background:Canvas;cursor:pointer}th:first-child,td:first-child{text-align:left}tbody tr:hover{background:color-mix(in srgb,Highlight 8%,Canvas)}input,select{font:inherit;padding:8px;border-radius:8px;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);background:Canvas;color:CanvasText}.note,footer{font-size:.9rem;color:GrayText}@media(max-width:700px){main{padding:18px 10px}th,td{padding:7px}}",
"</style></head><body><main>",
"<h1>JavaScript framework benchmark comparison</h1>",
"<p>Watervein compared with Vanilla JS, VanJS, React, Preact, Mikado, Vue, SolidJS and Svelte.</p>",
'<div class="meta" id="meta"></div><section><b>Framework coverage</b><div class="coverage" id="coverage"></div><p class="note">Missing rows indicate a framework may not have completed its benchmark. Missing values are never treated as zero.</p></section>',
"<h2>CPU benchmarks</h2><p>Median elapsed time in milliseconds; lower is faster. Script and paint components are shown separately.</p>",
'<div class="controls"><input id="search" type="search" placeholder="Filter framework or operation"><select id="metric"><option value="total">Total time</option><option value="script">JS time</option><option value="paint">Paint time</option></select></div>',
'<div class="table-wrap"><table id="cpu"><thead><tr><th>Framework</th><th>Operation</th><th data-sort="median">Median (ms) ↕</th><th data-sort="mean">Mean (ms) ↕</th><th data-sort="stddev">Std dev ↕</th><th data-sort="min">Min (ms) ↕</th><th data-sort="max">Max (ms) ↕</th></tr></thead><tbody></tbody></table></div>',
"<h2>Memory, bundle size and first paint</h2><p>Memory is in MB, bundle size is in KB, and first paint is in milliseconds. These metrics are single-run measurements in this CI job.</p>",
'<div class="table-wrap"><table id="other"><thead><tr><th>Framework</th><th>Metric</th><th>Median</th><th>Unit</th></tr></thead><tbody></tbody></table></div>',
"<h2>Methodology and caveats</h2><ul><li>All implementations use the keyed variant of the same pinned benchmark revision.</li><li>All runs use Playwright Chromium in the same GitHub-hosted job.</li><li>CPU metrics are medians of repeated runs; shared-runner load can still affect results.</li><li>Memory, bundle size and first paint are single-run values; treat small differences cautiously.</li><li>This is an engineering comparison, not a universal ranking across browsers or hardware.</li></ul>",
'<footer id="footer"></footer></main><script>',
"const DATA="+data+";",
'const $=id=>document.getElementById(id);const fmt=n=>Number.isFinite(n)?n.toFixed(2):"—";',
'const esc=s=>String(s).replace(/[&<>"\\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\\\'":"&#39;"}[c]));',
'$("meta").innerHTML=[["Generated",DATA.metadata.generatedAt],["Commit",DATA.metadata.commit.slice(0,12)],["Browser",DATA.metadata.browser],["Benchmark revision",DATA.metadata.benchmarkRevision.slice(0,12)]].map(x=>\'<span class="pill"><b>\'+esc(x[0])+":</b> "+esc(x[1])+"</span>").join("");',
'$("coverage").innerHTML=DATA.coverage.map(x=>\'<span class="pill \'+(x.count?"good":"missing")+\'">\'+esc(x.name)+": "+x.count+" results</span>").join("");',
'$("footer").textContent=DATA.records.length+" result files · "+DATA.records.filter(x=>x.type==="cpu").length+" CPU · "+DATA.records.filter(x=>x.type==="memory").length+" memory · "+DATA.records.filter(x=>x.type==="size").length+" size/paint records";',
'let sort={key:"median",dir:1};function renderCpu(){const metric=$("metric").value,q=$("search").value.toLowerCase();const rows=DATA.records.filter(r=>r.type==="cpu"&&(r.framework+" "+r.label).toLowerCase().includes(q)).map(r=>({r,v:r.values[metric]||{}})).sort((a,b)=>{const x=a.v[sort.key],y=b.v[sort.key];if(typeof x==="number"&&typeof y==="number")return(x-y)*sort.dir;return String(a.r[sort.key]||"").localeCompare(String(b.r[sort.key]||""))*sort.dir});$("cpu").querySelector("tbody").innerHTML=rows.map(({r,v})=>\'<tr class="\'+(r.key==="watervein"?"watervein":"")+\'"><td>\'+esc(r.framework)+"</td><td>"+esc(r.label)+"</td><td>"+fmt(v.median)+"</td><td>"+fmt(v.mean)+"</td><td>"+fmt(v.stddev)+"</td><td>"+fmt(v.min)+"</td><td>"+fmt(v.max)+"</td></tr>").join("")||\'<tr><td colspan="7">No matching results</td></tr>\'}',
'function renderOther(){const rows=DATA.records.filter(r=>r.type!=="cpu").sort((a,b)=>a.framework.localeCompare(b.framework)||a.benchmark.localeCompare(b.benchmark));$("other").querySelector("tbody").innerHTML=rows.map(r=>{const unit=r.type==="memory"?"MB":r.benchmark==="43_first-paint"?"ms":"KB";return \'<tr class="\'+(r.key==="watervein"?"watervein":"")+\'"><td>\'+esc(r.framework)+"</td><td>"+esc(r.label)+"</td><td>"+fmt(r.values.DEFAULT?.median)+"</td><td>"+unit+"</td></tr>"}).join("")||\'<tr><td colspan="4">No results</td></tr>\'}',
'$("search").addEventListener("input",renderCpu);$("metric").addEventListener("change",renderCpu);$("cpu").querySelectorAll("[data-sort]").forEach(th=>th.addEventListener("click",()=>{const key=th.dataset.sort;sort={key,dir:sort.key===key?-sort.dir:1};renderCpu()}));renderCpu();renderOther();',
"</script></body></html>"
].join("\n");
fs.mkdirSync(path.dirname(outputFile),{recursive:true});
fs.writeFileSync(outputFile,html);
console.log("Generated "+outputFile+" from "+records.length+" result files");
console.log("Coverage: "+coverage.map(x=>x.name+"="+x.count).join(", "));
