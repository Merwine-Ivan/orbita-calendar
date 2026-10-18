export const isManager=role=>role==='owner'||role==='admin';
export const roleLabel=role=>({owner:'Главный admin',admin:'Субадмин',teacher:'Преподаватель'})[role]||'Нет доступа';
// The owner is provisioned separately; neither role can create another owner.
export const canCreateAccount=(actor,role)=>(actor==='owner'&&['admin','teacher'].includes(role))||(actor==='admin'&&role==='teacher');
export const canManageAccount=(actor,target)=>(actor==='owner'&&['admin','teacher'].includes(target))||(actor==='admin'&&target==='teacher');
import {subjects} from './model.mjs';
export const canTeachGroup=(user,group)=>Boolean(user&&group&&(isManager(user.role)||(user.role==='teacher'&&group.teacherId===user.id&&(group.createdBy===user.id||user.subjects?.includes(group.subject)||!subjects.includes(group.subject)))));
