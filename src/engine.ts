import Decimal from 'decimal.js';
import type { ENode, GameFile } from './model';

const D=(v:string|number|undefined,fallback:string|number=0)=>{try{const value=new Decimal(v??fallback);return value.isFinite()?value:new Decimal(fallback);}catch{return new Decimal(fallback);}};
const out=(d:Decimal)=>d.toSignificantDigits(12).toString();
const links=(f:GameFile,id:string,dir:'in'|'out')=>f.edges.filter(e=>dir==='in'?e.target===id:e.source===id);
const byId=(f:GameFile,id:string)=>f.nodes.find(n=>n.id===id);
const resourceCostNode=(f:GameFile,target:ENode)=>links(f,target.id,'in').map(e=>byId(f,e.source)).find(n=>n?.data.kind==='resource')??f.nodes.find(n=>n.data.kind==='resource'&&/gold/i.test(n.data.title));
const passesGates=(f:GameFile,nodeId:string)=>links(f,nodeId,'in').map(e=>byId(f,e.source)).filter((n):n is ENode=>!!n&&(n.data.kind==='condition'||n.data.kind==='unlock')).every(n=>n.data.enabled===true);
const amount=(n:ENode)=>D(n.data.balance);
const safePlot=(value:Decimal)=>{const n=value.toNumber();return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;};
const flow=(f:GameFile,kind:'production'|'consumption',id:string,value:Decimal)=>{const all=f.flowAccumulator??{production:{},consumption:{}};all[kind][id]=out(D(all[kind][id]).plus(value));f.flowAccumulator=all;};
const connectedUpgradeBonus=(f:GameFile,targetId:string)=>links(f,targetId,'in').map(e=>byId(f,e.source)).filter((n):n is ENode=>!!n&&n.data.kind==='upgrade').reduce((sum,n)=>sum.plus(D(n.data.bonus).mul(n.data.level??0)),new Decimal(0));
export function upgradeCost(data:ENode['data'],level:number){const base=Decimal.max(0,D(data.cost,25)),growth=Decimal.max(1,D(data.growth,1.15)),rate=growth.minus(1),safeLevel=Math.max(0,level);if(data.growthCurve==='linear')return base.mul(new Decimal(1).plus(rate.mul(safeLevel)));if(data.growthCurve==='diminishing')return base.mul(new Decimal(1).plus(rate.mul(Math.sqrt(safeLevel))));return base.mul(growth.pow(safeLevel));}
const capacity=(f:GameFile,n:ENode)=>{const caps=[D(n.data.capacity,'1e100'),...links(f,n.id,'in').map(e=>byId(f,e.source)).filter((x):x is ENode=>!!x&&x.data.kind==='limiter').map(x=>D(x.data.capacity,'1e100'))];return Decimal.max(0,Decimal.min(...caps));};
function putBalance(f:GameFile,n:ENode,v:Decimal){n.data.balance=out(Decimal.max(0,Decimal.min(v,capacity(f,n))));}

export function mine(file:GameFile,nodeId:string):GameFile {
  const f=structuredClone(file), action=byId(f,nodeId); if(!action||action.data.kind!=='manual'||!action.data.enabled||!passesGates(f,action.id))return f;
  const bonus=connectedUpgradeBonus(f,action.id);
  const mult=Decimal.max(0,new Decimal(1).plus(bonus)); const prestige=Decimal.max(0,D(f.nodes.find(n=>n.data.kind==='prestige')?.data.prestigeMultiplier??f.nodes.find(n=>n.data.kind==='prestige')?.data.bonus,1));
  for(const edge of links(f,action.id,'out')){const resource=byId(f,edge.target);if(resource?.data.kind==='resource'){const before=amount(resource),yieldAmount=Decimal.max(0,D(action.data.rate,1)).mul(mult).mul(prestige);putBalance(f,resource,before.plus(yieldAmount));flow(f,'production',resource.id,amount(resource).minus(before));}}
  f.events=[`Manual action · ${action.data.title}`, ...f.events].slice(0,80); f.revision++; f.updatedAt=Date.now(); return f;
}

export function buyUpgrade(file:GameFile,nodeId:string):GameFile {
  const f=structuredClone(file), upgrade=byId(f,nodeId); if(!upgrade||upgrade.data.kind!=='upgrade')return f;
  const level=upgrade.data.level??0, max=upgrade.data.maxLevel??50; if(level>=max)return f;
  const cost=upgradeCost(upgrade.data,level);
  const currency=resourceCostNode(f,upgrade); if(!currency||amount(currency).lt(cost)){f.events=[`Not enough ${currency?.data.title??'resources'} · upgrade costs ${out(cost)}`, ...f.events].slice(0,80);return f;}
  putBalance(f,currency,amount(currency).minus(cost)); upgrade.data.level=level+1; f.events=[`${upgrade.data.title} upgraded to level ${level+1}`, ...f.events].slice(0,80); f.revision++; f.updatedAt=Date.now(); return f;
}

export function triggerPrestige(file:GameFile,nodeId:string):GameFile {
  const f=structuredClone(file), node=byId(f,nodeId);if(!node||node.data.kind!=='prestige')return f;
  const currency=resourceCostNode(f,node),threshold=D(node.data.threshold,1000);
  if(!currency||amount(currency).lt(threshold)){f.events=[`Prestige needs ${out(threshold)} ${currency?.data.title??'resource'}`,...f.events].slice(0,80);return f;}
  putBalance(f,currency,amount(currency).minus(threshold));
  for(const resource of f.nodes.filter(n=>n.data.kind==='resource'&&n.id!==currency.id&&n.data.resetOnPrestige!==false))putBalance(f,resource,new Decimal(0));
  for(const upgrade of f.nodes.filter(n=>n.data.kind==='upgrade'&&n.data.resetOnPrestige!==false))upgrade.data.level=0;
  node.data.prestigeMultiplier=D(node.data.prestigeMultiplier??node.data.bonus,1).mul(Math.max(1,node.data.prestigeGrowth??1.5)).toSignificantDigits(12).toString();node.data.enabled=true;
  f.events=[`Prestige complete · permanent multiplier ×${node.data.prestigeMultiplier}`,...f.events].slice(0,80);f.revision++;f.updatedAt=Date.now();return f;
}

export function step(input:GameFile):GameFile{return stepMutable(structuredClone(input));}

function stepMutable(f:GameFile):GameFile {
  f.tick++; f.flowAccumulator??={production:{},consumption:{}};
  const resources=f.nodes.filter(n=>n.data.kind==='resource');
  for(const gate of f.nodes.filter(n=>n.data.kind==='unlock'||n.data.kind==='condition')){
    const sources=links(f,gate.id,'in').map(e=>byId(f,e.source)).filter((n):n is ENode=>!!n&&n.data.kind==='resource');
    const reached=sources.length>0&&sources.every(source=>amount(source).gte(D(gate.data.threshold,100)));
    if(gate.data.kind==='condition')gate.data.enabled=reached;
    else if(reached&&!gate.data.enabled){gate.data.enabled=true;f.events=[`${gate.data.title} unlocked`,...f.events].slice(0,80);}
  }
  const prestige=f.nodes.find(n=>n.data.kind==='prestige'); const prestigeMult=Decimal.max(0,D(prestige?.data.prestigeMultiplier??prestige?.data.bonus,1));
  for(const gen of f.nodes.filter(n=>n.data.kind==='generator'&&n.data.enabled!==false)){
    if(f.tick%(gen.data.interval||1)!==0)continue;
    if(!passesGates(f,gen.id))continue;
    const modifiers=links(f,gen.id,'in').map(e=>byId(f,e.source)).filter((n):n is ENode=>!!n&&n.data.kind==='multiplier'&&n.data.enabled!==false).reduce((m,n)=>m.mul(Decimal.max(0,new Decimal(1).plus(D(n.data.bonus)))),new Decimal(1));
    const multiplier=Decimal.max(0,new Decimal(1).plus(connectedUpgradeBonus(f,gen.id))).mul(prestigeMult).mul(modifiers);
    for(const e of links(f,gen.id,'out')){const r=byId(f,e.target);if(r?.data.kind==='resource'){const before=amount(r);putBalance(f,r,before.plus(Decimal.max(0,D(gen.data.rate,1)).mul(multiplier)));flow(f,'production',r.id,amount(r).minus(before));}}
  }
  for(const converter of f.nodes.filter(n=>n.data.kind==='converter')){
    const ins=links(f,converter.id,'in').map(e=>byId(f,e.source)).filter((n):n is ENode=>!!n&&n.data.kind==='resource');
    const outs=links(f,converter.id,'out').map(e=>byId(f,e.target)).filter((n):n is ENode=>!!n&&n.data.kind==='resource');
    if(!ins.length||!outs.length||!passesGates(f,converter.id))continue; const ratio=D(converter.data.ratio,0.1),chunk=D(converter.data.inputAmount,10); if(ratio.lte(0)||chunk.lte(0)||ins.some(input=>amount(input).lt(chunk)))continue;
    const total=chunk.mul(ins.length),perOutput=total.mul(ratio).div(outs.length);
    if(outs.some(output=>capacity(f,output).minus(amount(output)).lt(perOutput)))continue;
    for(const input of ins){const before=amount(input);putBalance(f,input,before.minus(chunk));flow(f,'consumption',input.id,before.minus(amount(input)));}
    for(const output of outs){const before=amount(output);putBalance(f,output,before.plus(perOutput));flow(f,'production',output.id,amount(output).minus(before));}
  }
  const auto=f.nodes.find(n=>n.data.kind==='automation');
  if(auto?.data.enabled&&f.mode!=='Manual'&&passesGates(f,auto.id)&&f.tick%(auto.data.interval||1)===0){
    let result:GameFile|undefined;
    if(auto.data.strategy==='prestige'){
      const linkedPrestige=links(f,auto.id,'out').map(e=>byId(f,e.target)).find(n=>n?.data.kind==='prestige');
      const prestigeNode=linkedPrestige??f.nodes.find(n=>n.data.kind==='prestige');
      const currency=prestigeNode?resourceCostNode(f,prestigeNode):undefined;
      if(prestigeNode&&currency&&amount(currency).gte(D(prestigeNode.data.threshold,1000)))result=triggerPrestige(f,prestigeNode.id);
    }else{
      const linkedUpgrades=links(f,auto.id,'out').map(e=>byId(f,e.target)).filter((n):n is ENode=>!!n&&n.data.kind==='upgrade');
      const candidates=linkedUpgrades.length?linkedUpgrades:f.nodes.filter(n=>n.data.kind==='upgrade');
      const affordable=candidates.filter(n=>(n.data.level??0)<(n.data.maxLevel??50)&&resourceCostNode(f,n)&&amount(resourceCostNode(f,n)!).gte(upgradeCost(n.data,n.data.level??0)));
      const selected=affordable.sort((a,b)=>auto.data.strategy==='value'
        ? D(b.data.bonus,0).div(upgradeCost(b.data,b.data.level??0)).cmp(D(a.data.bonus,0).div(upgradeCost(a.data,a.data.level??0)))
        : upgradeCost(a.data,a.data.level??0).cmp(upgradeCost(b.data,b.data.level??0)))[0];
      if(selected)result=buyUpgrade(f,selected.id);
    }
    if(result){f.nodes=result.nodes;f.events=result.events;}
  }
  const stone=resources.find(n=>/stone/i.test(n.data.title)), gold=resources.find(n=>/gold/i.test(n.data.title));
  if(f.tick%5===0){
    const previous=f.history.at(-1),elapsed=Math.max(1,f.tick-(previous?.tick??f.tick-5));
    const balances=Object.fromEntries(resources.map(n=>[n.id,out(amount(n))]));
    const netRates=Object.fromEntries(resources.map(n=>{const prior=previous?.resources?.[n.id]??out(amount(n));return[n.id,out(amount(n).minus(D(prior)).div(elapsed))];}));
    const upgradeLevels=Object.fromEntries(f.nodes.filter(n=>n.data.kind==='upgrade').map(n=>[n.id,n.data.level??0]));
    const productionRates=Object.fromEntries(resources.map(n=>[n.id,out(D(f.flowAccumulator?.production[n.id]).div(elapsed))]));
    const consumptionRates=Object.fromEntries(resources.map(n=>[n.id,out(D(f.flowAccumulator?.consumption[n.id]).div(elapsed))]));
    const markers=f.events.filter(event=>/unlocked|prestige complete/i.test(event)&&!previous?.events?.includes(event));
    f.history=[...f.history,{tick:f.tick,stone:safePlot(amount(stone??{data:{balance:'0'}} as ENode)),gold:safePlot(amount(gold??{data:{balance:'0'}} as ENode)),miners:f.nodes.filter(n=>n.data.kind==='generator'&&n.data.enabled!==false).length,resources:balances,netRates,productionRates,consumptionRates,upgradeLevels,events:f.events.slice(0,12),markers}].slice(-240);
    f.flowAccumulator={production:{},consumption:{}};
  }
  f.events=f.events.slice(0,80); f.revision++; f.updatedAt=Date.now(); return f;
}

export function advanceTicks(file:GameFile,ticks:number){const f=structuredClone(file);for(let i=0;i<Math.max(0,Math.floor(ticks));i++)stepMutable(f);return f;}
export function replay(file:GameFile,ticks:number){const f=structuredClone(file);f.running=false;for(let i=0;i<Math.max(0,Math.floor(ticks));i++)stepMutable(f);return f;}

export function advanceOffline(file:GameFile,elapsedMs:number){
  const f=structuredClone(file);
  if(!f.running||(f.offlineCapSeconds??14400)<=0){f.offlineRemainderMs=0;return{file:f,ticks:0};}
  const capped=Math.min((f.offlineCapSeconds??14400)*1000,Math.max(0,elapsedMs)+(f.offlineRemainderMs??0));
  const ticks=Math.min(5000,Math.floor(capped/1000));
  for(let i=0;i<ticks;i++)stepMutable(f);
  f.running=true;f.offlineRemainderMs=Math.max(0,capped-ticks*1000);
  if(ticks)f.events=[`Offline progress · ${ticks} logical ticks`,...f.events].slice(0,80);
  return{file:f,ticks};
}

export function resetSimulation(file:GameFile):GameFile {
  const f=structuredClone(file);f.running=false;f.tick=0;f.history=[];f.flowAccumulator={production:{},consumption:{}};f.offlineRemainderMs=0;
  f.nodes=f.nodes.map(n=>n.data.kind==='resource'?{...n,data:{...n.data,balance:n.data.initial??'0'}}:n.data.kind==='upgrade'?{...n,data:{...n.data,level:0}}:n.data.kind==='unlock'||n.data.kind==='condition'?{...n,data:{...n.data,enabled:false}}:n);
  f.events=['Simulation reset',...f.events].slice(0,80);f.revision++;f.updatedAt=Date.now();return f;
}
