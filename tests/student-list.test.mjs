import test from 'node:test';
import assert from 'node:assert/strict';
import {studentListSections} from '../src/student-list.mjs';
test('matching names collapse visually while identities and contacts remain intact',()=>{
 const people=[{id:'a',profile:{name:'Аксенова Алиса',phone:'111'},memberships:[{groupId:'g1'}]},{id:'b',profile:{name:'  АКСЕНОВА   Алиса ',phone:'222'},memberships:[{groupId:'g2'}]},{id:'c',profile:{name:'Александр'},memberships:[{groupId:'g3'}]}];
 const before=JSON.stringify(people),sections=studentListSections(people);
 assert.equal(sections.length,2);
 assert.deepEqual(sections[0].people,people.slice(0,2));
 assert.equal(sections[0].people[0].profile.phone,'111');
 assert.equal(sections[0].people[1].profile.phone,'222');
 assert.equal(studentListSections(people,false).length,3);
 assert.equal(JSON.stringify(people),before);
});
test('similar names and missing names remain separate',()=>{
 const people=['Алиса','Алиса А.','',''].map((name,i)=>({id:String(i),profile:{name},memberships:[]}));
 assert.equal(studentListSections(people).length,4);
});
