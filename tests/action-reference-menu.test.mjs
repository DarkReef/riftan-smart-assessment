import {test} from 'node:test';
import assert from 'node:assert/strict';

const calls=[];
class ApplicationStub {
    rendered=false;
    async render(){calls.push('open');this.rendered=true;}
    async close(){calls.push('close');this.rendered=false;}
    async maximize(){calls.push('maximize');}
    bringToFront(){calls.push('front');}
}
const originalMenu={label:'Original menu'};
globalThis.foundry={applications:{api:{ApplicationV2:ApplicationStub,HandlebarsApplicationMixin:base=>base},ui:{MainMenu:{ITEMS:{original:originalMenu}}}}};
globalThis.game={system:{id:'dark-heresy'},user:{isGM:false},i18n:{localize:key=>key}};
globalThis.Hooks={on(){}};
globalThis.ui={notifications:{error:message=>{throw Error(message);}}};
const {addReferenceSettingsButton,registerReferenceMenus}=await import('../scripts/combat/action-reference-menu.mjs');

class Element {
    constructor(tag){this.tagName=tag;this.dataset={};this.children=[];this.listeners={};this.ownerDocument={createElement:tag=>new Element(tag)};}
    append(...children){this.children.push(...children);}
    setAttribute(name,value){this[name]=value;}
    addEventListener(type,listener){this.listeners[type]=listener;}
    querySelector(){return this.children.find(child=>child?.dataset?.rsaCombatReference!==undefined);}
}
const fixture=()=>{
    const section=new Element('section');
    return {section,root:{querySelector:selector=>selector.includes('documentation')?section:null}};
};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('settings button is added once to documentation, including fresh and popped-out renders',()=>{
    const {root,section}=fixture();
    addReferenceSettingsButton({},root);
    addReferenceSettingsButton({},root);
    assert.equal(section.children.length,1);
    assert.equal(section.children[0].type,'button');
    assert.equal(section.children[0].title,'RSA.ACTION_REFERENCE_HINT');
    const other=fixture();addReferenceSettingsButton({},[other.root]);
    assert.equal(other.section.children.length,1);
    assert.doesNotThrow(()=>addReferenceSettingsButton({},null));
    assert.doesNotThrow(()=>addReferenceSettingsButton({},{querySelector:()=>null}));
});

test('player can open from settings repeatedly without toggling the window closed',async()=>{
    calls.length=0;
    const {root,section}=fixture();addReferenceSettingsButton({},root);
    const click=section.children[0].listeners.click;
    let prevented=0;
    const event={preventDefault(){prevented++;},stopPropagation(){}};
    click(event);await settle();click(event);await settle();
    assert.equal(prevented,2);
    assert.deepEqual(calls,['open','maximize','front']);
});

test('native main menu closes before opening reference, preserves other entries, and allows players',async()=>{
    let hook;
    globalThis.Hooks.on=(name,callback)=>{hook={name,callback};};
    registerReferenceMenus();
    assert.equal(hook.name,'renderSettings');
    assert.equal(hook.callback,addReferenceSettingsButton);
    const items=foundry.applications.ui.MainMenu.ITEMS;
    assert.equal(items.original,originalMenu);
    assert.equal(items.rsaCombatActionReference.enabled(),true);
    calls.length=0;
    await items.rsaCombatActionReference.onClick.call({async close(){calls.push('menu-close');}});
    assert.deepEqual(calls,['menu-close','maximize','front']);
});

test('unrelated systems do not receive reference controls',()=>{
    game.system.id='other-system';
    try{
        const {root,section}=fixture();addReferenceSettingsButton({},root);
        assert.equal(section.children.length,0);
        assert.equal(foundry.applications.ui.MainMenu.ITEMS.rsaCombatActionReference.enabled(),false);
    }finally{game.system.id='dark-heresy';}
});
