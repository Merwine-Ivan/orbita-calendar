export async function readTransferFile(file,restore){
 const limit=restore?5000000:1000000;
 if(!file||file.size>limit)throw Error(restore?'Файл до 5 МБ':'CSV до 1 МБ');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw Error('Не удалось прочитать файл как UTF-8. Выберите исходную копию, не пересохранённую в другой кодировке.');}
 if(!text.trim())throw Error('Файл пуст');
 return text;
}
