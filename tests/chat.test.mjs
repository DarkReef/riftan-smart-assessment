import {test} from 'node:test';
import assert from 'node:assert/strict';
import {traitParts} from '../scripts/chat.mjs';
test('trait labels use system translation and preserve parameters and unknown names',()=>{
 const terms={Blast:'Взрыв',Reliable:'Надёжное',Storm:'Шквальное'};
 const lookup=v=>terms[v]??v;
 assert.deepEqual(traitParts('Blast (3), Reliable, Custom (1, 2)',true,lookup).map(p=>p.label),['Взрыв (3)','Надёжное','Custom (1, 2)']);
 assert.equal(traitParts('Storm',false,lookup)[0].label,'Storm');
 assert.equal(traitParts('Storm',true)[0].label,'Storm');
 globalThis.game={darkHeresy:{localization:{ruleTerm:lookup}}};
 assert.equal(traitParts('Storm',true)[0].label,'Шквальное');
 delete globalThis.game;
});
