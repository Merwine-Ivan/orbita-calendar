import test from 'node:test';
import assert from 'node:assert/strict';
import {isManager,canCreateAccount,canManageAccount} from '../src/roles.mjs';
test('owner can issue administrators; administrator cannot grant or manage peer privileges',()=>{
 assert.equal(canCreateAccount('owner','admin'),true);
 assert.equal(canCreateAccount('admin','admin'),false);
 assert.equal(canCreateAccount('admin','owner'),false);
 assert.equal(canCreateAccount('owner','owner'),false);
 assert.equal(canManageAccount('admin','owner'),false);
 assert.equal(canManageAccount('admin','admin'),false);
 assert.equal(canManageAccount('owner','admin'),true);
 assert.equal(canManageAccount('owner','owner'),false);
 assert.equal(canManageAccount('admin','teacher'),true);
 assert.equal(isManager('owner'),true);
 assert.equal(canManageAccount('teacher','teacher'),false);
});

test('teacher edits own custom subject only when teacher id matches',async()=>{
 const {canTeachGroup}=await import('../src/roles.mjs');
 const teacher={id:'teacher-a',role:'teacher',subjects:['Английский']};
 assert.equal(canTeachGroup(teacher,{teacherId:'teacher-a',subject:'Математика',createdBy:'teacher-a'}),true);
 assert.equal(canTeachGroup(teacher,{teacherId:'teacher-a',subject:'Математика'}),true);
 assert.equal(canTeachGroup(teacher,{teacherId:'teacher-b',subject:'Математика',createdBy:'teacher-a'}),false);
 assert.equal(canTeachGroup(teacher,{teacherId:'teacher-a',subject:'Китайский'}),false);
 assert.equal(canTeachGroup(teacher,{teacherId:'teacher-a',subject:'Английский'}),true);
});
