import React from 'react';
export const activityTime=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU',{timeZone:'Asia/Omsk',dateStyle:'short',timeStyle:'short'}):'Ещё не заходил';
export function Presence({person}){return <><span className={person.online?'presence-online':'subtle'}>{person.online?'● В сети':'Не в сети'}</span><small className="presence-time">{person.lastSeenAt?`Последняя активность: ${activityTime(person.lastSeenAt)}`:'Ещё не заходил'}</small></>;}
