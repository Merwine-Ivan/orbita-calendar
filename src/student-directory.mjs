import {studentRecord} from './student.mjs';
import {uuid,stable,digest} from './transfer-utils.mjs';
export const profileKeys=['name','phone','guardianName','guardianPhone','age','gender'];
export const personId=s=>s.personId||s.id;
export function profileOf(s){return Object.fromEntries(profileKeys.filter(k=>s[k]!==undefined&&s[k]!=='').map(k=>[k,s[k]]));}
export function directory(groups){
 const entries=new Map();for(const g of groups)for(const s of g.students){const id=personId(s);let p=entries.get(id);if(!p){p={id,profile:profileOf(s),memberships:[]};entries.set(id,p);}if(Object.keys(profileOf(s)).length>Object.keys(p.profile).length)p.profile=profileOf(s);p.memberships.push({groupId:g.id,groupName:g.name,archived:g.archived,memberId:s.id,code:s.code||''});}return [...entries.values()].sort((a,b)=>a.profile.name.localeCompare(b.profile.name,'ru'));
}
export function sameProfile(a,b){return stable(profileOf(a))===stable(profileOf(b));}
export function assertSharedProfiles(groups){const profiles=new Map();for(const g of groups)for(const s of g.students){if(s.personId&&!uuid(s.personId))throw Error('Некорректная связь единой карточки');const id=personId(s);if(profiles.has(id)&&!sameProfile(profiles.get(id),s))throw Error('Связанные карточки отличаются. Сначала обновите единую карточку в разделе «Ученики».');profiles.set(id,s);}}
export async function studentPlan({groups,lessons,input}){
 if(!input||!['update','link'].includes(input.action)||!uuid(input.personId))throw Error('Выберите единую карточку');
 const people=directory(groups),target=people.find(p=>p.id===input.personId);if(!target)throw Error('Ученик не найден');
 let profile=profileOf(studentRecord({id:target.id,...(input.action==='link'?target.profile:input.profile)}));
 const ids=input.action==='link'?input.sourceIds:[target.id];if(!Array.isArray(ids)||ids.length<1||ids.length>50||ids.some(id=>!uuid(id)||!people.some(p=>p.id===id))||input.action==='link'&&(!ids.includes(target.id)||new Set(ids).size<2))throw Error('Выберите от 2 до 50 карточек для объединения');
 const chosen=new Set(ids);for(const g of groups)if(g.students.filter(s=>chosen.has(personId(s))).length>1)throw Error(`В группе «${g.name}» выбраны две разные записи ученика. Сначала проверьте состав: автоматическое удаление записи потеряет связь с посещаемостью.`);
 const changes={groups:[],lessons:[]},details=[];
 for(const g of groups){if(!g.students.some(s=>chosen.has(personId(s))))continue;const students=g.students.map(s=>{if(!chosen.has(personId(s)))return s;const copy={...s,personId:target.id};for(const k of profileKeys)delete copy[k];return {...copy,...profile};});const payload={...g,students};if(stable(payload)===stable(g))continue;changes.groups.push({expectedVersion:g.version,payload});details.push({label:g.name,students:students.filter(s=>s.personId===target.id).map(s=>s.id)});}
 const checks={groups:groups.map(g=>({id:g.id,version:g.version})),lessons:lessons.map(l=>({id:l.id,version:l.version}))};
 const summary={newGroups:0,updatedGroups:changes.groups.length,newStudents:0,newLessons:0,updatedLessons:0,skipped:0};
 const warnings=input.action==='link'?['Будут использованы ФИО и контакты выбранной основной карточки. Коды в группах, ID записей и все отметки посещаемости сохраняются. Исходные сведения сохранятся в резервной копии перед объединением.']:[];
 return {changes,checks,summary,details,warnings,profile,digest:await digest({input,changes,checks})};
}
