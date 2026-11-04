import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SCOPE,rollData,fateActor,validateReroll,createFateService} from '../scripts/fate.mjs';
import {isSupportedSystem} from '../scripts/system-identity.mjs';
import {enhanceRollCard} from '../scripts/chat.mjs';

function patch(document,updates) {
    for(const [path,value] of Object.entries(updates)) {
        const keys=path.split('.');let target=document;
        while(keys.length>1)target=target[keys.shift()]??={};
        target[keys[0]]=structuredClone(value);
    }
}

function message(id,data,extra={}) {
    return {id,isRoll:true,author:{id:'owner'},whisper:[],blind:false,flags:{'dark-heresy':{rollData:data}},
        getFlag(scope,key){return this.flags[scope]?.[key];},
        async setFlag(scope,key,value){patch(this,{[`flags.${scope}.${key}`]:value});return this;},
        async update(updates){patch(this,updates);return this;},updateSource(updates){patch(this,updates);},...extra};
}

function fixture() {
    const listeners=new Map();
    const register=(name,callback)=>{const callbacks=listeners.get(name)??[];callbacks.push(callback);listeners.set(name,callbacks);};
    const actor={id:'actor',uuid:'Actor.actor',name:'Actor',type:'acolyte',attributeBoni:{},system:{fate:{value:3,max:4}},
        testUserPermission:user=>user.id==='owner',async update(updates){patch(this,updates);return this;}};
    const owner={id:'owner',isGM:false},gm={id:'gm',isGM:true};
    const source=message('root',{actorUuid:actor.uuid,ownerId:actor.id,result:87,target:{base:40,modifier:0,final:40},
        workflowRootMessageId:'root',flags:{isSuccess:false,isCombatRoll:true}});
    const request=message('request',null,{isRoll:false,author:owner,flags:{[SCOPE]:{request:{sourceId:source.id,status:'pending'}}}});
    const list=[source,request],created=[];
    const game={system:{id:'apex-heresy-ru'},user:gm,users:{activeGM:gm},actors:new Map([[actor.id,actor]]),
        modules:new Map([[SCOPE,{}]]),i18n:{localize:key=>key,format:key=>key},
        messages:{get:id=>list.find(entry=>entry.id===id),get contents(){return list;}},
        darkHeresy:{config:{},tests:{fateSnapshotVersion:1,combatRoll:null}}};
    const context=vm.createContext({game,Hooks:{once:register,on:register},
        foundry:{utils:{deepClone:structuredClone,escapeHTML:value=>value}},
        ui:{notifications:{warn(){},error(){}}},isSupportedSystem:()=>isSupportedSystem(game.system.id),SCOPE,rollData,fateActor,validateReroll,createFateService,enhanceRollCard,
        fromUuidSync:()=>actor,console,Math,Map,WeakMap,Promise,structuredClone,
        openCombatActionReference(){},toggleCombatActionReference(){},
        setTimeout:(callback,_ms)=>setTimeout(callback,30),clearTimeout,
        ChatMessage:{async create(data){
            const result=message('new-result',null);result.updateSource(data);
            for(const hook of listeners.get('preCreateChatMessage')??[])if(hook(result)===false)return null;
            list.push(result);created.push(result);
            for(const hook of listeners.get('createChatMessage')??[])hook(result);
            return result;
        }}});
    const sourceText=readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8')
        .replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
    vm.runInContext(sourceText,context,{filename:'main.mjs'});
    for(const ready of listeners.get('ready')??[])ready();
    return {actor,source,request,game,created,list,context,service:vm.runInContext('service',context)};
}

test('inline Fate reroll persists history on the existing combat root and completes without replacement or duplicate chat',async()=>{
    const f=fixture();
    f.game.darkHeresy.tests.combatRoll=async data=>{
        await f.source.update({'flags.dark-heresy.rollData':{...data,result:24,flags:{...data.flags,isSuccess:true}}});
        return {status:'resolved'};
    };
    const result=await f.service(f.request);
    assert.equal(result,f.source);assert.equal(f.created.length,0);
    assert.equal(f.actor.system.fate.value,2);assert.equal(f.actor.system.fate.max,4);
    assert.equal(f.request.getFlag(SCOPE,'request').status,'done');
    assert.equal(f.source.getFlag(SCOPE,'replacement'),undefined);
    const history=f.source.getFlag(SCOPE,'fate');
    assert.equal(history.sourceId,'root');assert.equal(history.before,87);assert.equal(history.after,24);
    assert.equal(history.success,true);assert.equal(history.requestId,'request');
    assert.ok(Number.isInteger(history.phraseIndex)&&history.phraseIndex>=0&&history.phraseIndex<10);
    await assert.rejects(f.service({...f.request,id:'second',getFlag:(_scope,key)=>key==='request'?{sourceId:'root',status:'pending'}:undefined}),/NOT_FAILED|USED/);
    assert.equal(f.actor.system.fate.value,2);
});

test('legacy reroll still waits for the newly created roll and links its replacement',async()=>{
    const f=fixture();delete rollData(f.source).workflowRootMessageId;
    f.game.darkHeresy.tests.combatRoll=async data=>{
        await f.context.ChatMessage.create({flags:{'dark-heresy':{rollData:{...data,result:70,flags:{...data.flags,isSuccess:false}}}}});
        return {status:'resolved'};
    };
    const result=await f.service(f.request);
    assert.equal(result.id,'new-result');assert.equal(f.created.length,1);
    assert.equal(f.actor.system.fate.value,2);assert.equal(f.source.getFlag(SCOPE,'replacement'),'new-result');
    assert.equal(result.getFlag(SCOPE,'fate').after,70);assert.equal(result.getFlag(SCOPE,'fate').success,false);
    assert.equal(f.request.getFlag(SCOPE,'request').status,'done');
});

test('cancelled inline rolls refund Fate and leave no successful history or completion',async()=>{
    const f=fixture();f.game.darkHeresy.tests.combatRoll=async()=>({status:'cancelled'});
    await assert.rejects(f.service(f.request),/Roll cancelled/);
    assert.equal(f.actor.system.fate.value,3);assert.equal(f.source.getFlag(SCOPE,'fate'),undefined);
    assert.equal(f.request.getFlag(SCOPE,'request').status,'pending');assert.equal(f.created.length,0);
});

test('an unrelated root request id cannot be mistaken for this reroll result',async()=>{
    const f=fixture();f.game.darkHeresy.tests.combatRoll=async data=>{
        await f.source.update({'flags.dark-heresy.rollData':{...data,result:24,flags:{...data.flags,isReRoll:true,rsaRequestId:'other-request'}}});
        return {status:'resolved'};
    };
    await assert.rejects(f.service(f.request),/Chat creation timed out/);
    assert.equal(f.actor.system.fate.value,3);assert.equal(f.source.getFlag(SCOPE,'fate'),undefined);
});

test('committed, running or unresolved dependent combat operations refuse Fate before spending',async()=>{
    for(const row of [{phase:'applied'},{phase:'applying'},{phase:'needsReview'},
        {phase:'reaction',operation:{id:'running'}},{phase:'reaction',pinning:{conditionApplied:true}},
        {phase:'reaction',pinning:{operation:{id:'pinning'}}},{phase:'reaction',pinning:{phase:'needsReview'}}]) {
        const f=fixture();f.source.flags['dark-heresy'].combatWorkflow={targets:[row]};
        f.game.darkHeresy.tests.combatRoll=()=>assert.fail('roll executed after dependent operation');
        await assert.rejects(f.service(f.request),/USED/);
        assert.equal(f.actor.system.fate.value,3);
    }
});

test('a successfully persisted inline result is never refunded when the cosmetic history write fails',async()=>{
    const f=fixture();f.game.darkHeresy.tests.combatRoll=async data=>{
        await f.source.update({'flags.dark-heresy.rollData':{...data,result:78,flags:{...data.flags,isSuccess:false}}});
        return {status:'resolved'};
    };
    f.source.setFlag=async()=>{throw Error('history unavailable');};
    const result=await f.service(f.request);
    assert.equal(result,f.source);assert.equal(f.actor.system.fate.value,2);
    assert.equal(rollData(f.source).flags.isReRoll,true);assert.equal(f.request.getFlag(SCOPE,'request').status,'done');
});
