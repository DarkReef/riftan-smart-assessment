import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fieldCatalog,searchFields} from '../scripts/fields.mjs';
const ru=JSON.parse(readFileSync(new URL('../lang/ru.json',import.meta.url),'utf8'));
const loc=k=>ru[k]??({'SKILL.TECH_USE':'Пользование техники','SKILL.AWARENESS':'Бдительность'}[k]??k);
test('Russian OW characteristic and skill search works with an empty registry',()=>{
 const actor={system:{characteristics:{ballisticSkill:{base:30,tempModifier:0}},skills:{techUse:{advance:10},awareness:{advance:0}}}};
 const catalog=fieldCatalog(actor,{},loc);
 assert.equal(searchFields(catalog,'дальний')[0].key,'system.characteristics.ballisticSkill.base');
 assert.equal(searchFields(catalog,'бдительность')[0].key,'system.skills.awareness.advance');
 assert.equal(searchFields(catalog,'пользование техники')[0].key,'system.skills.techUse.advance');
 assert.equal(fieldCatalog({system:{damage:'1d10'}},{},loc).length,0);
});
test('OW aliases, English and native paths resolve to one canonical field without changing native values',()=>{
 const old=globalThis.game;
 globalThis.game={darkHeresy:{localization:{characteristicTerm:()=>({label:'Дальний бой',aliases:['Стрельба','Ballistic Skill','BS']})}}};
 try{
  const target={system:{ruleset:'ow',characteristics:{ballisticSkill:{tempModifier:0,label:'CHARACTERISTIC.BALLISTIC_SKILL'}}}};
  const catalog=fieldCatalog(target,{},k=>k);
  for(const query of ['дальний','стрельба','ballistic','system.characteristics.ballisticSkill.tempModifier']){
   const result=searchFields(catalog,query);assert.equal(result.length,1);assert.equal(result[0].key,'system.characteristics.ballisticSkill.tempModifier');assert.ok(result[0].label.startsWith('Дальний бой'));
  }
 }finally{globalThis.game=old;}
});
