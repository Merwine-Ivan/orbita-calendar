import {recurrence,dateKey,duration} from './model.mjs';
export const centreDate=(now=Date.now())=>new Date(now+6*3600000).toISOString().slice(0,10);
export function groupAt(group,date){
 const h=(group.history||[]).find(h=>(!h.from||date>=h.from)&&date<h.until);
 return h?{...group,...h,history:undefined}:group;
}
export const lessonGroup=(group,lesson)=>lesson.snapshot||group.frozenLessons?.[lesson.id]?{...group,...(lesson.snapshot||group.frozenLessons[lesson.id])}:groupAt(group,lesson.date);
export function freezeLessons(group,lessons,today){
 const result={...(group.frozenLessons||{})};
 for(const l of lessons)if(l.groupId===group.id&&!l.snapshot&&!result[l.id]&&(l.date<=today||l.status!=='planned'||l.report||Object.keys(l.attendance||{}).length)){
  const g=lessonGroup(group,l);result[l.id]={name:g.name,subject:g.subject,teacherId:g.teacherId,lessonType:g.lessonType,students:(g.students||[]).map(s=>({id:s.id,name:s.name,personId:s.personId||s.id}))};
 }
 return result;
}
export function groupHistory(previous,next,today){
 if(!previous)return {...next,scheduleSince:today,history:[]};
 const keys=['name','subject','teacherId','students','schedule','archived','deleted','lessonType'];
 if(keys.every(k=>JSON.stringify(previous[k]??null)===JSON.stringify(next[k]??null)))return {...next,history:previous.history||[],scheduleSince:previous.scheduleSince};
 const history=[...(previous.history||[])];
 if(!previous.scheduleSince||previous.scheduleSince<today)history.push({from:previous.scheduleSince||null,until:today,...Object.fromEntries(keys.map(k=>[k,previous[k]??null]))});
 return {...next,history,scheduleSince:today};
}
export function calendarMonth(groups,saved,year,month,today=centreDate()){
 const prefix=dateKey(new Date(year,month,1)).slice(0,7),out=[];
 for(const g of groups){
  const variants=[...(g.history||[]).map(h=>({...g,...h})),{...g,from:g.scheduleSince||null,until:null}];
  const projected=[];
  for(const variant of variants){
   if(variant.archived||variant.deleted)continue;
   for(const l of recurrence([variant],year,month,[]))if((!variant.from||l.date>=variant.from)&&(!variant.until||l.date<variant.until)&&(!(g.archived||g.deleted)||l.date<today))projected.push({...l,id:`virtual:${g.id}:${l.date}:${l.start}`,virtual:true,groupVersion:g.version,teacherId:l.teacherId??variant.teacherId,snapshot:{name:variant.name,subject:variant.subject,teacherId:variant.teacherId,students:variant.students,lessonType:variant.lessonType}});
  }
  for(const l of saved.filter(l=>l.groupId===g.id&&l.date.startsWith(prefix))){
   const protectedRecord=l.status!=='planned'||l.report||Object.keys(l.attendance||{}).length||l.manual||l.date<today;
   const matching=projected.find(p=>p.date===l.date&&p.start===l.start);
   // Existing future records remain in storage; schedule revisions only replace their empty projection.
   const visible=protectedRecord&&(!g.archived&&!g.deleted||l.date<today||l.status==='done')||!g.archived&&!g.deleted&&(!g.scheduleSince||l.date<g.scheduleSince||matching);
   if(!l.deleted&&visible)out.push(!protectedRecord&&matching&&g.scheduleSince?{...l,end:matching.end,teacherId:matching.teacherId,snapshot:matching.snapshot}:l);
  }
  for(const l of projected)if(!saved.some(s=>s.groupId===g.id&&s.date===l.date&&s.start===l.start))out.push(l);
 }
 return out;
}
export function monthlyStats(groups,lessons,payments,month){
 const rows=new Map(),get=(teacherId,subject,type)=>{const key=JSON.stringify([teacherId,subject,type]);if(!rows.has(key))rows.set(key,{key,teacherId,subject,type,minutes:0,paidMinutes:0,count:0,factor:subject==='Программирование'&&type==='individual'?2:1});return rows.get(key);};
 for(const l of lessons){if(l.deleted||l.status!=='done'||!l.date.startsWith(month))continue;const g=groups.find(g=>g.id===l.groupId);if(!g)continue;const view=lessonGroup(g,l),type=l.lessonType||view.lessonType||(/индивидуал/i.test(view.name)?'individual':'group');const row=get(l.teacherId??view.teacherId,view.subject,type);row.minutes+=Math.round(duration(l.start,l.end)*60);row.count++;}
 for(const p of payments||[])if(p.month===month)get(p.teacher_id,p.subject,p.lesson_type).paidMinutes+=p.minutes;
 return [...rows.values()].map(r=>({...r,hours:r.minutes/60,paid:r.paidMinutes/60,balance:(r.minutes-r.paidMinutes)/60,units:r.minutes*r.factor/60,paidUnits:r.paidMinutes*r.factor/60}));
}
