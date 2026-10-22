import test from 'node:test';
import assert from 'node:assert/strict';
import {sealBackup,verifyBackup} from '../src/backup-integrity.mjs';
import {paymentRecord} from '../src/payment-backup.mjs';
import {buildTransfer} from '../src/data-transfer.mjs';
import {readTransferFile} from '../src/transfer-file.mjs';
const owner={id:'10000000-0000-4000-8000-000000000001',login:'admin',name:'Главный',role:'owner'},teacher={id:'10000000-0000-4000-8000-000000000002',login:'teacher',name:'Учитель',role:'teacher'};
const payment={id:'20000000-0000-4000-8000-000000000001',at:'2026-10-22T10:15:30.123456+06:00',actor:owner.id,teacher_id:teacher.id,month:'2026-10',subject:'Программирование',lesson_type:'individual',minutes:540,note:'Аванс'};
const copy=(payments=[payment])=>({format:'orbita-journal',formatVersion:1,createdAt:'2026-10-22T05:00:00Z',groups:[],lessons:[],users:[owner,teacher],payments});
const plan=async(c,existing=[],extra={})=>buildTransfer({kind:'restore',source:JSON.stringify(c),users:[owner,teacher],existing:{groups:[],lessons:[],payments:existing},...extra});
test('sealed payment backup survives JSON round-trip and retains original author and microseconds',async()=>{
 const c=copy(),before=structuredClone(c),sealed=await sealBackup(c);assert.deepEqual(c,before);assert.equal(await verifyBackup(JSON.parse(JSON.stringify(sealed))),true);
 const p=await plan(sealed);assert.equal(p.summary.newPayments,1);assert.equal(p.changes.payments[0].at,'2026-10-22T04:15:30.123456Z');assert.equal(p.changes.payments[0].actor,owner.id);assert.equal(p.changes.payments[0].minutes,540);assert.equal(p.changes.groups.length,0);assert.equal(p.changes.lessons.length,0);
});
test('existing payment IDs are skipped, timezone equivalent timestamps do not conflict',async()=>{
 const c=await sealBackup(copy());const p=await plan(c,[{...payment,at:'2026-10-22T04:15:30.123456Z'}]);assert.equal(p.summary.newPayments,0);assert.equal(p.summary.skipped,1);assert.equal(p.checks.payments.length,1);
});
test('a conflicting payment stops the complete restore even when overwrite is selected',async()=>{
 const existing=[{...payment,minutes:60}],before=structuredClone(existing);await assert.rejects(plan(copy(),existing,{overwrite:true}),/существует и отличается/);assert.deepEqual(existing,before);
});
test('negative corrections retain sign, note and exact timestamp',async()=>{
 const p=await plan(copy([{...payment,minutes:-60,note:'Исправление'}]));assert.equal(p.changes.payments[0].minutes,-60);assert.equal(p.changes.payments[0].note,'Исправление');
});
test('payment author and teacher are mapped by login when restoring to different profile IDs',async()=>{
 const users=[{...owner,id:'10000000-0000-4000-8000-000000000011'},{...teacher,id:'10000000-0000-4000-8000-000000000012'}],p=await plan(copy(),[],{users});assert.equal(p.changes.payments[0].actor,users[0].id);assert.equal(p.changes.payments[0].teacher_id,users[1].id);
 await assert.rejects(plan(copy(),[],{users:[teacher]}),/без аккаунта/);
});
test('legacy copies without payments preserve the current ledger',async()=>{
 const c=copy();delete c.payments;const p=await plan(c,[payment]);assert.equal(p.changes.payments.length,0);assert.equal(p.checks.payments.length,1);assert.ok(p.warnings.some(w=>w.includes('нет журнала оплат')));
});
test('checksum rejects accidental valid-JSON changes and truncated files are rejected before planning',async()=>{
 const c=await sealBackup(copy());c.payments[0].minutes=60;await assert.rejects(plan(c),/Контрольная сумма/);
 await assert.rejects(buildTransfer({kind:'restore',source:'{"format":',users:[],existing:{groups:[],lessons:[]}}),/корректный JSON/);
});
test('duplicate, malformed and impossible payment values cannot be restored',async()=>{
 await assert.rejects(plan(copy([payment,payment])),/Повтор ID/);
 for(const patch of [{id:'bad'},{minutes:0},{minutes:1.5},{minutes:60001},{month:'2026-13'},{at:'2026-02-30T00:00:00Z'},{at:'2026-10-22'},{actor:null},{lesson_type:'bad'}])await assert.rejects(plan(copy([{...payment,...patch}])));
 await assert.rejects(plan({...copy(),payments:null}),/список оплат/);
});
test('restore detects ledger changes made after preview without mutating either input',async()=>{
 const c=await sealBackup(copy()),before=structuredClone(c),first=await plan(c),second=await plan(c,[{...payment,id:'20000000-0000-4000-8000-000000000002'}]);assert.notEqual(first.digest,second.digest);assert.deepEqual(c,before);
});
test('timestamp normalization preserves sub-millisecond differences',()=>{
 assert.notEqual(paymentRecord(payment).at,paymentRecord({...payment,at:'2026-10-22T04:15:30.123457Z'}).at);
});

test('historical teachers are remapped and malformed history is rejected during restore',async()=>{
 const roster=[{id:'30000000-0000-4000-8000-000000000001',name:'Ученик'}],gid='40000000-0000-4000-8000-000000000001',lid='50000000-0000-4000-8000-000000000001';
 const snapshot={name:'Группа',subject:'Английский',teacherId:teacher.id,students:roster};
 const group={id:gid,...snapshot,schedule:[],archived:false,history:[{...snapshot,from:null,until:'2026-10-22',schedule:[]}],frozenLessons:{[lid]:snapshot}};
 const lesson={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',teacherId:teacher.id,status:'done',report:'Отчёт',attendance:{[roster[0].id]:'present'},snapshot};
 const c={...copy([]),groups:[group],lessons:[lesson]},users=[owner,{...teacher,id:'10000000-0000-4000-8000-000000000012'}];
 const p=await plan(c,[],{users});assert.equal(p.changes.groups[0].payload.history[0].teacherId,users[1].id);assert.equal(p.changes.groups[0].payload.frozenLessons[lid].teacherId,users[1].id);assert.equal(p.changes.lessons[0].payload.snapshot.teacherId,users[1].id);
 await assert.rejects(plan({...c,groups:[{...group,history:{}}]}),/история/);await assert.rejects(plan({...c,lessons:[{...lesson,snapshot:{...snapshot,students:null}}]}),/история/);
});

test('a downloaded UTF-8 file with BOM restores through the actual file reader',async()=>{
 const sealed=await sealBackup(copy()),file=new File(['\uFEFF'+JSON.stringify(sealed,null,2)],'backup.json',{type:'application/json'}),source=await readTransferFile(file,true);
 const p=await buildTransfer({kind:'restore',source,users:[owner,teacher],existing:{groups:[],lessons:[],payments:[]}});assert.equal(p.changes.payments[0].note,'Аванс');assert.equal(p.changes.payments[0].at,'2026-10-22T04:15:30.123456Z');
});
test('empty, oversized and broken UTF-8 files are rejected without replacing names silently',async()=>{
 await assert.rejects(readTransferFile(new File([''],'empty.json'),true),/пуст/);
 await assert.rejects(readTransferFile(new File([new Uint8Array(5000001)],'large.json'),true),/5 МБ/);
 await assert.rejects(readTransferFile(new File([new Uint8Array([0xff,0xfe,0x41])],'wrong.json'),true),/UTF-8/);
});
