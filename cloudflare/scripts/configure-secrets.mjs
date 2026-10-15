import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [environment,privatePath]=process.argv.slice(2);
if(!['staging','production'].includes(environment)||!privatePath)throw Error('Usage: configure-secrets.mjs staging|production PRIVATE_SECRETS_JSON');
let secret;
try{secret=JSON.parse(await fs.readFile(privatePath,'utf8'));}catch{
  const source=await fs.readFile(path.join(root,'app.js'),'utf8');
  const password=environment==='staging'?crypto.randomUUID()+crypto.randomUUID():source.match(/const DEFAULT_API_PASSCODE\s*=\s*'([^']+)'/)[1];
  secret={API_PASSCODE:password};
  await fs.writeFile(privatePath,JSON.stringify(secret));
}
console.log({secretFilePrepared:true,environment,keys:Object.keys(secret)});
