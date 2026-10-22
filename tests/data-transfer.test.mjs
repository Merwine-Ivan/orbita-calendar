import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransfer} from '../src/data-transfer.mjs';
import {studentRecord,visibleStudent} from '../src/student.mjs';
const teacher={id:'10000000-0000-4000-8000-000000000001',login:'teacher.01',role:'teacher',subjects:['Английский']};
const gid='20000000-0000-4000-8000-000000000001',sid='30000000-0000-4000-8000-000000000001',lid='40000000-0000-4000-8000-000000000001';
const group={id:gid,name:'Группа',subject:'Английский',teacherId:teacher.id,students:[{id:sid,name:'Ученик',code:'S1',guardianPhone:'+7 999 000-00-00'}],schedule:[],archived:false,version:3};
const lesson={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'done',report:'Новый отчёт',attendance:{[sid]:'present'},version:4};
const csv='group;subject;teacher_login;student_code;student_name;day;start;end\nНовая;Математика;teacher.01;S2;Новый;1;09:00;10:00';
const existing=()=>({groups:[structuredClone(group)],lessons:[structuredClone(lesson)]});
const copy=(groups=[group],lessons=[lesson],users=[teacher])=>JSON.stringify({format:'orbita-journal',formatVersion:1,groups,lessons,users});

test('CSV roster changes freeze the existing lesson roster and new groups have at most ten pupils',async()=>{
 const source='group;subject;teacher_login;student_code;student_name\nГруппа;Английский;teacher.01;S2;Новый ученик';
 const p=await buildTransfer({kind:'csv',source,existing:existing(),users:[teacher]});
 const g=p.changes.groups[0].payload;assert.equal(g.students.length,2);assert.deepEqual(g.frozenLessons[lid].students.map(s=>s.id),[sid]);
 const many='group;subject;teacher_login;student_code;student_name\n'+Array.from({length:11},(_,i)=>`Новая;Английский;teacher.01;S${i};Ученик ${i}`).join('\n');
 await assert.rejects(buildTransfer({kind:'csv',source:many,existing:existing(),users:[teacher]}),/10 учеников/);
});
test('CSV has deterministic IDs, accepts custom subjects and repeats without duplicates',async()=>{
 const e=existing(),original=structuredClone(e);const p=await buildTransfer({kind:'csv',source:csv,existing:e,users:[teacher]});assert.deepEqual(e,original);assert.equal(p.summary.newGroups,1);assert.equal(p.summary.newStudents,1);
 assert.equal((await buildTransfer({kind:'csv',source:csv,existing:e,users:[teacher]})).digest,p.digest);
 const saved={...p.changes.groups[0].payload,version:1};const twice=await buildTransfer({kind:'csv',source:csv,existing:{...e,groups:[...e.groups,saved]},users:[teacher]});assert.equal(twice.changes.groups.length,0);
});
test('CSV merges by existing ID and preserves phones and historical attendance',async()=>{
 const source='group;subject;teacher_login;student_code;student_name;day;start;end\nГруппа;Английский;teacher.01;S1;Ученик;1;09:00;10:00';const e=existing();const p=await buildTransfer({kind:'csv',source,existing:e,users:[teacher]});const s=p.changes.groups[0].payload.students[0];assert.equal(s.id,sid);assert.equal(s.guardianPhone,group.students[0].guardianPhone);assert.equal(p.changes.lessons.length,0);
 await assert.rejects(buildTransfer({kind:'csv',source:source.replace('S1;Ученик','S1;Другой'),existing:e,users:[teacher]}),/другому имени/);
});
test('dated CSV imports reports and student attendance with stable links',async()=>{
 const source='group;subject;teacher_login;student_code;student_name;start;end;date;status;report;attendance\nНовая;Английский;teacher.01;S1;Ученик;09:00;10:00;2026-10-20;done;Тема;present';const p=await buildTransfer({kind:'csv',source,existing:existing(),users:[teacher]});assert.equal(p.summary.newLessons,1);assert.equal(p.changes.lessons[0].payload.report,'Тема');assert.deepEqual(Object.keys(p.changes.lessons[0].payload.attendance),[p.changes.groups[0].payload.students[0].id]);
});
test('safe restore keeps newer reports, contacts, extra pupils and extra records',async()=>{
 const e=existing(),old={...group,students:[{id:sid,name:'Старое имя'}]},oldLesson={...lesson,report:'Старый отчёт',status:'planned',attendance:{}};const p=await buildTransfer({kind:'restore',source:copy([old],[oldLesson]),existing:e,users:[teacher]});assert.equal(p.changes.groups.length,0);assert.equal(p.changes.lessons.length,0);assert.equal(e.lessons[0].report,'Новый отчёт');
 const replace=await buildTransfer({kind:'restore',source:copy([old],[oldLesson]),existing:e,users:[teacher],overwrite:true});assert.equal(replace.changes.lessons[0].expectedVersion,4);assert.equal(replace.changes.lessons[0].payload.report,'Старый отчёт');assert.equal(replace.changes.groups[0].payload.students[0].guardianPhone,undefined);
});
test('restore missing historical pupils by ID and retain unrelated live pupils',async()=>{
 const e=existing();e.groups[0].students=[];const p=await buildTransfer({kind:'restore',source:copy(),existing:e,users:[teacher]});assert.equal(p.summary.newStudents,1);assert.equal(p.changes.groups[0].payload.students[0].id,sid);
});
test('restore remaps teacher IDs by login and fails closed for missing accounts and duplicate IDs',async()=>{
 const moved={...teacher,id:'10000000-0000-4000-8000-000000000002'};const p=await buildTransfer({kind:'restore',source:copy(),existing:{groups:[],lessons:[]},users:[moved]});assert.equal(p.changes.groups[0].payload.teacherId,moved.id);
 await assert.rejects(buildTransfer({kind:'restore',source:copy(),existing:existing(),users:[]}),/без аккаунта/);
 await assert.rejects(buildTransfer({kind:'restore',source:copy([group,group]),existing:existing(),users:[teacher]}),/Повтор ID/);
});
test('invalid backups, orphan lessons, occupied slots and missing preview versions cannot silently overwrite data',async()=>{
 await assert.rejects(buildTransfer({kind:'restore',source:'{}',existing:existing(),users:[teacher]}),/Нужна резервная/);
 await assert.rejects(buildTransfer({kind:'restore',source:copy([],[{...lesson,groupId:'20000000-0000-4000-8000-000000000002'}]),existing:existing(),users:[teacher]}),/отсутствующую группу/);
 await assert.rejects(buildTransfer({kind:'restore',source:copy([group],[{...lesson,id:'40000000-0000-4000-8000-000000000002'}]),existing:existing(),users:[teacher]}),/занято другим ID/);
 const a=await buildTransfer({kind:'csv',source:csv,existing:existing(),users:[teacher]});const e=existing();e.lessons[0].version++;assert.notEqual((await buildTransfer({kind:'csv',source:csv,existing:e,users:[teacher]})).digest,a.digest);
});
test('contacts validate phones and optional age/gender; unrelated teachers get names only',()=>{
 const s=studentRecord({id:sid,name:' Ученик ',phone:'+7 (999) 123-45-67',guardianName:'Родитель',guardianPhone:'+7 999 000-00-00',age:'10',gender:'female'});assert.equal(s.age,10);assert.equal(s.name,'Ученик');assert.equal(visibleStudent(s,false).phone,undefined);assert.equal(visibleStudent(s,true).guardianName,'Родитель');assert.throws(()=>studentRecord({...s,age:3.5}),/Возраст/);assert.throws(()=>studentRecord({...s,phone:'not a phone'}),/Телефон/);
});

test('legacy empty date ranges and long archived names round-trip without forced edits',async()=>{
 const legacy={...group,archived:true,students:[{id:sid,name:'А'.repeat(136)}],schedule:[{day:1,start:'09:00',end:'10:00',effectiveFrom:'2026-10-15',effectiveTo:'2026-10-14'}]};
 const p=await buildTransfer({kind:'restore',source:copy([legacy],[]),existing:{groups:[legacy],lessons:[]},users:[teacher]});assert.equal(p.changes.groups.length,0);
 const missing=await buildTransfer({kind:'restore',source:copy([legacy],[]),existing:{groups:[],lessons:[]},users:[teacher]});assert.equal(missing.changes.groups[0].payload.students[0].name.length,136);
});
