import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGroupImport} from '../src/group-import.mjs';
const header='group;subject;teacher_login;student_code;student_name;day;start;end\r\n';
test('import preview preserves codes, homonyms and repeated schedule rows without duplicating students',()=>{
 const result=parseGroupImport('\uFEFF'+header+'Тест;Английский;teacher.01;S01;Ученик;1;09:00;10:00\r\nТест;Английский;teacher.01;S02;Ученик;1;09:00;10:00\r\nТест;Английский;teacher.01;S01;Ученик;3;09:00;10:00');
 assert.equal(result.groups.length,1);assert.equal(result.studentCount,2);assert.equal(result.groups[0].schedule.length,2);assert.equal(result.duplicateRows,1);
});
test('quoted CSV fields may contain separators, escaped quotes and UTF-8 names',()=>{
 const result=parseGroupImport(header+'"Тест; группа ""А""";Китайский;teacher.01;S01;Тестовый ученик;;;');
 assert.equal(result.groups[0].name,'Тест; группа "А"');assert.equal(result.groups[0].schedule.length,0);
});
test('ambiguous student and group mappings fail with a row number',()=>{
 assert.throws(()=>parseGroupImport(header+'Тест;Английский;teacher.01;S01;Первый;;;\nТест;Английский;teacher.01;S01;Другой;;;'),/Строка 3/);
 assert.throws(()=>parseGroupImport(header+'Тест;Английский;teacher.01;S01;Первый;;;\nТест;Китайский;teacher.01;S02;Второй;;;'),/разные предметы/);
});
test('malformed CSV and invalid time ranges cannot proceed to an import',()=>{
 assert.throws(()=>parseGroupImport(header+'"незакрыто'),/кавычка/);
 assert.throws(()=>parseGroupImport(header+'Тест;Английский;teacher.01;S01;Ученик;1;10:00;09:00'),/расписание/);
 assert.throws(()=>parseGroupImport('group;group\nА;Б'),/уникальные колонки/);
});
