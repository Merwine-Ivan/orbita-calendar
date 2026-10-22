import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonth,groupAt,groupHistory,freezeLessons,monthlyStats,centreDate,lessonGroup} from '../src/journal.mjs';
const group={id:'g',name:'Программирование',subject:'Программирование',teacherId:'t',students:[{id:'s',name:'Ученик'}],schedule:[{day:1,start:'15:00',end:'17:00'}],archived:false};
const lesson={id:'l',groupId:'g',date:'2026-10-19',start:'15:00',end:'17:00',status:'done',attendance:{s:'present'},report:'Тема',teacherId:null};
test('any month and year is projected without adding database records or duplicates',()=>{
 const original=structuredClone(group),saved=[{...lesson,status:'planned'}];
 assert.equal(calendarMonth([group],saved,2026,9,'2026-10-22').length,4);
 assert.equal(calendarMonth([group],[],2030,0).length,4);
 assert.deepEqual(group,original);assert.equal(saved.length,1);
});
test('schedule edits keep old roster, subject, teacher and time in history',()=>{
 const changed=groupHistory(group,{...group,name:'Новое',teacherId:'new',students:[],schedule:[{day:1,start:'17:00',end:'18:00'}]},'2026-10-22');
 assert.deepEqual(groupAt(changed,'2026-10-19').students,group.students);
 const month=calendarMonth([changed],[lesson],2026,9,'2026-10-22');
 assert.equal(month.find(l=>l.id==='l').start,'15:00');
 assert.equal(month.find(l=>l.date==='2026-10-26').start,'17:00');
 assert.equal(groupAt(changed,'2026-10-19').teacherId,'t');
});
test('inactive and removed groups hide future slots but preserve conducted history and totals',()=>{
 const inactive=groupHistory(group,{...group,archived:true,deleted:true},'2026-10-22');
 const rows=calendarMonth([inactive],[lesson],2026,10,'2026-10-22');assert.equal(rows.length,0);
 assert.ok(calendarMonth([inactive],[lesson],2026,9,'2026-10-22').some(l=>l.id==='l'));
 assert.equal(monthlyStats([inactive],[lesson],[],'2026-10')[0].hours,2);
});
test('deleted slots are never resurrected by automatic projection',()=>{
 assert.ok(!calendarMonth([group],[{...lesson,deleted:true}],2026,9).some(l=>l.date===lesson.date));
});
test('future empty slots follow the revised schedule, annotated and manual records stay untouched',()=>{
 const next=groupHistory(group,{...group,schedule:[{day:1,start:'16:00',end:'18:00'}]},'2026-10-22');
 const empty={...lesson,id:'future',date:'2026-10-26',status:'planned',report:'',attendance:{}};
 let view=calendarMonth([next],[empty],2026,9,'2026-10-22');assert.ok(!view.some(l=>l.id==='future'));assert.equal(view.find(l=>l.date===empty.date).start,'16:00');
 view=calendarMonth([next],[{...empty,report:'Особое занятие'}],2026,9,'2026-10-22');assert.ok(view.some(l=>l.id==='future'));
});
test('same-day edits retain previous days instead of replacing historical versions',()=>{
 const first=groupHistory(group,{...group,name:'Первое'},'2026-10-22'),second=groupHistory(first,{...first,name:'Второе'},'2026-10-22');
 assert.equal(second.history.length,1);assert.equal(groupAt(second,'2026-10-19').name,group.name);
});
test('physical hours, individual programming units and prepayments remain separate',()=>{
 const individual={...group,id:'i',name:'Индивидуальное',lessonType:'individual'};
 const ls=[lesson,{...lesson,id:'i1',groupId:'i',end:'16:00'}, {...lesson,id:'cancelled',status:'cancelled'}, {...lesson,id:'deleted',deleted:true}];
 const paid=[{teacher_id:'t',subject:'Программирование',lesson_type:'individual',month:'2026-10',minutes:180}];
 const rows=monthlyStats([group,individual],ls,paid,'2026-10');
 const row=rows.find(r=>r.type==='individual');assert.equal(row.hours,1);assert.equal(row.units,2);assert.equal(row.paid,3);assert.equal(row.balance,-2);assert.equal(rows.reduce((s,r)=>s+r.hours,0),3);
});
test('actual duration and saved lesson snapshot determine payroll after teacher and subject changes',()=>{
 const saved={...lesson,end:'16:30',snapshot:{subject:'Английский',teacherId:'old',lessonType:'individual',students:[]}};
 const row=monthlyStats([{...group,teacherId:'new'}],[saved],[],'2026-10')[0];assert.equal(row.teacherId,'old');assert.equal(row.hours,1.5);assert.equal(row.factor,1);
 assert.equal(monthlyStats([group],[saved],[],'2026-11').length,0);
});
test('centre date uses Omsk midnight independent of browser timezone',()=>{assert.equal(centreDate(Date.parse('2026-10-21T18:00:00Z')),'2026-10-22');});
test('today conducted lessons keep roster and subject even when the group is edited on the same day',()=>{
 const original={...group,students:[{id:'s',name:'Ученик',phone:'+79991234567'}]},done={...lesson,date:'2026-10-22'};
 const next=groupHistory(original,{...original,teacherId:'new',subject:'Новый',students:[],frozenLessons:freezeLessons(original,[done],'2026-10-22')},'2026-10-22');
 const snapshot=lessonGroup(next,done);assert.equal(snapshot.subject,group.subject);assert.equal(snapshot.teacherId,'t');assert.equal(snapshot.students[0].name,'Ученик');assert.equal(snapshot.students[0].phone,undefined);
 assert.deepEqual(done,{...lesson,date:'2026-10-22'});
});
