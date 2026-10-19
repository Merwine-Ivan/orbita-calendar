import {assertSharedProfiles,profileKeys} from './student-directory.mjs';
import {parseGroupImport} from './group-import.mjs';
import {studentRecord} from './student.mjs';
import {duration,dateKey,validateLesson} from './model.mjs';
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const norm=v=>v.trim().toLocaleLowerCase('ru-RU');
export function stable(v){return JSON.stringify(v,function(k,x){return plain(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,x[key]])):x;});}
export async function digest(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(v))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function idFor(seed){const x=await digest(seed);return `${x.slice(0,8)}-${x.slice(8,12)}-4${x.slice(13,16)}-a${x.slice(17,20)}-${x.slice(20,32)}`;}
function equivalent(a,b){const clean=x=>{const {version,...rest}=x;return rest;};return stable(clean(a))===stable(clean(b));}
export function validateGroup(g,allowHistorical=false){
 if(!plain(g)||!uuid(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>120||typeof g.subject!=='string'||!g.subject.trim()||g.subject.length>80||/[\x00-\x1f\x7f]/.test(g.subject)||g.teacherId!=null&&!uuid(g.teacherId))throw Error('Некорректная группа');
 if(!Array.isArray(g.students)||g.students.length>100||!Array.isArray(g.schedule)||g.schedule.length>20)throw Error('Не больше 100 учеников и 20 времён в группе');
 const ids=new Set(),codes=new Set();for(const s of g.students){studentRecord(s);if(!uuid(s.id)||ids.has(s.id))throw Error('Повтор или некорректный ID ученика');ids.add(s.id);if(s.code){if(codes.has(s.code))throw Error('Повтор кода ученика в группе');codes.add(s.code);}}
 const slots=new Set();for(const s of g.schedule){if(!plain(s)||!Number.isInteger(s.day)||s.day<0||s.day>6||![s.start,s.end].every(t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||duration(s.start,s.end)<=0||s.teacherId!=null&&!uuid(s.teacherId))throw Error('Некорректное расписание');
  for(const d of [s.effectiveFrom,s.effectiveTo])if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||dateKey(new Date(`${d}T12:00:00`))!==d))throw Error('Некорректная дата расписания');
  if(!allowHistorical&&s.effectiveFrom&&s.effectiveTo&&s.effectiveFrom>s.effectiveTo||s.repeat&&!['weekly','biweekly','once'].includes(s.repeat)||['biweekly','once'].includes(s.repeat)&&!s.effectiveFrom||s.repeat==='once'&&new Date(`${s.effectiveFrom}T12:00:00`).getDay()!==s.day)throw Error('Некорректное повторение расписания');
  const key=[s.day,s.start,s.effectiveFrom||'',s.effectiveTo||''].join('|');if(slots.has(key))throw Error('Повтор времени в расписании');slots.add(key);
 }
}
function checkLesson(l,groups){
 if(!plain(l)||!uuid(l.id)||!uuid(l.groupId)||l.teacherId!=null&&!uuid(l.teacherId)||l.deleted!==undefined&&typeof l.deleted!=='boolean')throw Error('Некорректное занятие');validateLesson(l);
 const g=groups.find(g=>g.id===l.groupId);if(!g)throw Error('Занятие ссылается на отсутствующую группу');
 if(!plain(l.attendance)||Object.entries(l.attendance).some(([id,mark])=>!uuid(id)||!['present','absent','excused'].includes(mark)))throw Error('Некорректная посещаемость');
 // Historical attendance can refer to students removed from a group; preserve those marks.
}
export async function buildTransfer({kind,source,existing,users,overwrite=false}){
 if(!['csv','restore'].includes(kind)||typeof source!=='string'||source.length>5000000)throw Error('Проверьте формат и размер файла (до 5 МБ)');
 const groups=structuredClone(existing.groups),lessons=structuredClone(existing.lessons),changes={groups:[],lessons:[]},details=[],warnings=[];
 const summary={newGroups:0,updatedGroups:0,newStudents:0,newLessons:0,updatedLessons:0,skipped:0};
 function put(table,v){const list=table==='groups'?groups:lessons,old=list.find(x=>x.id===v.id);if(old&&equivalent(old,v)){summary.skipped++;return;}
  changes[table].push({expectedVersion:old?.version??0,payload:{...v,version:old?.version??0}});if(old)list.splice(list.indexOf(old),1,v);else list.push(v);
  summary[table==='groups'?(old?'updatedGroups':'newGroups'):(old?'updatedLessons':'newLessons')]++;details.push({type:table,action:old?'update':'create',label:table==='groups'?v.name:`${groups.find(g=>g.id===v.groupId)?.name||'Занятие'} · ${v.date} ${v.start}`});
 }
 if(kind==='csv'){
  const parsed=parseGroupImport(source);
  for(const incoming of parsed.groups){
   const teacher=users.find(u=>!u.disabled&&norm(u.login)===incoming.teacherLogin);if(!teacher)throw Error(`Выдайте доступ преподавателю ${incoming.teacherLogin}`);
   const matches=groups.filter(g=>norm(g.name)===norm(incoming.name));if(matches.length>1)throw Error(`Неоднозначная группа «${incoming.name}»: переименуйте совпадения`);
   const old=matches[0];if(old&&(old.subject!==incoming.subject||old.teacherId!==teacher.id||old.archived))throw Error(`Группа «${incoming.name}» уже существует с другим предметом, преподавателем или в архиве. Сначала сопоставьте её в карточке.`);
   const group=old?structuredClone(old):{id:await idFor(['csv-group',norm(incoming.name)]),name:incoming.name,subject:incoming.subject,teacherId:teacher.id,students:[],schedule:[],archived:false,version:0};
   const codeIds=new Map();for(const s of incoming.students){
    let match=group.students.filter(x=>x.code===s.code);if(!match.length)match=group.students.filter(x=>!x.code&&norm(x.name)===norm(s.name));
    if(match.length>1)throw Error(`Неоднозначный ученик «${s.name}»: задайте коды в карточке группы`);
    let target=match[0];if(target){if(norm(target.name)!==norm(s.name))throw Error(`Код ${s.code} уже принадлежит другому имени`);for(const [k,v] of Object.entries(s)){if(target[k]!=null&&target[k]!==''&&target[k]!==v)throw Error(`Данные ${s.code} отличаются: измените карточку ученика перед импортом`);target[k]=v;}}
    else{target={...s,id:await idFor(['csv-student',group.id,s.code])};group.students.push(target);summary.newStudents++;}codeIds.set(s.code,target.id);
   }
   for(const slot of incoming.schedule){const oldSlot=group.schedule.find(s=>s.day===slot.day&&s.start===slot.start);if(oldSlot&&oldSlot.end!==slot.end)throw Error(`Разное время окончания в группе «${group.name}»`);if(oldSlot&&(oldSlot.repeat&&oldSlot.repeat!=='weekly'||oldSlot.effectiveFrom||oldSlot.effectiveTo||oldSlot.active===false))throw Error(`Время ${slot.start} в группе «${group.name}» имеет особые правила повторения. Измените его в карточке.`);if(!oldSlot)group.schedule.push(slot);}
   validateGroup(group);put('groups',group);
   for(const l of incoming.lessons){const attendance=Object.fromEntries(Object.entries(l.attendance).map(([code,mark])=>[codeIds.get(code),mark]));const same=lessons.find(x=>x.groupId===group.id&&x.date===l.date&&x.start===l.start);
    const value={...l,attendance,id:same?.id||await idFor(['csv-lesson',group.id,l.date,l.start]),groupId:group.id,teacherId:same?.teacherId??null,deleted:false};
    if(same){if(same.deleted||same.end!==l.end||same.status!==l.status||same.report!==l.report||Object.entries(attendance).some(([id,m])=>same.attendance?.[id]!==m))throw Error(`Занятие ${group.name} ${l.date} ${l.start} уже есть и отличается. Измените его в календаре.`);summary.skipped++;continue;}checkLesson(value,groups);put('lessons',value);
   }
  }
 }else{
  let copy;try{copy=JSON.parse(source);}catch{throw Error('Файл не содержит корректный JSON');}
  if(copy?.format!=='orbita-journal'||copy.formatVersion!==1||!Array.isArray(copy.groups)||!Array.isArray(copy.lessons)||!Array.isArray(copy.users)||copy.groups.length>1000||copy.lessons.length>5000||copy.users.length>500)throw Error('Нужна резервная копия Орбиты v1 (до 1000 групп и 5000 занятий)');
  const groupIDs=new Set(),lessonIDs=new Set(),userIDs=new Set();
  for(const u of copy.users){if(!plain(u)||!uuid(u.id)||userIDs.has(u.id)||typeof u.login!=='string')throw Error('Некорректные сотрудники в копии');userIDs.add(u.id);}
  const mapTeacher=id=>{if(id==null)return null;const direct=users.find(u=>u.id===id);if(direct)return direct.id;const original=copy.users.find(u=>u.id===id);const mapped=original&&users.filter(u=>norm(u.login)===norm(original.login));if(mapped?.length===1)return mapped[0].id;throw Error('В копии есть преподаватель без аккаунта в этом журнале. Сначала выдайте ему доступ с прежним логином.');};
  for(const raw of copy.groups){validateGroup(raw,true);if(groupIDs.has(raw.id))throw Error('Повтор ID группы в копии');groupIDs.add(raw.id);const old=groups.find(g=>g.id===raw.id);
   let value={...(old||{}),...structuredClone(raw),teacherId:mapTeacher(raw.teacherId),createdBy:raw.createdBy?mapTeacher(raw.createdBy):null,schedule:raw.schedule.map(s=>({...s,...(s.teacherId?{teacherId:mapTeacher(s.teacherId)}:{})}))};
   if(old){if(overwrite){value.students=[...old.students.filter(s=>!raw.students.some(x=>x.id===s.id)),...raw.students.map(s=>{const prior={...old.students.find(x=>x.id===s.id)};for(const k of [...profileKeys,'personId'])delete prior[k];return {...prior,...s,personId:s.personId||null};})];}
    else{value={...old,students:[...old.students,...raw.students.filter(s=>!old.students.some(x=>x.id===s.id))]};}summary.newStudents+=value.students.length-old.students.length;
   }else summary.newStudents+=value.students.length;
   validateGroup(value,true);put('groups',value);
  }
  for(const raw of copy.lessons){if(!plain(raw)||lessonIDs.has(raw.id))throw Error('Повтор ID занятия в копии');lessonIDs.add(raw.id);const old=lessons.find(l=>l.id===raw.id);const value={...(old||{}),...structuredClone(raw),teacherId:mapTeacher(raw.teacherId)};checkLesson(value,groups);
   const slot=lessons.find(l=>l.id!==raw.id&&l.groupId===raw.groupId&&l.date===raw.date&&l.start===raw.start);if(slot)throw Error(`Время ${raw.date} ${raw.start} уже занято другим ID. Автоматическое объединение остановлено.`);
   if(old&&!overwrite){summary.skipped++;continue;}put('lessons',value);
  }
  warnings.push('Учётные записи и пароли не восстанавливаются. Записи, которых нет в файле, сохраняются. Лишние ученики в действующих группах сохраняются.');
 }
 assertSharedProfiles(groups);
 if(changes.groups.length>1000||changes.lessons.length>5000)throw Error('Слишком много записей за одну операцию');
 const checks={groups:existing.groups.map(g=>({id:g.id,version:g.version})),lessons:existing.lessons.map(l=>({id:l.id,version:l.version}))};
 return {changes,checks,summary,details,warnings,digest:await digest({kind,source,overwrite,changes,checks})};
}
