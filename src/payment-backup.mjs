const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function timestamp(value){
 const match=typeof value==='string'&&value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
 if(!match||!Number.isFinite(Date.parse(value))||new Date(`${match[1]}T12:00:00Z`).toISOString().slice(0,10)!==match[1])throw Error('Некорректная дата оплаты в резервной копии');
 // PostgreSQL timestamps have microsecond precision; Date.toISOString alone would lose three digits.
 return new Date(value).toISOString().slice(0,19)+'.'+(match[3]||'').padEnd(6,'0')+'Z';
}
export function paymentRecord(p){
 if(!p||typeof p!=='object'||!uuid(p.id)||!uuid(p.actor)||!uuid(p.teacher_id)||typeof p.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>80||/[\x00-\x1f\x7f]/.test(p.subject)||!['group','individual'].includes(p.lesson_type)||!Number.isInteger(p.minutes)||!p.minutes||Math.abs(p.minutes)>60000||typeof p.note!=='string'||p.note.length>500||typeof p.at!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(p.at)||!Number.isFinite(Date.parse(p.at)))throw Error('Некорректная запись оплаты в резервной копии');
 return {id:p.id,at:timestamp(p.at),actor:p.actor,teacher_id:p.teacher_id,month:p.month,subject:p.subject,lesson_type:p.lesson_type,minutes:p.minutes,note:p.note};
}
export function restorePayments(incoming,existing,mapUser){
 if(!Array.isArray(incoming)||incoming.length>10000)throw Error('В копии ожидается список оплат (до 10 000 записей)');
 const current=new Map(existing.map(p=>[p.id,paymentRecord(p)])),seen=new Set(),added=[];let skipped=0;
 for(const raw of incoming){const row=paymentRecord(raw);if(seen.has(row.id))throw Error('Повтор ID оплаты в резервной копии');seen.add(row.id);row.actor=mapUser(row.actor);row.teacher_id=mapUser(row.teacher_id);
  const old=current.get(row.id);if(old){if(JSON.stringify(old)!==JSON.stringify(row))throw Error(`Оплата ${row.id} уже существует и отличается. Записи оплат не заменяются; проверьте конфликт.`);skipped++;}else added.push(row);
 }
 return {added,skipped,checks:[...current.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
