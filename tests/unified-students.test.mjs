import test from 'node:test';
import assert from 'node:assert/strict';
import {directory,studentPlan,assertSharedProfiles} from '../src/student-directory.mjs';
import {generatePeriod,lessonConflicts,batchConflicts} from '../src/scheduling.mjs';
import {buildTransfer} from '../src/data-transfer.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const person=id(1),member=id(2),teacher=id(3);
const group=(n,sid=person)=>({id:id(n),name:`Группа ${n}`,subject:'Английский',teacherId:teacher,students:[{id:sid,name:'Однофамилец',phone:'+79990000000'}],schedule:[{day:1,start:'09:00',end:'10:00'}],version:1,archived:false});
const lesson=(n,g,date='2026-10-19',start='09:00',end='10:00')=>({id:id(n),groupId:g.id,date,start,end,status:'planned',attendance:{},report:'',version:1});
test('same names remain separate until explicit linking; membership and attendance IDs never change',async()=>{
 const groups=[group(10),group(11,member)];const ls=[{...lesson(20,groups[1]),attendance:{[member]:'present'},report:'Сохранить'}];assert.equal(directory(groups).length,2);
 const before=structuredClone({groups,ls});const p=await studentPlan({groups,lessons:ls,input:{action:'link',personId:person,sourceIds:[person,member]}});assert.deepEqual({groups,ls},before);assert.equal(p.changes.groups.length,2);assert.equal(p.changes.lessons.length,0);
 const linked=p.changes.groups.map(c=>c.payload);assert.equal(directory(linked).length,1);assert.equal(linked[1].students[0].id,member);assert.equal(linked[1].students[0].personId,person);assert.deepEqual(ls[0].attendance,{[member]:'present'});
});
test('shared profile updates every membership but preserves local codes and source metadata',async()=>{
 const groups=[group(10),group(11,member)];groups.forEach((g,i)=>Object.assign(g.students[0],{personId:person,code:`LOCAL-${i}`,sourceStudentId:`source-${i}`}));
 const p=await studentPlan({groups,lessons:[],input:{action:'update',personId:person,profile:{name:'Новое ФИО',guardianPhone:'+79990000001',age:'12',gender:'female'}}});assert.equal(p.changes.groups.length,2);p.changes.groups.forEach((c,i)=>{assert.equal(c.payload.students[0].name,'Новое ФИО');assert.equal(c.payload.students[0].phone,undefined);assert.equal(c.payload.students[0].code,`LOCAL-${i}`);assert.equal(c.payload.students[0].sourceStudentId,`source-${i}`);});assertSharedProfiles(p.changes.groups.map(c=>c.payload));
});
test('link rejects two membership records in one group instead of dropping attendance',async()=>{
 const g=group(10);g.students.push({...g.students[0],id:member});await assert.rejects(studentPlan({groups:[g],lessons:[],input:{action:'link',personId:person,sourceIds:[person,member]}}),/две разные записи/);
});
test('full backup can undo a link while safe restore leaves the newer link in place',async()=>{
 const gs=[group(10),group(11,member)];gs[1].students[0].name='Прежнее имя';const source=JSON.stringify({format:'orbita-journal',formatVersion:1,groups:gs,lessons:[],users:[{id:teacher,login:'teacher'}]});
 const plan=await studentPlan({groups:gs,lessons:[],input:{action:'link',personId:person,sourceIds:[person,member]}});const existing={groups:plan.changes.groups.map(c=>({...c.payload,version:2})),lessons:[]};
 const safe=await buildTransfer({kind:'restore',source,existing,users:[{id:teacher,login:'teacher'}]});assert.equal(safe.changes.groups.length,0);
 const restored=await buildTransfer({kind:'restore',source,existing,users:[{id:teacher,login:'teacher'}],overwrite:true});assert.equal(directory(restored.changes.groups.map(c=>c.payload)).length,2);assert.equal(restored.changes.groups[1].payload.students[0].id,member);
});
test('weeks are exact seven-day periods across months and years with no duplicates or tombstone resurrection',()=>{
 const g=group(10);g.schedule=[{day:1,start:'09:00',end:'10:00'}];for(const count of [1,2,3,4]){const rows=generatePeriod([g],{unit:'weeks',count,start:'2026-10-26'},[]);assert.equal(rows.length,count);assert.equal(rows[0].date,'2026-10-26');}
 const rows=generatePeriod([g],{unit:'weeks',count:2,start:'2026-12-28'},[]);assert.deepEqual(rows.map(l=>l.date),['2026-12-28','2027-01-04']);assert.equal(generatePeriod([g],{unit:'weeks',count:2,start:'2026-12-28'},rows.map(l=>({...l,deleted:true}))).length,0);
 assert.throws(()=>generatePeriod([g],{unit:'weeks',count:5,start:'2026-10-26'},[]),/1–4 недели/);
});
test('one-time, biweekly and archived schedules retain their rules during weekly generation',()=>{
 const g=group(10);g.schedule=[{day:1,start:'09:00',end:'10:00',repeat:'biweekly',effectiveFrom:'2026-10-19'}];assert.deepEqual(generatePeriod([g],{unit:'weeks',count:4,start:'2026-10-19'},[]).map(l=>l.date),['2026-10-19','2026-11-02']);g.schedule[0].repeat='once';assert.equal(generatePeriod([g],{unit:'weeks',count:4,start:'2026-10-19'},[]).length,1);g.archived=true;assert.equal(generatePeriod([g],{unit:'weeks',count:4,start:'2026-10-19'},[]).length,0);
});
test('conflicts detect teachers, groups and shared pupils, ignore adjacent/cancelled/deleted lessons and self',()=>{
 const a=group(10),b=group(11,member);b.teacherId=id(9);b.students[0].personId=person;const ls=lesson(20,a);let c=lesson(21,b);assert.match(lessonConflicts(c,[ls],[a,b])[0].reasons.join(),/общие ученики/);
 c={...c,start:'10:00',end:'11:00'};assert.equal(lessonConflicts(c,[ls],[a,b]).length,0);c.start='09:30';assert.equal(lessonConflicts(c,[{...ls,deleted:true},{...ls,status:'cancelled'}],[a,b]).length,0);
 c.teacherId=teacher;assert.match(lessonConflicts(c,[ls],[a,b])[0].reasons.join(),/тот же преподаватель/);assert.equal(lessonConflicts(ls,[ls],[a,b]).length,0);assert.equal(batchConflicts([ls,lesson(22,a)],[],[a]).length,1);
});
