import {digest} from './transfer-utils.mjs';
export async function sealBackup(copy){const {integrity,...content}=copy;return {...content,integrity:{algorithm:'SHA-256',value:await digest(content)}};}
export async function verifyBackup(copy){
 if(copy.integrity===undefined)return false;
 const {integrity,...content}=copy;
 if(!integrity||integrity.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/.test(integrity.value)||await digest(content)!==integrity.value)throw Error('Контрольная сумма копии не совпадает. Файл повреждён или изменён; восстановление остановлено.');
 return true;
}
