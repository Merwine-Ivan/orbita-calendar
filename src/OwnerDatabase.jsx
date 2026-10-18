import React,{useEffect,useState} from 'react';
import {request} from './api.mjs';

const scopes=[['trash','Очистить корзину занятий'],['archive','Очистить архив групп'],['group','Удалить архивную группу'],['period','Удалить занятия за период'],['schedule','Очистить правила расписания'],['reset','Полностью очистить рабочий журнал'],['imports','Отдельно очистить историю импортов']];
function saveFile(filename,data){const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function fmt(x){try{return new Date(x).toLocaleString('ru-RU');}catch{return String(x||'');}}
export function OwnerDatabase({groups,onDataChanged}){
 const [tab,setTab]=useState('backups'),[backups,setBackups]=useState([]),[backupId,setBackupId]=useState(''),[uploadedContent,setUploadedContent]=useState('');
 const [passphrase,setPassphrase]=useState(''),[ownerPassword,setOwnerPassword]=useState(''),[mode,setMode]=useState('merge');
 const [scope,setScope]=useState('trash'),[groupId,setGroupId]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [preview,setPreview]=useState(null),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const load=async()=>{const r=await request('maintenance/list');setBackups(r.backups||[]);};
 useEffect(()=>{load().catch(e=>setError('Резервное хранилище пока не готово: '+e.message));},[]);
 async function act(fn){setBusy(true);setError('');setStatus('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 function filters(){return scope==='group'||scope==='schedule'&&groupId?{groupId}:scope==='period'?{from,to}:{ };}
 async function downloadFile(id){const {content}=await request(`maintenance/download/${id}`);saveFile(id,content);}
 const counts=preview&&`${preview.groups} групп · ${preview.lessons} занятий · ${preview.scheduleRules} правил · ${preview.reports} отчётов · ${preview.attendanceMarks} отметок`;
 const safe=passphrase.length>=12;
 return <section className="owner-db panel" aria-label="Управление базой">
  <header className="owner-db-header"><div><p className="eyebrow">ТОЛЬКО ГЛАВНЫЙ АДМИНИСТРАТОР</p><h2>Управление базой</h2><p className="subtle">Полные зашифрованные копии и управляемая очистка. Учетные записи Auth и история аудита при восстановлении не перезаписываются.</p></div></header>
  <div className="owner-db-tabs" role="tablist">
   {[['backups','Резервные копии'],['purge','Очистка'],['restore','Восстановление']].map(([value,label])=><button key={value} type="button" role="tab" aria-selected={tab===value} className={tab===value?'selected':''} onClick={()=>{setTab(value);setError('');setPreview(null);setConfirm('');}}>{label}</button>)}
  </div>
  {error&&<div role="alert" className="error">{error}</div>}
  {status&&<div role="status" className="owner-db-success">{status}</div>}
  {tab==='backups'&&<div className="owner-db-body">
   <h3>Создать резервную копию всего журнала</h3>
   <p className="subtle">Включает группы, расписание, занятия, учеников, посещаемость, корзину, архив, журнал действий, профили (без паролей), историю импортов. Копия шифруется AES-256-GCM вашим секретным паролем. Запишите пароль отдельно: восстановить его невозможно.</p>
   <label>Пароль шифрования<input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} placeholder="Не меньше 12 символов"/></label>
   <button className="primary" disabled={busy||!safe} onClick={()=>act(async()=>{const r=await request('maintenance/backup','POST',{passphrase});await load();await downloadFile(r.backup.id);setStatus('Зашифрованная копия создана, проверена и загружена на устройство. Сохраните файл и пароль в надёжном месте.');setPassphrase('');})}>Создать, проверить и скачать копию</button>
   <h3>Ранее сохранённые копии</h3>
   <div className="backup-list">{backups.map(b=><div key={b.id} className="backup-item"><div><strong>{fmt(b.createdAt)}</strong><small>{Math.ceil(b.size/1024)} КБ · зашифровано</small></div><button disabled={busy} onClick={()=>act(()=>downloadFile(b.id))}>Скачать</button></div>)}{!backups.length&&<p className="subtle">Сохранённых копий пока нет.</p>}</div>
  </div>}
  {tab==='purge'&&<div className="owner-db-body">
   <h3>Выборочная или полная очистка</h3>
   <p className="subtle">Сначала проверка точного количества. Перед каждой очисткой сервер создаёт и проверяет зашифрованную резервную копию. Удаление выполняется одной транзакцией. Действие нельзя отменить без восстановления.</p>
   <label>Что очистить<select value={scope} onChange={e=>{setScope(e.target.value);setPreview(null);setConfirm('');}}>{scopes.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   {['group','schedule'].includes(scope)&&<label>{scope==='group'?'Архивная группа':'Группа (пусто — всё расписание)'}<select value={groupId} onChange={e=>{setGroupId(e.target.value);setPreview(null);}}><option value="">{scope==='schedule'?'Все группы':'Выберите группу'}</option>{groups.filter(g=>scope==='schedule'||g.archived).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
   {scope==='period'&&<div className="form-grid"><label>С<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPreview(null);}}/></label><label>По<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPreview(null);}}/></label></div>}
   {scope==='schedule'&&<p className="subtle">Удаляются только правила автоматического расписания. Уже созданные уроки и посещаемость остаются.</p>}
   {scope==='reset'&&<p className="owner-db-warning">Полный сброс удалит все группы и уроки, включая архив и корзину. Учётные записи, аудит, историю импортов и резервные копии он сохранит.</p>}
   <button disabled={busy||scope==='group'&&!groupId||scope==='period'&&(!from||!to)} onClick={()=>act(async()=>{const r=await request('maintenance/preview','POST',{scope,filter:filters()});setPreview(r.preview);setConfirm('');})}>Посчитать последствия</button>
   {preview&&<div className="owner-db-confirm"><h3>Будет затронуто</h3><strong>{counts}</strong><p className="subtle">Если состав данных изменится, сервер отменит операцию и потребует новый предпросмотр.</p>
     <label>Пароль шифрования аварийной копии<input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></label>
     <label>Ваш текущий пароль главного администратора<input type="password" autoComplete="current-password" value={ownerPassword} onChange={e=>setOwnerPassword(e.target.value)}/></label>
     <label>Введите УДАЛИТЬ НАВСЕГДА<input value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
     <button className="danger" disabled={busy||!safe||!ownerPassword||confirm!=='УДАЛИТЬ НАВСЕГДА'} onClick={()=>act(async()=>{const r=await request('maintenance/purge','POST',{scope,filter:filters(),signature:preview.signature,passphrase,ownerPassword,confirmation:confirm});await downloadFile(r.backup.id);await load();await onDataChanged();setPreview(null);setConfirm('');setOwnerPassword('');setPassphrase('');setStatus('Операция завершена. Аварийная копия скачана. Удалено занятий: '+r.result.lessons+', групп: '+r.result.groups+'.');})}>Создать аварийную копию и безвозвратно очистить</button>
   </div>}
  </div>}
  {tab==='restore'&&<div className="owner-db-body">
    <h3>Восстановление журнала</h3>
    <p className="subtle">Можно выбрать копию из закрытого хранилища или файл с устройства. Восстанавливаются группы, занятия и история импортов; аккаунты Supabase Auth и журнал аудита не перезаписываются. Перед операцией создаётся копия текущих данных.</p>
    <label>Сохранённая копия<select value={backupId} onChange={e=>{setBackupId(e.target.value);setUploadedContent('');}}><option value="">Выберите копию либо загрузите файл</option>{backups.map(b=><option key={b.id} value={b.id}>{fmt(b.createdAt)} — {b.id.slice(0,8)}</option>)}</select></label>
    <label>Или файл с устройства<input type="file" accept=".orbita,.json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>7_000_000){setError('Файл слишком большой');return;}setUploadedContent(await f.text());setBackupId('');}}/></label>
    <label>Режим<select value={mode} onChange={e=>setMode(e.target.value)}><option value="merge">Добавить недостающие записи (без удаления текущих)</option><option value="replace">Полностью заменить рабочие группы и занятия</option></select></label>
    <label>Пароль шифрования копии<input type="password" autoComplete="off" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></label>
    <label>Текущий пароль главного администратора<input type="password" autoComplete="current-password" value={ownerPassword} onChange={e=>setOwnerPassword(e.target.value)}/></label>
    <button disabled={busy||!backupId&&!uploadedContent} onClick={()=>act(async()=>{const r=await request('maintenance/preview','POST',{scope:'reset',filter:{}});setPreview(r.preview);setConfirm('');})}>Проверить текущее состояние перед восстановлением</button>
    {preview&&<div className="owner-db-confirm"><strong>Сейчас в базе: {counts}</strong><p className="subtle">При замене рабочие группы и занятия будут заменены данными копии. Это действие нельзя отменить без сохранённой аварийной копии.</p>
      <label>Введите ВОССТАНОВИТЬ ДАННЫЕ<input value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
      <button className={mode==='replace'?'danger':'primary'} disabled={busy||!safe||!ownerPassword||confirm!=='ВОССТАНОВИТЬ ДАННЫЕ'} onClick={()=>act(async()=>{const r=await request('maintenance/restore','POST',{backupId,uploadedContent:uploadedContent||undefined,mode,passphrase,ownerPassword,signature:preview.signature,confirmation:confirm});await downloadFile(r.emergencyBackup.id);await load();await onDataChanged();setConfirm('');setPreview(null);setOwnerPassword('');setPassphrase('');setUploadedContent('');setStatus(`Восстановлено групп: ${r.result.groups}, занятий: ${r.result.lessons}. Аварийная копия текущего состояния скачана.`);})}>Проверить, создать аварийную копию и восстановить</button>
    </div>}
  </div>}
 </section>;
}
