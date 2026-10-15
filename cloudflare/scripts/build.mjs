import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(here,'..');
const out=path.join(here,'public');
await fs.mkdir(out,{recursive:true});
// Explicit allowlist: never publish the repository root, Sheets exports, env.txt or private snapshots.
const files=['index.html','style.css','tracking-utils.js','ncd-export.js','ncd-report-ui.js','w0-completeness.js','w0-tracking-ui.js','worker-scope.js','tracking-history.js','vendor/exceljs-4.4.0.min.js','templates/ncd-community.xlsx','health_logbook_24weeks_landscape.html','ncd_focus_ptn_qrcode.png'];
for(const file of files){await fs.mkdir(path.dirname(path.join(out,file)),{recursive:true});await fs.copyFile(path.join(root,file),path.join(out,file));}
let source=(await fs.readFile(path.join(root,'app.js'),'utf8')).replace(/\r\n/g,'\n');
function replaceOnce(before,after){if(!source.includes(before))throw Error('Frontend source contract changed: '+before.slice(0,70));source=source.replace(before,after);}
source=source.replace(/^const DEFAULT_API_PASSCODE\s*=.*$/m,"const DEFAULT_API_PASSCODE = ''; // Cloudflare stores passwords only in server secrets.");
source=source.replace(/const MOCK_WORKERS = \[[\s\S]*?\n\];/, 'const MOCK_WORKERS = []; // No simulated directory in the Cloudflare build.');
source=source.replace(/gasUrl:\s*'https:\/\/script\.google\.com[^']+'/,"gasUrl: '/api'");
replaceOnce('if (!state.gasUrl || !state.apiPasscode)', 'if (!state.gasUrl)');
source=source.replace("'Connected (Sheets)'","'Connected (Cloudflare)'");
const start=source.indexOf('    const payload = {',source.indexOf('async function postToAPI('));
const end=source.indexOf('\nfunction reportConnectionError(',start);
if(start<0||end<0)throw Error('Missing transport boundary');
source=source.slice(0,start)+'    return ncdTransport.request(action,data,passcode,opts);\n}\n'+source.slice(end);
replaceOnce('function selectWorker(name) {',`async function selectWorker(name) {
    try { await postToAPI('selectWorker',{worker:name}); }
    catch(error) { showToast(error.message,'danger'); return; }`);
replaceOnce('function logoutWorkspace() {',`async function logoutWorkspace() {
    try { await postToAPI('logout',{},'',{reportError:false}); } catch {} `);
replaceOnce("    state.selectedWorker=name;", "    state.selectedWorker=name;");
// Persist the server-selected workspace before allowing any individual read/write.
replaceOnce("    const d = raw && raw.data;", `    const d = raw && raw.data;
    if (d?.backend === 'cloudflare' && state.selectedWorker !== d.selectedWorker) {
        state.selectedWorker=d.selectedWorker||null;
        if(state.selectedWorker)sessionStorage.setItem('ncd_selected_worker',state.selectedWorker);
        else sessionStorage.removeItem('ncd_selected_worker');
    }`);
replaceOnce('function loadTrackingRoundRecord(round) {', 'function loadTrackingRoundRecord(round) {');
replaceOnce("    const status = document.getElementById('form-q-history-status');", "    ncdTransport.beginQuarterly(targetId,round,record);\n    const status = document.getElementById('form-q-history-status');");
replaceOnce('function openModal(modalId) {',`function openModal(modalId) {
    if(modalId==='target-modal') {
        const id=document.getElementById('form-target-id').value;
        const target=String(state.selectedTargetProfile?.id)===String(id)?state.selectedTargetProfile:state.targets.find(t=>String(t.id)===String(id));
        ncdTransport.beginTarget(target);
    }`);
if(/script\.google\.com|DEFAULT_API_PASSCODE\s*=\s*'[^']+'/.test(source))throw Error('Legacy endpoint or password still in frontend');
await fs.writeFile(path.join(out,'app.js'),source);
await fs.copyFile(path.join(here,'client.js'),path.join(out,'cloudflare-client.js'));
let html=await fs.readFile(path.join(out,'index.html'),'utf8');
html=html.replace(/<script src="app.js[^>]*><\/script>/,'<script src="cloudflare-client.js?v=20261015-cloudflare"></script>\n    <script src="app.js?v=20261015-cloudflare"></script>');
await fs.writeFile(path.join(out,'index.html'),html);
await fs.writeFile(path.join(out,'_headers'),`/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: public, max-age=0, must-revalidate\n`);
console.log('Built '+(files.length+3)+' allowlisted public assets; no source data or credentials');
