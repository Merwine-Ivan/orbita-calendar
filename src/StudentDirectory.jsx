import React,{useMemo,useState} from 'react';
import {directory} from './student-directory.mjs';
import {studentListSections} from './student-list.mjs';
import {StudentFields} from './StudentFields.jsx';
import {canTeachGroup,isManager} from './roles.mjs';
import {OperationPreview} from './OperationPreview.jsx';
export function StudentDirectory({groups,actor,onApplied}){
 const people=useMemo(()=>directory(groups),[groups]),[search,setSearch]=useState(''),[selected,setSelected]=useState([]),[target,setTarget]=useState(''),[editing,setEditing]=useState(null),[draft,setDraft]=useState(null);
 const [collapse,setCollapse]=useState(true),[expanded,setExpanded]=useState([]);
 const manager=isManager(actor.role);
 const rows=people.filter(p=>(manager||groups.some(g=>!g.archived&&canTeachGroup(actor,g)&&g.students.some(s=>(s.personId||s.id)===p.id)))&&[p.profile.name,p.profile.phone,p.profile.guardianName,p.profile.guardianPhone,...p.memberships.map(m=>m.groupName)].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase())));
 const sections=studentListSections(rows,collapse);
 function choose(id){setEditing(null);setDraft(null);setSelected(old=>{const next=old.includes(id)?old.filter(x=>x!==id):[...old,id];if(!next.includes(target))setTarget(next[0]||'');return next;});}
 function memberships(list){return list.map(m=><div key={m.groupId}>{m.groupName}{m.archived?' · неактивна':''}{m.code?` · ${m.code}`:''}</div>);}
 function personRow(p,nested=false){return <tr key={p.id} className={nested?'student-match-detail':''}>
  <td>{manager&&<input type="checkbox" aria-label={`Объединить: ${p.profile.name} · ${p.id}`} checked={selected.includes(p.id)} onChange={()=>choose(p.id)}/>}</td>
  <td><strong>{p.profile.name}</strong><small className="presence-time">{[p.profile.age!=null?`${p.profile.age} лет`:'',p.memberships.length>1?'Общая карточка':'Одна группа'].filter(Boolean).join(' · ')}</small></td>
  <td>{p.profile.phone||'—'}<small className="presence-time">{[p.profile.guardianName,p.profile.guardianPhone].filter(Boolean).join(' · ')}</small></td>
  <td>{memberships(p.memberships)}</td>
  <td><button aria-label={`Открыть карточку: ${p.profile.name}`} onClick={e=>{setSelected([]);setEditing(p.id);setDraft({id:p.id,...p.profile});e.currentTarget.closest('section')?.scrollIntoView({behavior:'smooth'});}}>Открыть</button></td>
 </tr>;}
 return <section className="panel student-directory">
  <div className="panel-heading"><div><h2>Ученики · {sections.length} строк · {rows.length} карточек</h2><p className="subtle">Совпадающие ФИО свёрнуты в одну строку. Разверните её, чтобы проверить контакты и связать карточки одного ученика. Данные автоматически не объединяются.</p></div></div>
  <div className="modal-body student-directory-body">
   <label>Поиск ученика, группы или телефона<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <label className="student-collapse-toggle"><input type="checkbox" checked={collapse} onChange={e=>setCollapse(e.target.checked)}/>Свернуть совпадающие ФИО</label>
   {selected.length>0&&<p>Выбрано: {selected.length}<button onClick={()=>{setSelected([]);setTarget('');}}>Очистить выбор</button></p>}
   {selected.length>1&&<div className="student-operation"><h3>Объединить карточки одного человека</h3><label>Основная карточка (её ФИО и контакты будут общими)<select value={target} onChange={e=>setTarget(e.target.value)}>{selected.map(id=><option key={id} value={id}>{people.find(p=>p.id===id)?.profile.name} · {people.find(p=>p.id===id)?.memberships.map(m=>m.groupName).join(', ')}</option>)}</select></label><OperationPreview kind="students" input={{action:'link',personId:target,sourceIds:selected}} onApplied={async()=>{await onApplied();setSelected([]);setTarget('');}}/></div>}
   {editing&&draft&&<div className="student-operation"><h3>Общая карточка: {draft.name}</h3><p className="subtle">Изменения ФИО и контактов применятся во всех связанных группах. Коды и членство в группах здесь не меняются.</p><StudentFields students={[draft]} showCode={false} removable={false} onChange={rows=>setDraft(rows[0])}/><OperationPreview kind="students" input={{action:'update',personId:editing,profile:draft}} onApplied={onApplied}/><button onClick={()=>{setEditing(null);setDraft(null);}}>Закрыть карточку</button></div>}
   <div className="table-scroll"><table><colgroup><col className="student-select-column"/><col className="student-name-column"/><col className="student-contact-column"/><col/><col className="student-action-column"/></colgroup><thead><tr><th>Выбор</th><th>Ученик</th><th>Контакты</th><th>Группы</th><th>Карточки</th></tr></thead>
    {sections.map(section=>{
     if(section.people.length===1)return <tbody key={section.key}>{personRow(section.people[0])}</tbody>;
     const open=expanded.includes(section.key),allMemberships=[...new Map(section.people.flatMap(p=>p.memberships).map(m=>[m.groupId,m])).values()];
     const phones=[...new Set(section.people.flatMap(p=>[p.profile.phone,p.profile.guardianPhone]).filter(Boolean))];
     return <tbody key={section.key} className="student-name-match"><tr>
      <td><span aria-hidden="true">{open?'▾':'▸'}</span></td>
      <td><strong>{section.name}</strong><small className="presence-time">Совпадает ФИО · карточек: {section.people.length}</small></td>
      <td>{phones.length?phones.map(phone=><div key={phone}>{phone}</div>):'—'}</td>
      <td>{memberships(allMemberships)}</td>
      <td><button aria-label={`${open?'Свернуть':'Развернуть'} карточки: ${section.name}`} aria-expanded={open} onClick={()=>setExpanded(old=>open?old.filter(key=>key!==section.key):[...old,section.key])}>{open?'Свернуть':'Развернуть'}</button></td>
     </tr>{open&&<><tr><td colSpan={5} className="student-match-help">Проверьте, что это один человек. Для общей карточки отметьте нужные записи слева и выберите основную карточку в блоке выше. Посещаемость и членство в группах сохраняются.</td></tr>{section.people.map(p=>personRow(p,true))}</>}</tbody>;
    })}
   </table></div>{!rows.length&&<p>Совпадений нет.</p>}
  </div>
 </section>;
}
