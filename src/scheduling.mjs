import {recurrence,dateKey} from './model.mjs';
import {personId} from './student-directory.mjs';
export function generatePeriod(groups,period,existing){
 if(!period||!['weeks','months'].includes(period.unit)||!Number.isInteger(period.count)||period.count<1||period.count>(period.unit==='weeks'?4:6)||!/^\d{4}-\d{2}-\d{2}$/.test(period.start)||dateKey(new Date(`${period.start}T12:00:00`))!==period.start)throw Error('Укажите начало и период: 1–4 недели или 1–6 месяцев');
 const start=new Date(`${period.start}T12:00:00`),end=new Date(start);if(period.unit==='weeks')end.setDate(end.getDate()+7*period.count);else{end.setDate(1);end.setMonth(end.getMonth()+period.count);}
 const until=dateKey(end),out=[];for(let m=new Date(start.getFullYear(),start.getMonth(),1);m<end;m.setMonth(m.getMonth()+1)){out.push(...recurrence(groups,m.getFullYear(),m.getMonth(),[...existing,...out]).filter(l=>l.date>=period.start&&l.date<until));}return out;
}
export function lessonConflicts(candidate,existing,groups){
 if(candidate.deleted||candidate.status==='cancelled')return [];const byId=new Map(groups.map(g=>[g.id,g]));const g=byId.get(candidate.groupId);if(!g)return [];const teacher=candidate.teacherId??g.teacherId,students=new Set(g.students.map(personId));const out=[];
 for(const l of existing){if(l.id===candidate.id||l.deleted||l.status==='cancelled'||l.date!==candidate.date||candidate.start>=l.end||candidate.end<=l.start)continue;const other=byId.get(l.groupId);if(!other)continue;const reasons=[];if(g.id===other.id)reasons.push('та же группа');if(teacher&&teacher===(l.teacherId??other.teacherId))reasons.push('тот же преподаватель');const overlap=other.students.filter(s=>students.has(personId(s)));if(overlap.length)reasons.push(`общие ученики: ${overlap.length}`);if(reasons.length)out.push({id:l.id,groupId:l.groupId,groupName:other.name,date:l.date,start:l.start,end:l.end,reasons});if(out.length>=200)break;
 }return out;
}
export function batchConflicts(lessons,existing,groups){const out=[],seen=new Set();for(const l of lessons)for(const c of lessonConflicts(l,[...existing,...lessons],groups)){const key=[l.id,c.id].sort().join(':');if(seen.has(key))continue;seen.add(key);out.push({...c,candidateId:l.id,candidateGroup:groups.find(g=>g.id===l.groupId)?.name});if(out.length>=200)return out;}return out;}
