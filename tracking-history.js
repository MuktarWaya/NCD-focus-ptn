(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.trackingHistory=api;})(globalThis,function(){
 'use strict';
 const round=value=>String(value??'').trim();
 const sameId=(a,b)=>a!==null&&a!==undefined&&b!==null&&b!==undefined&&String(a).trim()!==''&&String(a).trim()===String(b).trim();
 function forTarget(records,id){return records.filter(r=>sameId(r.target_id,id)).map(r=>({...r,quarter:round(r.quarter)}));}
 function find(records,id,selectedRound){const found=forTarget(records,id).filter(r=>r.quarter===round(selectedRound));if(found.length>1)throw Error('พบผลติดตามซ้ำในรอบนี้ กรุณาให้ผู้ประสานงานตรวจข้อมูลก่อนบันทึก');return found[0]||null;}
 function initialRound(records,id,rounds,preferred){if(preferred&&rounds.some(r=>r.value===preferred))return preferred;if(find(records,id,'W0'))return 'W0';const existing=forTarget(records,id);return rounds.find(r=>!existing.some(log=>log.quarter===r.value))?.value||'W24';}
 return {round,sameId,forTarget,find,initialRound};
});
