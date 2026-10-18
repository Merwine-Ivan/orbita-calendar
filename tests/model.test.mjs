import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthCells,dateKey,recurrence,validateLesson} from '../src/model.mjs';
test('calendar begins Monday and covers leap-day',()=>{const cells=monthCells(2028,1);assert.equal(cells[0].getDay(),1);assert.equal(cells.length,42);assert.ok(cells.some(d=>dateKey(d)==='2028-02-29'));});
test('recurring schedule never duplicates existing lessons or creates archived ones',()=>{const groups=[{id:'a',schedule:[{day:1,start:'09:00',end:'10:00'}]},{id:'b',archived:true,schedule:[{day:1,start:'09:00',end:'10:00'}]}];const first=recurrence(groups,2026,9,[]);assert.equal(first.length,4);assert.equal(recurrence(groups,2026,9,first).length,0);assert.ok(first.every(l=>l.groupId==='a'));});
test('invalid dates and reverse time rejected',()=>{const l={date:'2026-02-30',start:'09:00',end:'10:00',status:'planned',report:''};assert.throws(()=>validateLesson(l));assert.throws(()=>validateLesson({...l,date:'2026-10-16',end:'08:00'}));assert.doesNotThrow(()=>validateLesson({...l,date:'2026-10-16'}));});

test('custom subject weekly schedule generates only its lessons in the chosen month',async()=>{
 const {recurrence}=await import('../src/model.mjs');
 const own={id:'own',subject:'Математика',teacherId:'teacher-a',archived:false,students:[],schedule:[{day:2,start:'16:00',end:'17:00'}]};
 const other={id:'other',subject:'Китайский',teacherId:'teacher-b',archived:false,students:[],schedule:[{day:2,start:'11:00',end:'12:00'}]};
 const result=recurrence([own],2026,10,[]);
 assert.equal(result.length,4);
 assert.ok(result.every(l=>l.groupId==='own'&&l.date.startsWith('2026-11-')&&l.start==='16:00'));
 assert.equal(recurrence([own,other],2026,10,result).length,4);
});
