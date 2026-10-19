export const contactKeys=['code','phone','guardianName','guardianPhone','age','gender'];
export function studentRecord(s){
 if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Проверьте карточку ученика');
 if(typeof s.name!=='string'||!s.name.trim()||s.name.trim().length>240)throw Error('ФИО ученика: от 1 до 240 символов');
 const out={id:s.id,name:s.name.trim()};
 for(const [key,max] of [['code',80],['phone',30],['guardianPhone',30],['guardianName',120]])if(s[key]!=null&&s[key]!==''){
  if(typeof s[key]!=='string'||s[key].length>max||/[\x00-\x1f\x7f]/.test(s[key]))throw Error('Проверьте контактные данные ученика');
  const v=s[key].trim();if(key.toLowerCase().includes('phone')&&!/^\+?[\d ()-]{5,30}$/.test(v))throw Error('Телефон: используйте цифры, +, скобки и дефис');if(v)out[key]=v;
 }
 if(s.age!==undefined&&s.age!==null&&s.age!==''){const age=Number(s.age);if(!Number.isInteger(age)||age<0||age>120)throw Error('Возраст: целое число от 0 до 120');out.age=age;}
 if(s.gender){if(!['female','male','unspecified'].includes(s.gender))throw Error('Проверьте пол ученика');out.gender=s.gender;}
 return out;
}
export function visibleStudent(s,privateAccess){if(privateAccess)return s;return {id:s.id,name:s.name,...(s.code?{code:s.code}:{})};}
