const w0TrackingUI = (() => {
    let rows = [], initialized = false;
    const el = id => document.getElementById(id);
    const esc = value => escapeHTML(String(value ?? ''));
    const names = {green:'ครบตามแบบ W0',yellow:'มีบางส่วน / ต้องตรวจ',red:'ยังไม่มีผลติดตาม'};
    function options(id, values, label) {
        const selected = el(id).value;
        el(id).innerHTML = `<option value="">${label}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        if (values.includes(selected)) el(id).value = selected;
    }
    function counts(obj) { return Object.entries(obj).map(([key,n])=>`<li>${esc(key)} <strong>${n} คน</strong></li>`).join(''); }
    function capture(enabled) {
        document.body.classList.toggle('w0-capture', enabled);
        el('w0-capture').textContent = enabled ? 'กลับมุมมองปกติ' : 'แคปตารางสรุป';
        el('w0-capture').setAttribute('aria-pressed', String(enabled));
    }
    function render() {
        if (!initialized) return;
        const ready = state.connectionReady && state.secondaryReady;
        el('w0-refresh').disabled = !ready;
        el('w0-capture').disabled = !ready;
        el('w0-report').hidden = !ready;
        el('w0-message').hidden = ready;
        el('w0-message').textContent = 'กำลังรอข้อมูลทะเบียนและผลติดตามล่าสุด หากเชื่อมต่อไม่สำเร็จ โปรดลองโหลดข้อมูลอีกครั้ง';
        if (!ready) { capture(false); return; }
        options('w0-village', [...new Set(getScopedTargets().map(t=>String(t.village||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')), 'ทุกชุมชน');
        const village = el('w0-village').value;
        const workers = [...new Set(getScopedTargets().filter(t=>!village||String(t.village||'').trim()===village).map(t=>String(t.responsible_worker||'ยังไม่ระบุคณะทำงาน').trim().replace(/\s+/g,' ')))].sort((a,b)=>a.localeCompare(b,'th'));
        options('w0-worker',workers,'ทุกคณะทำงาน');
        if (!workerScope.isStaff(state.selectedWorker)) el('w0-worker').value = state.selectedWorker || '';
        el('w0-worker').disabled = !!state.selectedWorker && !workerScope.isStaff(state.selectedWorker);
        const worker = el('w0-worker').value, status = el('w0-status').value;
        el('w0-community').textContent = village || 'ทุกชุมชน';
        el('w0-scope').textContent = `${worker || 'ทุกคณะทำงาน'} · ภาพรวมคณะทำงาน: ${names[status] || 'ทุกสถานะ'}`;
        el('w0-time').textContent = state.w0DataReadAt ? new Date(state.w0DataReadAt).toLocaleString('th-TH') : 'ไม่ทราบเวลาอ่านข้อมูล';
        try {
            const result = w0Completeness.build(getScopedTargets(),state.quarterlyExportData,state.w0WorkerDirectory||[],{village,worker,status}); rows = result.rows;
            el('w0-summary').innerHTML = `<span>รับผิดชอบทั้งหมด <strong>${result.totals.total} คน</strong></span>`+['green','yellow','red'].map(k=>`<span class="w0-badge w0-${k}">${names[k]} <strong>${result.totals[k]} คน</strong></span>`).join('');
            const sections = w0Completeness.comparison(getScopedTargets(),state.quarterlyExportData,state.w0WorkerDirectory||[],{village,worker,status});
            const cells = g => `<td>${g.total}</td><td class="w0-green">${g.green}</td><td class="w0-yellow">${g.yellow}</td><td class="w0-red">${g.red}</td><td><strong>${g.yellow+g.red}</strong></td>`;
            el('w0-comparison').innerHTML = sections.map(section=>`<section class="w0-comparison-section"><h3>${esc(section.village)}</h3><table class="w0-comparison-table"><caption>เปรียบเทียบความครบ W0 รายคณะทำงาน · ${esc(section.village)}</caption><thead><tr><th scope="col">คณะทำงาน</th><th scope="col">ทั้งหมด</th><th scope="col">ครบ</th><th scope="col">บางส่วน</th><th scope="col">ยังไม่มี</th><th scope="col">ต้องดู</th></tr></thead><tbody>${section.rows.map(g=>`<tr><th scope="row">${esc(g.name)}${g.needsCoordinator?' <span class="w0-directory-mark" title="ตรวจชื่อกับทะเบียนคณะทำงาน">*</span>':''}</th>${cells(g)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวม ${esc(section.village)}</th>${cells(section.totals)}</tr></tfoot></table></section>`).join('') || '<p>ไม่พบข้อมูลตามตัวกรอง</p>';
            el('w0-workers').innerHTML = rows.length ? rows.map((g,i)=>`<article class="w0-worker" data-worker="${esc(g.name)}"><div class="w0-worker-head"><div><h3>${esc(g.name)}</h3><span class="w0-badge w0-${g.status}">${names[g.status]}</span>${g.needsCoordinator?'<p class="w0-coordinator">ผู้ประสานงาน: ตรวจชื่อกับทะเบียนคณะทำงาน</p>':''}</div><div class="w0-person-count">รับผิดชอบ <strong>${g.total}</strong> คน</div></div><div class="w0-worker-counts"><span class="w0-badge w0-green">ครบ ${g.green}</span><span class="w0-badge w0-yellow">บางส่วน ${g.yellow}</span><span class="w0-badge w0-red">ยังไม่มี ${g.red}</span></div><p>ยังไม่มี W0 <strong>${g.noW0} คน</strong>${g.legacy?` · มี M0 เดิม ${g.legacy} คน ต้องตรวจรอบก่อนกรอกซ้ำ`:''}${g.other?` · มีรอบอื่น ${g.other} คน`:''}</p>${Object.keys(g.missing).length || Object.keys(g.review).length ? '<details class="w0-details"><summary>ดูหัวข้อที่ขาด / ต้องตรวจต้นทาง</summary>' : ''}<div class="w0-deficits">${Object.keys(g.missing).length?`<div><h4>ข้อมูลที่ขาด</h4><ul>${counts(g.missing)}</ul></div>`:''}${Object.keys(g.review).length?`<div><h4>ค่าที่ต้องตรวจต้นทาง</h4><ul>${counts(g.review)}</ul></div>`:''}</div>${Object.keys(g.missing).length || Object.keys(g.review).length ? '</details>' : ''}<details class="w0-members"><summary>รายชื่อกลุ่มเป้าหมายที่รับผิดชอบ (${g.total} คน)</summary><p class="w0-member-note">ตรวจชื่อ รหัส และผู้รับผิดชอบก่อนลงข้อมูล หากพบผิดคนให้ตรวจทะเบียนต้นทาง</p><ul>${g.members.slice().sort((a,b)=>a.name.localeCompare(b.name,'th')).map(person=>`<li><div><button type="button" class="w0-profile-link" data-target-id="${esc(person.id)}">${esc(person.name)}</button><small>รหัส ${esc(person.id)} · ${esc(person.village)}</small></div><div><span class="w0-badge w0-${person.status}">${names[person.status]}</span><p>${person.legacy?'มี M0 เดิม ต้องตรวจรอบก่อนกรอกซ้ำ':person.other?'มีผลรอบอื่น ยังไม่มี W0':!person.hasW0?'ยังไม่มีผลติดตาม':`ขาด: ${esc(person.missing.join(', ')||'ไม่มี')}${person.review.length?` · ต้องตรวจ: ${esc(person.review.join(', '))}`:''}`}</p></div></li>`).join('')}</ul></details><div class="w0-row-actions"><button type="button" data-copy="${i}" class="report-secondary-btn">คัดลอกข้อความเตือน</button></div></article>`).join('') : '<p class="w0-empty">ไม่พบผู้รับผิดชอบในตัวกรองนี้</p>';
        } catch(error) {
            rows=[]; el('w0-report').hidden=true; el('w0-message').hidden=false;el('w0-message').textContent=error.message;el('w0-capture').disabled=true;capture(false);
        }
    }
    function init() {
        initialized = true;
        ['w0-village','w0-worker','w0-status'].forEach(id=>el(id).addEventListener('change',render));
        el('w0-capture').addEventListener('click',()=>capture(!document.body.classList.contains('w0-capture')));
        el('w0-refresh').addEventListener('click',async()=>{await refreshData();render();});
        el('w0-workers').addEventListener('click',async event=>{
            const profile=event.target.closest('[data-target-id]');
            if(profile){viewTargetProfile(Number(profile.dataset.targetId));return;}
            const button=event.target.closest('[data-copy]');if(!button)return;
            const text=w0Completeness.reminder(rows[Number(button.dataset.copy)],el('w0-community').textContent,el('w0-time').textContent);
            try {await navigator.clipboard.writeText(text);showToast('คัดลอกข้อความเตือนแล้ว','success');}
            catch {el('w0-copy-text').value=text;el('w0-copy-dialog').showModal();el('w0-copy-text').select();}
        });
        el('w0-copy-close').addEventListener('click',()=>el('w0-copy-dialog').close());
        document.addEventListener('keydown',e=>{if(e.key==='Escape')capture(false);});
        render();
    }
    document.addEventListener('DOMContentLoaded',init);
    return {render,capture};
})();
