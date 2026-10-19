import React,{useState} from 'react';
import {request} from './api.mjs';
import {activityTime} from './Presence.jsx';

export function JournalBackup(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(null);
 async function save(){
  setBusy(true);setError('');
  try{
   const copy=await request('backup');
   if(copy.format!=='orbita-journal'||copy.formatVersion!==1||!Array.isArray(copy.groups)||!Array.isArray(copy.lessons)||!Array.isArray(copy.users))throw Error('Не удалось проверить резервную копию. Повторите скачивание.');
   const blob=new Blob([JSON.stringify(copy,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=`orbita-backup-${copy.createdAt.replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setSaved({at:copy.createdAt,groups:copy.groups.length,lessons:copy.lessons.length});
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="panel backup-panel"><div className="panel-heading"><div><span className="eyebrow">ДАННЫЕ ЦЕНТРА</span><h2>Сохранить всю историю</h2></div></div><div className="modal-body"><p>Одна копия содержит все месяцы: группы, учеников, расписание, занятия, посещаемость и отчёты. Архив и корзина тоже сохраняются.</p><p className="subtle">Имена и роли сотрудников включены для связи с занятиями. Пароли и сеансы входа в файл не попадают. Скачивание доступно только главному admin и отмечается в журнале действий.</p><button className="primary" disabled={busy} onClick={save}>{busy?'Готовим копию…':'↓ Скачать полную копию JSON'}</button>{error&&<p className="error" role="alert">{error}</p>}{saved&&<p className="backup-success" role="status">Копия подготовлена: {activityTime(saved.at)} · {saved.groups} групп · {saved.lessons} занятий. Проверьте файл в загрузках браузера.</p>}<p className="subtle">Храните файл в закрытой папке: он содержит данные учеников. Это копия данных журнала; для восстановления её нужно загрузить в базу с проверкой связей. Автоматическое восстановление через сайт пока не включено.</p></div></section>;
}
