import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('single accessible lesson button provides required visible fields',()=>{
  const start=ui.indexOf('<div className="agenda-list">');
  const end=ui.indexOf('</div><div className="agenda-tip">',start);
  assert.ok(start>0 && end>start);
  const lesson=ui.slice(start,end);
  assert.match(lesson,/className=\{`lesson-card \$\{color\(g.subject\)\}`\}/);
  assert.match(lesson,/aria-label=/);
  for(const field of ['lesson-card-when','lesson-card-subject','lesson-card-status','lesson-card-name','lesson-card-teacher','lesson-card-students']) assert.ok(lesson.includes(field),field);
  assert.equal((lesson.match(/<button\b/g)||[]).length,2,'only the lesson button and empty-day button; no nested controls');
});
test('responsive design supports phone, tablet, laptop and large desktop',()=>{
  for(const media of ['max-width:360px','max-width:740px','min-width:431px','min-width:741px','max-width:950px','min-width:951px','max-width:1200px']) assert.ok(css.includes(media),media);
  assert.ok(css.includes('flex-shrink:0;'),'cards cannot compress and hide rows in desktop scroll list');
  assert.ok(css.includes('.lesson-status-compact'),'short status badge is available for small screens');
  assert.ok(css.includes('minmax(0,1fr)'),'card content respects viewport width');
  assert.ok(css.includes('.page-header .header-actions button.primary'),'the add lesson button is not full width on small screens');
});
