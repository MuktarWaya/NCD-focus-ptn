/* Cookie session transport for the Cloudflare build. No password is embedded in public assets. */
globalThis.ncdTransport = (() => {
    const formRevisions = new Map();
    const writes = new Set(['addTarget','updateTarget','addQuarterly','addDailyLog']);
    function beginTarget(target) { formRevisions.set('target', target?._revision ?? null); }
    function beginQuarterly(targetId, round, record) { formRevisions.set(`quarterly:${targetId}:${round}`,record?._revision ?? null); }
    async function request(action,data,passcode,opts={}) {
        const write=writes.has(action);
        const payload={action,data,worker:state.selectedWorker};
        let pendingKey;
        if(action==='login')payload.passcode=passcode;
        if(write){
            payload.expectedRevision=action==='updateTarget'?formRevisions.get('target')??null:action==='addQuarterly'?formRevisions.get(`quarterly:${data.target_id}:${data.quarter}`)??null:null;
            const fingerprint=JSON.stringify({action,data,worker:payload.worker,expectedRevision:payload.expectedRevision});
            pendingKey=`ncd_pending:${action}:${data.id||data.target_id||'new'}:${data.quarter||''}`;
            let pending;try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch{}
            payload.requestId=pending?.fingerprint===fingerprint?pending.requestId:crypto.randomUUID();
            sessionStorage.setItem(pendingKey,JSON.stringify({fingerprint,requestId:payload.requestId}));
        }
        const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),30000);
        try{
            const response=await fetch('/api',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-NCD-Client':'1'},body:JSON.stringify(payload),signal:abort.signal});
            const json=await response.json();
            if(!response.ok||json?.success!==true){
                if(pendingKey&&response.status>=400&&response.status<500)sessionStorage.removeItem(pendingKey);
                if(json.code==='SESSION_EXPIRED'){
                    sessionStorage.removeItem('ncd_authenticated');
                    document.getElementById('login-screen')?.classList.remove('hidden');
                }
                throw new Error(json.error||`เซิร์ฟเวอร์ตอบ HTTP ${response.status}`);
            }
            if(pendingKey)sessionStorage.removeItem(pendingKey);
            return json;
        }catch(error){
            const detail=error.name==='AbortError'?'หมดเวลารอเซิร์ฟเวอร์':error.message;
            const failure=new Error((write?'ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจประวัติก่อนบันทึกซ้ำ: ':'เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ')+detail);
            if(opts.reportError!==false)reportConnectionError(failure);
            throw failure;
        }finally{clearTimeout(timer);}
    }
    return {request,beginTarget,beginQuarterly};
})();
