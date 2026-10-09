import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
test('standalone manifest and locale parity',()=>{
 const m=read('../module.json');assert.equal(m.id,'riftan-smart-assessment');
 for(const p of [...m.esmodules,...m.styles,...m.languages.map(l=>l.path),'LICENSE','README.md'])assert.ok(existsSync(new URL('../'+p,import.meta.url)),p);
 const en=read('../lang/en.json'),ru=read('../lang/ru.json');assert.deepEqual(Object.keys(en),Object.keys(ru));
 for(const key of Object.keys(en))assert.deepEqual(ru[key].match(/\{[^{}]+\}/g)??[],en[key].match(/\{[^{}]+\}/g)??[],key);
 assert.equal(m.manifest,'https://github.com/DarkReef/riftan-smart-assessment/releases/latest/download/module.json');
});

test('combat reference is owned and shipped by the module',()=>{
 const m=read('../module.json');
 assert.ok(m.styles.includes('action-reference.css'));
 assert.equal(m.download,`https://github.com/DarkReef/riftan-smart-assessment/releases/download/v${m.version}/riftan-smart-assessment.zip`);
 const app=readFileSync(new URL('../scripts/combat/action-reference.mjs',import.meta.url),'utf8');
 assert.match(app,/const NAMESPACE = "riftan-smart-assessment"/);
 assert.match(app,/modules\/riftan-smart-assessment\/templates\/action-reference.hbs/);
 assert.doesNotMatch(app,/systems\/dark-heresy/);
 assert.ok(existsSync(new URL('../templates/action-reference.hbs',import.meta.url)));
 const main=readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8');
 assert.match(main,/Hooks.once\('init',[\s\S]*?registerCombatActionReference\(\)/);
 assert.match(main,/api=\{[^}]*requestReroll[^}]*openCombatActionReference[^}]*toggleCombatActionReference/);
 const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
 const zipLine=workflow.split('\n').find(line=>line.includes('zip -r'));
 for(const entry of ['templates','scripts','action-reference.css','module.json','RELEASE.md']) assert.ok(zipLine.includes(entry),entry);
});
