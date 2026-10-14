(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.workerScope=api;})(globalThis,function(){
    'use strict';
    const STAFF_ALL='__staff_all__';
    const isStaff=name=>name===STAFF_ALL;
    const label=name=>isStaff(name)?'เจ้าหน้าที่ — ดูข้อมูลทั้งหมด':name;
    const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
    const owner=target=>clean(target?.responsible_worker)||'ยังไม่ระบุคณะทำงาน';
    function choices(targets,directory){return [STAFF_ALL,...[...new Set([...directory.map(clean),...targets.map(owner)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'))];}
    function targetsFor(targets,name){return isStaff(name)?targets.slice():clean(name)?targets.filter(t=>owner(t)===clean(name)):[];}
    function owns(targets,name,id){return targetsFor(targets,name).some(t=>String(t.id)===String(id));}
    return {STAFF_ALL,isStaff,label,clean,owner,choices,targetsFor,owns};
});
