import React,{useId,useState} from 'react';

export function PasswordField({label,...props}){
 const id=useId();
 const [visible,setVisible]=useState(false);
 return <div className="password-field"><label htmlFor={id}>{label}</label><div className="password-control"><input {...props} id={id} type={visible?'text':'password'}/><button type="button" className="password-toggle" aria-label={`${visible?'Скрыть':'Показать'} пароль: ${label}`} aria-pressed={visible} aria-controls={id} onClick={()=>setVisible(v=>!v)}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible&&<path d="m3 3 18 18"/>}</svg></button></div></div>;
}
