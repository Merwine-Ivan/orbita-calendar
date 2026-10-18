import React,{useState} from 'react';
import {canCreateAccount,roleLabel} from './roles.mjs';

export function TeamProvision({users,actorRole,onCreate,onClose}){
 const [text,setText]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [completed,setCompleted]=useState([]);
 const rows=text.trim()?text.trim().split(/\r?\n/).map(line=>{const [name='',login='',role='']=line.split(';').map(s=>s.trim());return {name,login:login.toLowerCase(),role,subjects:[],useDefault:true};}):[];
 const invalid=rows.some(r=>!r.name||r.name.length>80||!/^[a-z0-9_.-]{3,40}$/.test(r.login)||!canCreateAccount(actorRole,r.role))||new Set(rows.map(r=>r.login)).size!==rows.length||rows.length>50;
 const existing=r=>users.some(u=>u.login?.toLowerCase()===r.login)||completed.includes(r.login);
 const remaining=rows.filter(r=>!existing(r));
 async function submit(e){e.preventDefault();if(invalid||!remaining.length)return;setBusy(true);setError('');try{for(const row of remaining){await onCreate(row);setCompleted(c=>[...c,row.login]);}}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <form onSubmit={submit}><div className="modal-body"><p>Аккаунты получат временный пароль из серверных настроек. При первом входе каждый сотрудник обязан его заменить.</p><label>Список сотрудников<textarea aria-label="Список сотрудников" rows={8} value={text} disabled={busy||completed.length>0} onChange={e=>{setText(e.target.value);setError('');}} placeholder="Имя;login;teacher или admin"/></label><p className="subtle">Одна строка: имя;логин;роль (admin — субадмин, teacher — преподаватель). Предметы и группы назначаются отдельно в профилях. Существующие логины пропускаются без смены пароля и роли.</p>{invalid&&<p className="error" role="alert">Проверьте имена, уникальность логинов и доступные роли. Не более 50 сотрудников.</p>}{rows.length>0&&!invalid&&<div className="table-scroll"><table><thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Состояние</th></tr></thead><tbody>{rows.map(r=><tr key={r.login}><td>{r.name}</td><td>{r.login}</td><td>{roleLabel(r.role)}</td><td>{completed.includes(r.login)?'Создан':existing(r)?'Уже существует':'К созданию'}</td></tr>)}</tbody></table></div>}{error&&<p className="error" role="alert">{error}. Уже созданные аккаунты сохранены; повторное нажатие продолжит с остальных.</p>}{completed.length>0&&<p role="status">Создано аккаунтов: {completed.length}</p>}</div><footer className="modal-footer"><button type="button" disabled={busy} onClick={onClose}>Закрыть</button><button className="primary" disabled={busy||invalid||!remaining.length}>{busy?'Создаём…':`Создать аккаунты (${remaining.length})`}</button></footer></form>;
}
