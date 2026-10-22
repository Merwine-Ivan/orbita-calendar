// Presentation only: preserve independent identities and all memberships.
export function studentListSections(people, collapse=true){
 const sections=new Map();
 for(const person of people){
  const name=String(person.profile.name||'').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('ru');
  const key=collapse&&name?`name:${name}`:`person:${person.id}`;
  if(!sections.has(key))sections.set(key,{key,name:person.profile.name,people:[]});
  sections.get(key).people.push(person);
 }
 return [...sections.values()];
}
