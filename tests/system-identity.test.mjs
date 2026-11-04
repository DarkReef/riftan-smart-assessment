import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUPPORTED_SYSTEM_IDS,isSupportedSystem,getSystemFlag} from '../scripts/system-identity.mjs';
import {enhanceRollCard} from '../scripts/chat.mjs';
import {rollData} from '../scripts/fate.mjs';
import {renderDamageControls} from '../scripts/combat/damage-ui.mjs';

test('manifest supports both Apex package IDs with matching runtime gates and owned update sources',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../module.json',import.meta.url),'utf8'));
    assert.deepEqual(manifest.relationships.systems.map(s=>s.id),SUPPORTED_SYSTEM_IDS);
    for(const system of manifest.relationships.systems) {
        assert.equal(isSupportedSystem(system.id),true);
        assert.equal(system.compatibility.minimum,system.id==='apex-heresy-ru'?'1.7.0':'1.5.6');
        assert.equal(system.manifest,`https://github.com/DarkReef/Apex-Heresy-Ru/releases/${system.id==='dark-heresy'?'download/v1.5.6-ru':'latest/download'}/system.json`);
    }
    assert.equal(isSupportedSystem('unrelated'),false);
});

test('existing roll and damage flags survive the package rename without getFlag scope validation',()=>{
    const data={result:48,flags:{isSuccess:false}};
    const message={flags:{'dark-heresy':{rollData:data,damageJournal:{status:'applied'}}},
        getFlag(){throw Error('Invalid installed package scope');}};
    assert.equal(rollData(message),data);
    assert.equal(getSystemFlag(message,'damageJournal.status'),'applied');
    assert.equal(getSystemFlag(message,'damageRequest'),undefined);
    assert.equal(getSystemFlag(null,'rollData'),undefined);
});

test('chat and damage controls accept both IDs while preserving native CSS selectors',()=>{
    const before=globalThis.game;
    try {
        for(const id of [...SUPPORTED_SYSTEM_IDS,'unrelated']) {
            globalThis.game={system:{id}};
            const selectors=[];
            const root={querySelector(){},querySelectorAll:s=>{selectors.push(s);return [];}};
            const message={isContentVisible:true,flags:{},getFlag(){throw Error('Invalid scope');}};
            enhanceRollCard(message,root);
            renderDamageControls(message,root);
            assert.deepEqual(selectors,isSupportedSystem(id)?['.dark-heresy.chat.roll','.rsa-damage-confirmation']:[]);
        }
    } finally {globalThis.game=before;}
});
