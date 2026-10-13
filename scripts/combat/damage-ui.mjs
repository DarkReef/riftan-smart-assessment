/** Presentation only. All arithmetic, authority and persistence belong to the system API. */
const SCOPE='dark-heresy';
const LOCATIONS={'ARMOUR.BODY':'Торс','ARMOUR.HEAD':'Голова','ARMOUR.LEFT_ARM':'Левая рука',
    'ARMOUR.RIGHT_ARM':'Правая рука','ARMOUR.LEFT_LEG':'Левая нога','ARMOUR.RIGHT_LEG':'Правая нога'};
const LABELS={ready:'Готово к подтверждению',pending:'Ожидает ведущего','pending-defense':'Ожидает защиты',
    applied:'Применено',processing:'Выполняется','needs-review':'Требует решения GM',unsupported:'Не поддерживается',stale:'Расчёт устарел'};
const api=()=>{
    const damage=game.darkHeresy?.api?.damage;
    if(damage?.version!==1) throw Error('Требуется система Apex Heresy с damage API v1 (патч 1.5.6).');
    return damage;
};
const gm=()=>game.user?.isGM && game.user.id===game.users.activeGM?.id;
const escape=value=>foundry.utils.escapeHTML(String(value??''));
const showError=(frame,error)=>{frame.querySelector('[data-status]').textContent='Операция остановлена: '+String(error.message??error);};
const warning=value=>String(value)
    .replace('Critical/Righteous Fury table effects need a recorded GM decision','Критические эффекты и Праведный гнев: требуется записанное решение GM по таблице')
    .replace('Property requires review:','Свойство требует ручного решения:')
    .replace('Warp Weapon: confirm armour exceptions','Оружие Варпа: подтвердите исключения для брони')
    .replace('Daemonic: attack exceptions require GM decision','Демон: GM должен разрешить исключения для этой атаки')
    .replace('Legacy weapon result lacks verified trait metadata','Старая карточка: свойства не имеют проверенного снимка')
    .replace('Unresolved weapon property:','Неопознанное свойство оружия:');

/** Retained as structured UUIDs, never scraped from chat HTML or current actor selection. */
async function requestFor(message) {
    const data=message.getFlag(SCOPE,'rollData');
    const recorded=(data?.targets??[]).map(t=>game.scenes.get(t.sceneId)?.tokens.get(t.tokenId)).filter(Boolean);
    let token;
    if(recorded.length===1) token=recorded[0];
    else if(recorded.length>1) {
        const content=document.createElement('div');
        const label=document.createElement('label');label.textContent='Зафиксировать одну цель';
        const select=document.createElement('select');
        for(const [i,target] of recorded.entries()) {
            const option=document.createElement('option');option.value=String(i);
            option.textContent=game.user.isGM || !target.hidden ? target.name : `Цель ${i+1}`;
            select.append(option);
        }
        label.append(select);content.append(label);
        const index=await foundry.applications.api.DialogV2.wait({window:{title:'Цель урона'},content,
            buttons:[{action:'choose',label:'Выбрать',callback:()=>Number(select.value)},{action:'cancel',label:'Отмена',callback:()=>null}]});
        if(index==null) return null;
        token=recorded[index];
    }
    if(!token) throw Error('В атаке нет зафиксированной цели. Пересоздайте корректную карточку; текущее выделение не подменяет её.');
    return api().request({messageId:message.id,tokenUuid:token.uuid,actorUuid:token.actor.uuid});
}

async function edit(preview) {
    const container=document.createElement('div');container.className='rsa-damage-edit';
    container.innerHTML=`<p>Корректировки GM сохраняются с причиной. При неподдерживаемом свойстве задайте конечный урон <b>каждого</b> попадания вручную; такой расчёт будет отмечен как ручной.</p>
        <label>Почему реакция отсутствует / разрешена<input name="reactionReason" value="${escape(preview.decision?.reactionReason)}"></label>
        <label>Решение по полю (для очереди — по каждому попаданию)<input name="fieldReason" value="${escape(preview.decision?.fieldReason)}" ${preview.decision?.fieldResolved?'readonly':''}></label>
        <label><input type="checkbox" name="fieldWaived" ${preview.decision?.fieldWaived?'checked':''} ${preview.decision?.fieldResolved?'disabled':''}> Поле разрешено вручную / не применяется</label>
        <label>Решение по критическим эффектам / RF<input name="criticalReason" value="${escape(preview.decision?.criticalReason)}"></label>
        <label>Ручной итог после всех защит и True Grit (числа через запятую; пусто = штатный расчёт)<input name="manual" placeholder="5, 9, 0" value="${escape(preview.decision?.manual ? preview.attack.hits.map(h=>preview.decision.manual[h.id]).join(', ') : '')}"></label>
        <label>Причина ручного урона<input name="reason" value="${escape(preview.decision?.reason)}"></label>
        <label>Проверенные вручную состояния (id:раунды; например prone:1)<input name="effects" value="${escape((preview.decision?.effects??[]).map(e=>e.condition+':'+e.rounds).join(', '))}"></label>`;
    return foundry.applications.api.DialogV2.wait({window:{title:'Решение ведущего'},position:{width:550},content:container,
        buttons:[{action:'save',label:'Сохранить решение',callback:()=>{
            const value=name=>container.querySelector(`[name=${name}]`).value.trim();
            const manual=value('manual') ? value('manual').split(',').map(v=>Number(v.trim())) : null;
            if(manual && (manual.length!==preview.attack.hits.length || value('manual').split(',').some(v=>!v.trim()) || manual.some(v=>!Number.isInteger(v)||v<0))) throw Error('Укажите целый неотрицательный итог каждого попадания');
            return {...preview.decision,reactionReason:value('reactionReason'),fieldReason:value('fieldReason'),
                fieldMode:'per-hit',fieldWaived:container.querySelector('[name=fieldWaived]').checked,
                criticalReason:value('criticalReason'),reason:value('reason'),
                manual:manual ? Object.fromEntries(preview.attack.hits.map((h,i)=>[h.id,manual[i]])) : null,
                effects:value('effects') ? value('effects').split(',').map(v=>{const [condition,rounds]=v.trim().split(':');return {condition,rounds:Number(rounds)};}) : []};
        }},{action:'cancel',label:'Отмена',callback:()=>null}]});
}

export function renderDamageControls(message, html) {
    const root=html?.querySelector ? html : html?.[0];
    if(!root || game.system.id!=='dark-heresy') return;
    root.querySelectorAll('.rsa-damage-confirmation').forEach(el=>el.remove());
    if(!message.isContentVisible) return;
    const request=message.getFlag(SCOPE,'damageRequest'), envelope=message.getFlag(SCOPE,'damageJournal');
    const summary=message.getFlag(SCOPE,'damageConfirmation');
    const data=message.getFlag(SCOPE,'rollData');
    if(!request && !envelope && !data?.flags?.isDamageRoll) return;
    if(!request && !envelope && !(message.isAuthor || game.user.isGM)) return;
    const frame=document.createElement('section');frame.className='rsa-damage-confirmation';
    frame.innerHTML='<strong>Расчёт урона · OW</strong><p data-status>Ожидает ведущего</p><div data-details></div><div data-controls></div>';
    (root.querySelector('.message-content')??root).append(frame);
    let requestId=request?message.id:null, current=null, decision={};
    const controls=frame.querySelector('[data-controls]');
    const button=(label,action)=>{
        const b=document.createElement('button');b.type='button';b.textContent=label;
        b.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();b.disabled=true;
            try{await action();}catch(error){showError(frame,error);}finally{b.disabled=false;}});
        controls.append(b);return b;
    };
    const display=value=>{
        current=value;decision=value.decision??decision;
        frame.querySelector('[data-status]').textContent=LABELS[value.status]??value.status;
        const plan=value.plan;
        frame.querySelector('[data-details]').innerHTML=plan ?
            `<p>${escape(value.attacker??'')} → ${escape(value.targetName??value.target?.tokenUuid)} · ${value.decision?.manual?'Ручной итог':'Штатный расчёт'}</p>
            <p><b>Осталось ран: ${plan.remainingBefore} → ${plan.remainingAfter}</b></p>
            <details><summary>Подробнее</summary><table><thead><tr><th>Зона</th><th>Урон</th><th>Броня / Pen</th><th>БВ / +X / Felling</th><th>Итог</th></tr></thead><tbody>
            ${plan.rows.map(r=>`<tr><td>${escape(LOCATIONS[r.location]??r.location)}</td><td>${r.rawDamage}</td><td>${r.armour} / ${r.penetration} → ${r.armourAfterPen}</td><td>${r.naturalToughness} + ${r.unnaturalToughness} − ${r.felling} → ${r.toughnessForHit}; Демон ${r.daemonic}</td><td>${r.blocked?'Поле':r.damage}; обычный ${r.normalAdded}, крит ${r.criticalAdded}, RF ${r.rfEffect}</td></tr>`).join('')}</tbody></table>
            ${(value.warnings??[]).map(w=>`<p>${escape(warning(w))}</p>`).join('')}
            ${value.fieldResults?.length?`<p>Броски поля: ${escape(value.fieldResults.map(r=>r.roll??r.reason).join(', '))}</p>`:''}</details>` : `<p>${escape(value.reason??value.error??'')}</p>`;
        controls.replaceChildren();
        if(['applied','processing'].includes(value.status) || value.woundsRecorded) return;
        button('Обновить расчёт',refresh);
        if(plan) {
            button('Изменить',async()=>{const changed=await edit(current);if(changed){decision=changed;await refresh();}});
            if(value.field && !decision.fieldResolved && !decision.fieldWaived) button('Проверить поле',async()=>{
                display(await api().resolveField({requestId,expected:current.fingerprint,decision}));
            });
            const apply=button('Применить',async()=>{display(await api().commit({requestId,expected:current.fingerprint,decision}));});
            apply.disabled=value.status!=='ready';
        }
    };
    const refresh=async()=>display(await api().preview({requestId,decision}));
    if(summary?.status==='applied') {
        frame.querySelector('[data-status]').textContent='Применено ведущим';
        if(gm()) button('Квитанция GM',async()=>display(await api().getReceipt(summary.receiptId)));
        return;
    }
    if(envelope) {if(gm()) button('Квитанция GM',async()=>display(await api().getReceipt(message.id)));return;}
    if(request) {if(gm()) button('Рассчитать',refresh);return;}
    button(game.user.isGM?'Рассчитать':'Запросить расчёт GM',async()=>{
        const doc=await requestFor(message);if(!doc)return;requestId=doc.id;
        if(gm()) await refresh();else frame.querySelector('[data-status]').textContent='Запрос передан ведущему';
    });
}

export function registerDamageUI() {
    Hooks.on('renderChatMessageHTML',renderDamageControls);
}
