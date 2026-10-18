import {subjects,duration} from './model.mjs';

// Local preview only: parsing never sends or saves the source file anywhere.
export function parseGroupImport(input){
 if(typeof input!=='string'||input.length>1000000)throw Error('Файл должен быть текстовым CSV размером до 1 МБ');
 const text=input.replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/,1)[0];
 const separator=first.includes(';')?';':first.includes('\t')?'\t':',';
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw Error('Некорректные кавычки в CSV');quoted=true;}
  else if(c===separator){row.push(cell);cell='';closed=false;}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false;}
  else {if(closed&&!/\s/.test(c))throw Error('Текст после закрывающей кавычки');if(!closed)cell+=c;}
 }
 if(quoted)throw Error('Не закрыта кавычка в CSV');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2)throw Error('Нужны заголовок и хотя бы одна строка данных');
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 const required=['group','subject','teacher_login','student_code','student_name'];
 if(new Set(header).size!==header.length||required.some(k=>!header.includes(k)))throw Error('Нужны уникальные колонки group, subject, teacher_login, student_code, student_name');
 const grouped=new Map();let studentCount=0,duplicateRows=0;
 const short=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
 rows.forEach((values,index)=>{
  const fail=message=>{throw Error(`Строка ${index+2}: ${message}`);};
  if(values.length!==header.length)fail('число полей не совпадает с заголовком');
  const r=Object.fromEntries(header.map((k,i)=>[k,values[i].trim()]));
  if(!short(r.group,120)||!subjects.includes(r.subject))fail('проверьте группу и предмет');
  if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(r.teacher_login))fail('нужен логин существующего преподавателя');
  if(!short(r.student_code,80)||!short(r.student_name,120))fail('нужны внутренний код и имя ученика');
  const key=r.group.toLocaleLowerCase('ru-RU');
  let g=grouped.get(key);if(!g){g={name:r.group,subject:r.subject,teacherLogin:r.teacher_login.toLowerCase(),students:[],schedule:[]};grouped.set(key,g);}
  if(g.subject!==r.subject||g.teacherLogin!==r.teacher_login.toLowerCase())fail('для одной группы указаны разные предметы или преподаватели');
  const student=g.students.find(s=>s.code===r.student_code);
  if(student&&student.name!==r.student_name)fail('у одного кода ученика разные имена');
  if(!student){g.students.push({code:r.student_code,name:r.student_name});studentCount++;}else duplicateRows++;
  if(g.students.length>100)fail('в группе больше 100 учеников');
  const slot=[r.day,r.start,r.end].map(x=>x||'');
  if(slot.some(Boolean)){
   if(!/^[0-6]$/.test(slot[0])||!slot.slice(1).every(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x))||duration(slot[1],slot[2])<=0)fail('расписание: day от 0 (вс) до 6 (сб), start/end в формате ЧЧ:ММ');
   const old=g.schedule.find(s=>s.day===Number(slot[0])&&s.start===slot[1]);
   if(old&&old.end!==slot[2])fail('разное окончание у одного времени группы');
   if(!old)g.schedule.push({day:Number(slot[0]),start:slot[1],end:slot[2]});
  }
 });
 return {groups:[...grouped.values()],studentCount,sourceRows:rows.length,duplicateRows};
}
