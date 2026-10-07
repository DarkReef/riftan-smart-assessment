export const FINAL_KEYS = new Set(['system.fatigue.max','system.movement.half','system.movement.full','system.movement.charge','system.movement.run','system.encumbrance.value','system.encumbrance.max']);
const get = (object,path) => path.split('.').reduce((value,key)=>value?.[key],object);
export function fieldCatalog(target, registry = {}, localize = key=>key) {
    if (!target) return [];
    const entries = new Map();
    for (const [key,info] of Object.entries(registry)) {
        const value = get(target,key);
        if (value === undefined || value === null || typeof value === 'object' || !key.startsWith('system.')) continue;
        entries.set(key,{key,type:typeof value === 'number'?'Number':typeof value === 'boolean'?'Boolean':'String',label:localize(info.label || key),phase:FINAL_KEYS.has(key)?'final':'initial'});
    }
    // Enumerate editable fields on the actual Actor even when the registry is incomplete.
    for (const group of ['characteristics','skills']) for (const [name,data] of Object.entries(target.system?.[group] ?? {})) {
        for (const part of ['base','advance','tempModifier','unnatural','cost','starter']) {
            const value=data?.[part]; if (!['number','boolean'].includes(typeof value)) continue;
            const key=`system.${group}.${name}.${part}`;
            if (!entries.has(key)) entries.set(key,{key,type:typeof value==='boolean'?'Boolean':'Number',label:key,phase:'initial'});
        }
    }
    // User-defined skill specialities are absent from the system's static catalog.
    for (const [skill,data] of Object.entries(target.system?.skills ?? {})) {
        for (const [speciality,values] of Object.entries(data.specialities ?? {})) {
            for (const part of ['advance','cost','starter']) {
                if (values[part] === undefined) continue;
                const key=`system.skills.${skill}.specialities.${speciality}.${part}`;
                entries.set(key,{key,type:part==='starter'?'Boolean':'Number',label:`${localize(data.label || skill)} / ${values.name || speciality} / ${localize('RSA.PART_'+part)}`,phase:'initial'});
            }
        }
    }
    for (const entry of entries.values()) {
        const match=entry.key.match(/^system\.characteristics\.([^.]+)\.([^.]+)$/);
        const named=localize('RSA.FIELD_'+entry.key.slice(7));
        if (named!=='RSA.FIELD_'+entry.key.slice(7)) entry.label=named;
        const skill=entry.key.match(/^system\.skills\.([^.]+)\.([^.]+)$/);
        if (skill) entry.label=`${localize(target.system.skills[skill[1]].label || 'SKILL.'+skill[1].replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase())} / ${localize('RSA.PART_'+skill[2])}`;
        if (match) {
            const term=globalThis.game?.darkHeresy?.localization?.characteristicTerm?.(target,match[1]);
            const sourceLabel=target.system.characteristics?.[match[1]]?.label;
            entry.label=`${term?.label??(sourceLabel?localize(sourceLabel):localize('RSA.CHAR_'+match[1]))} / ${localize('RSA.PART_'+match[2])}`;
            entry.aliases=term?.aliases??[match[1].replace(/([a-z])([A-Z])/g,'$1 $2'),...(match[1]==='ballisticSkill'?['Стрельба','Дальний бой','Ballistic Skill','BS']:[])];
        }
    }
    return [...entries.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
export function assessChange(entry,value,type,phase) {
    if (!entry) return {state:'invalid',hint:'UNKNOWN'};
    // V14 references are resolved by the native engine, never evaluated here.
    const reference=String(value).includes('@');
    const numeric = String(value).trim() !== '' && Number.isFinite(Number(value));
    if (entry.type==='Number' && !numeric && !reference) return {state:'invalid',hint:'VALUE_ERROR'};
    if (entry.type!=='Number' && !['override','custom','5','0'].includes(String(type))) return {state:'invalid',hint:'VALUE_ERROR'};
    if (entry.type==='Boolean' && !reference && !['true','false','1','0'].includes(String(value).toLowerCase())) return {state:'invalid',hint:'VALUE_ERROR'};
    if (entry.phase==='final' && phase!=='final') return {state:'warning',hint:'FINAL'};
    return {state:reference?'warning':'valid',hint:reference?'CHECK_PHASE':'VALID'};
}
export function searchFields(catalog,query) {
    const terms=String(query).toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return catalog.filter(entry=>terms.every(term=>`${entry.label} ${entry.key} ${(entry.aliases??[]).join(" ")}`.toLocaleLowerCase().includes(term)));
}
