// Owner-only migration operations. Uses existing local clasp OAuth; never prints tokens/content.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const scriptId='1_w2w5awU1ya1JDd8c67Yaa7CB2LXo1hn5DQ6FDAyqvBNdRtZTqGgXo08';
const config=JSON.parse(await fs.readFile(path.join(os.homedir(),'.clasprc.json'),'utf8'));const t=config.tokens.default;
const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:t.client_id,client_secret:t.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'})});
const token=await response.json();if(!token.access_token)throw Error('Owner OAuth refresh failed');
async function api(suffix,method='GET',body){
  const r=await fetch(`https://script.googleapis.com/v1/projects/${scriptId}${suffix}`,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const result=await r.json();if(!r.ok)throw Error('Apps Script owner API failed HTTP '+r.status);return result;
}
const [action,privatePath,sourcePath]=process.argv.slice(2);
if(action==='backup'){
  await fs.writeFile(privatePath,JSON.stringify({content:await api('/content'),deployments:await api('/deployments')}));console.log('Owner script source and deployments backed up');
}else if(action==='publish'){
  const backup=JSON.parse(await fs.readFile(privatePath,'utf8'));
  const source=await fs.readFile(sourcePath,'utf8');
  const files=backup.content.files.map(f=>f.type==='SERVER_JS'?{name:f.name,type:f.type,source}: {name:f.name,type:f.type,source:f.source});
  if(files.filter(f=>f.type==='SERVER_JS').length!==1)throw Error('Unexpected script layout');
  await api('/content','PUT',{files});
  const version=await api('/versions','POST',{description:'Cloudflare migration write freeze'});
  const deployment=backup.deployments.deployments.find(d=>d.deploymentId==='AKfycbyWSrEKMUTazju1NHOk4h_XpJlpKTColEyyzdUexl7LXiphImm7wZL7cBINCxpCdeVjDA');
  if(!deployment)throw Error('Expected production deployment missing');
  const updated=await api('/deployments/'+deployment.deploymentId,'PUT',{deploymentConfig:{...deployment.deploymentConfig,versionNumber:version.versionNumber,description:'Cloudflare migration write freeze'}});
  console.log({published:true,version:updated.deploymentConfig.versionNumber});
}else throw Error('Usage: google-admin.mjs backup PRIVATE_BACKUP_JSON | publish PRIVATE_BACKUP_JSON NEW_SOURCE_JS');
