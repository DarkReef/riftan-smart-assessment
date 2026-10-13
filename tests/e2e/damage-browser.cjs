// Browser E2E against the real system API/Actor methods and an in-memory document host.
// This is NOT live Foundry multiplayer QA. No user world is touched.
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL}=require('url');
const {randomBytes}=require('crypto');
const root=path.resolve(__dirname,'../..');
const systemRoot=process.env.APEX_SYSTEM_DIR||path.resolve(root,'../Apex-Heresy-Ru');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const host=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/damage.css"><style>body{font:14px Segoe UI;background:#222;color:#eee;margin:24px}.message{max-width:760px;margin:15px auto;border:1px solid #555;padding:12px}button{padding:7px;cursor:pointer}dialog{width:580px;background:#222;color:white}input{padding:5px}table{font-size:12px}</style><body><main id="chat"></main><script type="module">
const role=new URLSearchParams(location.search).get('role');
window.game={user:{id:role,isGM:role==='gm'},users:{activeGM:{id:'gm'}},system:{id:'dark-heresy'},scenes:new Map([['scene',{tokens:new Map([['enemy',{uuid:'Scene.scene.Token.enemy',actor:{uuid:'Scene.scene.Token.enemy.Actor.npc'}}]])}]])};
window.foundry={utils:{escapeHTML:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},applications:{api:{DialogV2:{wait:config=>new Promise((resolve,reject)=>{
const dialog=document.createElement('dialog');dialog.append(config.content);
for(const spec of config.buttons){const button=document.createElement('button');button.textContent=spec.label;button.onclick=async()=>{try{const result=await spec.callback();dialog.close();dialog.remove();resolve(result);}catch(e){reject(e);}};dialog.append(button);}document.body.append(dialog);dialog.showModal();})}}}};
window.rpc=async(method,input)=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,input})});const result=await response.json();if(!response.ok)throw Error(result.error);if(method==='preview')window.lastPreview=result;return result;};
game.darkHeresy={api:{damage:{version:1,...Object.fromEntries(['request','preview','commit','resolveField','getReceipt'].map(method=>[method,input=>rpc(method,input)]))}}};
const {renderDamageControls}=await import('/scripts/combat/damage-ui.mjs');
window.redraw=async()=>{const list=await(await fetch('/messages')).json();document.querySelector('#chat').replaceChildren();
for(const data of list){const m={...data,isAuthor:data.author.id===role,isContentVisible:role==='gm'||(!data.blind&&(!data.whisper.length||data.whisper.includes(role)||data.author.id===role)),getFlag:(scope,key)=>data.flags[scope]?.[key]};
if(!m.isContentVisible)continue;const el=document.createElement('article');el.className='message';el.dataset.messageId=m.id;el.innerHTML='<div class="message-content">'+(data.content||'Нативная карточка броска')+'</div>';document.querySelector('#chat').append(el);renderDamageControls(m,el);}};
await redraw();window.ready=true;
</script>`;
(async()=>{
 const {damageFixture}=await import(pathToFileURL(path.join(systemRoot,'tests/helpers/ow-damage-fixture.mjs')).href);
 const f=damageFixture({pen:4,traits:{felling:2},value:9,trueGrit:true});
 const sessions=new Map(['gm','player','other'].map(role=>[randomBytes(24).toString('hex'),role]));
 let queue=Promise.resolve();
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const url=new URL(req.url,'http://localhost');
  const cookie=/rsaSession=([a-f0-9]+)/.exec(req.headers.cookie??'')?.[1];
  const role=sessions.get(cookie);
  if(!role){res.statusCode=403;return res.end(JSON.stringify({error:'Missing session'}));}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(host);}
  if(url.pathname==='/messages')return res.end(JSON.stringify(f.messages.contents.map(m=>({id:m.id,author:m.author,whisper:m.whisper,blind:m.blind,flags:m.flags,content:m.content}))));
  if(url.pathname==='/state'&&role!=='gm'){res.statusCode=403;return res.end(JSON.stringify({error:'GM only'}));}
  if(url.pathname==='/state')return res.end(JSON.stringify({wounds:f.actor.wounds,writes:f.writes(),rolls:f.rolls(),effects:f.actor.effects.contents.map(e=>({id:e.id}))}));
  if(url.pathname==='/rpc'){
   let body='';req.on('data',data=>body+=data);req.on('end',()=>{
    const task=queue.catch(()=>{}).then(async()=>{
     game.user=role==='gm'?f.gm:role==='player'?f.player:f.other;
     try{const {method,input}=JSON.parse(body);if(!['request','preview','commit','resolveField','getReceipt'].includes(method))throw Error('Unknown operation');
      const result=await f.api[method](input);res.end(JSON.stringify(method==='request'?{id:result.id}:result));
     }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
    });queue=task;
   });return;
  }
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(18764,'127.0.0.1',resolve));
 let browser;try{browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});}catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
 const errors=[];
 try{
  const pages=[];
  for(const role of ['player','other','gm']){const context=await browser.newContext();await context.addCookies([{name:'rsaSession',value:[...sessions].find(([,value])=>value===role)[0],url:'http://127.0.0.1:18764',httpOnly:true}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:18764/?role='+role);await page.waitForFunction(()=>window.ready);pages.push(page);}
  const [player,other,gm]=pages;
  assert.equal(await other.getByRole('button',{name:'Запросить расчёт GM'}).count(),0);
  await player.getByRole('button',{name:'Запросить расчёт GM'}).click();
  await gm.evaluate(()=>redraw());
  await gm.locator('[data-message-id=new1]').getByRole('button',{name:'Рассчитать',exact:true}).click();
  await gm.locator('[data-message-id=new1]').getByRole('button',{name:'Изменить',exact:true}).click();
  await gm.locator('[name=reactionReason]').fill('Реакция уже потрачена');
  await gm.locator('[name=criticalReason]').fill('GM прочитал строку таблицы OW; оглушение применяем один раз');
  await gm.locator('[name=effects]').fill('prone:1');
  await gm.getByRole('button',{name:'Сохранить решение'}).click();
  const card=gm.locator('[data-message-id=new1]');
  await card.getByRole('button',{name:'Применить',exact:true}).waitFor();
  assert.match(await card.textContent(),/Осталось ран: 3 → -3/);
  await card.getByRole('button',{name:'Применить',exact:true}).click();
  await gm.waitForFunction(()=>document.querySelector('[data-message-id=new1] [data-status]')?.textContent==='Применено');
  const state=await(await gm.request.get('http://127.0.0.1:18764/state')).json();
  assert.deepEqual([state.wounds.value,state.wounds.critical,state.writes],[12,3,1]);assert.deepEqual(state.effects,[{id:'prone'}]);
  await player.evaluate(()=>redraw());await other.evaluate(()=>redraw());
  assert.ok(!(await other.textContent('body')).includes('Secret NPC'));
  assert.equal(await player.getByRole('button',{name:'Применить',exact:true}).count(),0);
  const denied=await player.evaluate(async()=>{try{await rpc('commit',{requestId:'new1',userId:'gm'});return false;}catch{return true;}});assert.equal(denied,true);
  // Repeated render only displays data; it never runs dice, wounds or conditions.
  await gm.evaluate(async()=>{await redraw();await redraw();});
  const after=await(await gm.request.get('http://127.0.0.1:18764/state')).json();assert.deepEqual(after,state);
  const replica=await(await other.request.get('http://127.0.0.1:18764/messages')).text();
  assert.ok(!replica.includes('toughnessForHit'));assert.ok(!replica.includes('Secret NPC'));
  const out=process.env.QA_OUTPUT_DIR||path.resolve(root,'dist');fs.mkdirSync(out,{recursive:true});
  await gm.locator('[data-message-id=damage]').getByRole('button',{name:'Квитанция GM'}).click();
  await gm.screenshot({path:path.join(out,'damage-gm-e2e.png'),fullPage:true});
  await player.screenshot({path:path.join(out,'damage-player-e2e.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: three isolated browser clients; player request → GM edits/confirmation → real system API/Actor wounds and effect receipt; privacy, denied player commit and inert rerenders. In-memory Foundry document host; NOT live multiplayer QA.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
