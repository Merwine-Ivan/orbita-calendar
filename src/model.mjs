export const subjects = ['Английский', 'Китайский', 'Программирование'];
export const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - (first.getDay()+6)%7);
  return Array.from({length:42}, (_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
}
export function duration(start,end) {return (Number(end.slice(0,2))*60+Number(end.slice(3))-Number(start.slice(0,2))*60-Number(start.slice(3)))/60;}
export function validateLesson(l) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(l.date) || dateKey(new Date(`${l.date}T12:00:00`))!==l.date) throw Error('Укажите корректную дату');
  if(![l.start,l.end].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || duration(l.start,l.end)<=0) throw Error('Окончание должно быть позже начала');
  if(!['planned','done','cancelled'].includes(l.status)) throw Error('Неизвестный статус');
  if(typeof l.report!=='string' || l.report.length>10000) throw Error('Отчёт должен быть короче 10 000 символов');
}
export function recurrence(groups,year,month,existing) {
  // Legacy schedule slots without repeat remain weekly; never recreate a soft-deleted lesson.
  const dayMs=86400000;
  const utcDate=iso=>Date.parse(`${iso}T00:00:00Z`);

  const out=[];
  for(let day=1;day<=new Date(year,month+1,0).getDate();day++) {
    const d=new Date(year,month,day), date=dateKey(d);
    for(const g of groups.filter(g=>!g.archived)) for(const s of g.schedule||[]) if(
      s.active!==false && s.day===d.getDay() &&
      (!s.effectiveFrom||date>=s.effectiveFrom) && (!s.effectiveTo||date<=s.effectiveTo) &&
      (s.repeat!=='once'||date===s.effectiveFrom) &&
      (s.repeat!=='biweekly'||(s.effectiveFrom && (()=>{
        const start=new Date(`${s.effectiveFrom}T12:00:00`);
        const first=new Date(start);first.setDate(start.getDate()+(s.day-start.getDay()+7)%7);
        return (utcDate(date)-utcDate(dateKey(first)))%(14*dayMs)===0;
      })())) &&
      !(g.suppressedOccurrences||[]).some(skip=>skip.date===date&&skip.start===s.start) &&
      !existing.some(l=>l.groupId===g.id&&l.date===date&&l.start===s.start) &&
      !out.some(l=>l.groupId===g.id&&l.date===date&&l.start===s.start)
    ) out.push({id:crypto.randomUUID(),groupId:g.id,date,start:s.start,end:s.end,...(s.teacherId?{teacherId:s.teacherId}:{}),status:'planned',attendance:{},report:'',version:0});
  }
  return out;
}
export function demoData() {
  const today=new Date(),year=today.getFullYear(),month=today.getMonth();
  const names=['Английский · Старт','Английский · Юниоры','Китайский · Первые шаги','Код · Исследователи','Английский · Разговорный','Код · Создатели'];
  const groups=names.map((name,i)=>({id:`demo-${i}`,name,subject:subjects[i===2?1:i===3||i===5?2:0],teacherId:i%2?'teacher-2':'teacher-1',students:Array.from({length:3+i%4},(_,j)=>({id:`s-${i}-${j}`,name:`Ученик ${j+1}`})),schedule:[{day:(i%5)+1,start:`${String(9+i).padStart(2,'0')}:00`,end:`${String(10+i).padStart(2,'0')}:00`},{day:((i+2)%5)+1,start:`${String(9+i).padStart(2,'0')}:00`,end:`${String(10+i).padStart(2,'0')}:00`}],archived:false,version:0}));
  const lessons=recurrence(groups,year,month,[]).map(l=>({...l,status:l.date<dateKey(today)?'done':'planned'}));
  return {groups,lessons,users:[{id:'demo-admin',login:'admin',name:'Администратор',role:'admin'},{id:'teacher-1',login:'teacher1',name:'Преподаватель 01',role:'teacher'},{id:'teacher-2',login:'teacher2',name:'Преподаватель 02',role:'teacher'}]};
}
