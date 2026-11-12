import type { Edge, Node } from '@xyflow/react';

export type Kind='resource'|'generator'|'manual'|'upgrade'|'converter'|'automation'|'multiplier'|'condition'|'unlock'|'prestige'|'limiter'|'group';
export type EconomyData={kind:Kind;title:string;description:string;balance?:string;initial?:string;capacity?:string;rate?:string;interval?:number;cost?:string;growth?:number;growthCurve?:'linear'|'exponential'|'diminishing';level?:number;maxLevel?:number;bonus?:number;prestigeMultiplier?:string;ratio?:number;inputAmount?:string;enabled?:boolean;threshold?:string;color?:string;collapsed?:boolean;strategy?:'cheapest'|'value'|'prestige';resetOnPrestige?:boolean;prestigeGrowth?:number};
export type ENode=Node<EconomyData>;
export type RunPoint={tick:number;stone:number;gold:number;miners:number;resources?:Record<string,string>;netRates?:Record<string,string>;productionRates?:Record<string,string>;consumptionRates?:Record<string,string>;upgradeLevels?:Record<string,number>;events?:string[];markers?:string[]};
export type SavedRun={id:string;label:string;tick:number;savedAt:number;history:RunPoint[];balances:Record<string,string>;resourceMeta?:Record<string,{title:string}>;configuration?:{nodes:ENode[];edges:Edge[];mode:GameFile['mode'];speed:number}};
export type GameFile={id:string;name:string;nodes:ENode[];edges:Edge[];tick:number;speed:number;mode:'Manual'|'Automated'|'Hybrid';running:boolean;history:RunPoint[];runs:SavedRun[];events:string[];revision:number;remoteRevision?:number;updatedAt:number;offlineCapSeconds?:number;offlineRemainderMs?:number;flowAccumulator?:{production:Record<string,string>;consumption:Record<string,string>}};
export const colors:Record<Kind,string>={resource:'#57c6a5',generator:'#7ca8ff',manual:'#f1b765',upgrade:'#bc8cff',converter:'#f1857e',automation:'#50b6ce',multiplier:'#f0a2d3',condition:'#d5c36b',unlock:'#87ce8b',prestige:'#ff8d9b',limiter:'#99a3b4',group:'#a78bfa'};
export const labels:Record<Kind,string>={resource:'Resource pool',generator:'Generator',manual:'Manual action',upgrade:'Upgrade',converter:'Converter',automation:'Automation',multiplier:'Multiplier',condition:'Condition',unlock:'Unlock',prestige:'Prestige',limiter:'Limiter',group:'Group'};
export function makeNode(kind:Kind,x:number,y:number):ENode { const title=labels[kind]; const data:EconomyData={kind,title,description:descriptions[kind]}; if(kind==='resource')Object.assign(data,{balance:'0',initial:'0',capacity:'1000000',resetOnPrestige:true}); if(kind==='generator')Object.assign(data,{rate:'1',interval:1,enabled:true}); if(kind==='manual')Object.assign(data,{rate:'1',enabled:true}); if(kind==='upgrade')Object.assign(data,{cost:'25',growth:1.15,growthCurve:'exponential',level:0,maxLevel:50,bonus:0.2,resetOnPrestige:true}); if(kind==='converter')Object.assign(data,{inputAmount:'10',ratio:0.1}); if(kind==='automation')Object.assign(data,{interval:2,enabled:true,strategy:'cheapest'}); if(kind==='multiplier')Object.assign(data,{bonus:0.5,enabled:true}); if(kind==='condition'||kind==='unlock'||kind==='prestige')Object.assign(data,{threshold:kind==='prestige'?'1000':'100',enabled:false}); if(kind==='prestige')Object.assign(data,{bonus:1,prestigeMultiplier:'1',prestigeGrowth:1.5}); if(kind==='limiter')Object.assign(data,{capacity:'1000000',enabled:true}); return {id:crypto.randomUUID(),type:'economy',position:{x,y},data}; }
const descriptions:Record<Kind,string>={resource:'Stores a balance and applies a capacity limit.',generator:'Adds resources each logical tick to connected pools.',manual:'A player action that creates resources when clicked.',upgrade:'A purchase with a scaling cost and per-level effect.',converter:'Consumes connected inputs and produces connected outputs.',automation:'Repeats a connected action at a fixed tick interval.',multiplier:'A production modifier applied to connected generators.',condition:'Checks whether a connected pool has reached a threshold.',unlock:'Turns on connected mechanics after its condition is met.',prestige:'Resets configured progress and records a permanent multiplier.',limiter:'Caps the output or balance of connected resources.',group:'A named container for related economy nodes and nested groups.'};
export function sampleFile(name='Idle Mining Economy'):GameFile {
  const nodes:ENode[]=[
    {...makeNode('manual',70,110),data:{...makeNode('manual',0,0).data,title:'Mine Stone',rate:'1',description:'Click to mine Stone. Pickaxe levels increase each action.'}},
    {...makeNode('resource',330,70),data:{...makeNode('resource',0,0).data,title:'Stone',balance:'0',initial:'0',capacity:'999999999999'}},
    {...makeNode('converter',570,90),data:{...makeNode('converter',0,0).data,title:'Smelt & sell',ratio:.1}},
    {...makeNode('resource',820,70),data:{...makeNode('resource',0,0).data,title:'Gold',balance:'50',initial:'50',capacity:'999999999999'}},
    {...makeNode('upgrade',70,360),data:{...makeNode('upgrade',0,0).data,title:'Pickaxe',cost:'25',growth:1.15,growthCurve:'exponential',level:0,maxLevel:50,bonus:.2,description:'Each level adds 20% to manual mining.'}},
    {...makeNode('generator',340,360),data:{...makeNode('generator',0,0).data,title:'Auto Miner',rate:'2',interval:1,enabled:true,description:'Produces Stone once each logical tick.'}},
    {...makeNode('automation',600,360),data:{...makeNode('automation',0,0).data,title:'Auto buyer',interval:1,enabled:false,description:'Buys one affordable connected upgrade each interval.'}},
    {...makeNode('unlock',830,360),data:{...makeNode('unlock',0,0).data,title:'Deep mine',threshold:'100',enabled:false,description:'Unlocks at 100 Stone.'}},
    {...makeNode('prestige',1050,360),data:{...makeNode('prestige',0,0).data,title:'Prestige',threshold:'1000',bonus:1,prestigeMultiplier:'1',enabled:false,description:'At 1,000 Gold, reset Stone and gain a permanent multiplier.'}},
    {...makeNode('multiplier',650,170),data:{...makeNode('multiplier',0,0).data,title:'Deep mine bonus',bonus:.5,enabled:true,description:'Adds 50% to connected generator output.'}}
  ];
  const edges:Edge[]=[{id:'e1',source:nodes[0].id,target:nodes[1].id,label:'produces',type:'smoothstep',animated:true},{id:'e2',source:nodes[1].id,target:nodes[2].id,label:'input',type:'smoothstep'},{id:'e3',source:nodes[2].id,target:nodes[3].id,label:'converts',type:'smoothstep',animated:true},{id:'e4',source:nodes[4].id,target:nodes[0].id,label:'improves',type:'smoothstep'},{id:'e5',source:nodes[5].id,target:nodes[1].id,label:'produces',type:'smoothstep',animated:true},{id:'e6',source:nodes[7].id,target:nodes[5].id,label:'unlocks',type:'smoothstep'},{id:'e7',source:nodes[6].id,target:nodes[4].id,label:'purchases',type:'smoothstep'},{id:'e8',source:nodes[1].id,target:nodes[7].id,label:'threshold',type:'smoothstep'},{id:'e9',source:nodes[9].id,target:nodes[5].id,label:'×1.5 output',type:'smoothstep'}];
  return {id:crypto.randomUUID(),name,nodes,edges,tick:0,speed:1,mode:'Manual',running:false,history:[],runs:[],events:['Example economy ready'],revision:1,updatedAt:Date.now(),offlineCapSeconds:14400,offlineRemainderMs:0,flowAccumulator:{production:{},consumption:{}}};
}

export function connectionLabel(source:Kind,target:Kind):string|null {
  const allowed:Record<string,string>={
    'manual:resource':'produces','generator:resource':'produces','resource:converter':'input','converter:resource':'converts',
    'upgrade:manual':'improves','upgrade:generator':'improves','resource:upgrade':'costs',
    'automation:upgrade':'auto-buys','automation:prestige':'auto-prestiges',
    'multiplier:generator':'modifies','resource:condition':'threshold','resource:unlock':'threshold','resource:prestige':'requirement',
    'condition:generator':'gates','condition:manual':'gates','condition:converter':'gates','condition:automation':'gates',
    'unlock:generator':'unlocks','unlock:manual':'unlocks','unlock:converter':'unlocks','unlock:automation':'unlocks',
    'limiter:resource':'limits'
  };
  return allowed[`${source}:${target}`]??null;
}
