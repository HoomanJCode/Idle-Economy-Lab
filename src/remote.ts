import type { GameFile } from './model';
import { useStore } from './store';
import { clearGraphHistory } from './graph-history';

type Change = { id: number; fileId: string; revision: number; document: string; operation: string };
let started = false;
let stopCurrent: (() => void) | null = null;
let commandHandler: ((fileId:string,command:string,argument?:string|number)=>Promise<boolean>) | null = null;
let status: 'connecting' | 'shared' | 'offline' = 'connecting';
const listeners = new Set<() => void>();
const setStatus = (next: typeof status) => { if (status !== next) { status = next; listeners.forEach(fn => fn()); } };
export const getSyncStatus = () => status;
export const subscribeSyncStatus = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function stopRemoteSync(){stopCurrent?.();stopCurrent=null;commandHandler=null;started=false;}
const participantId = () => {
  let id = localStorage.getItem('idle-lab-participant');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('idle-lab-participant', id); }
  return id;
};
const json = async <T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const value = await response.json().catch(() => ({})) as { error?: string; file?: GameFile; [key: string]: unknown };
  if (!response.ok) throw Object.assign(new Error(value.error || 'The shared workspace is unavailable'), { response, value });
  return value as T;
};
const applyFile = (file: GameFile) => useStore.setState(state => ({ files: state.files.some(f => f.id === file.id) ? state.files.map(f => f.id === file.id ? file : f) : [file, ...state.files] }));

export function startRemoteSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let alive = true;
  let cursor = 0;
  const seen = new Map<string, string>();
  const suppress = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let polling = false;
  const currentSignature = (file: GameFile) => JSON.stringify({ ...file, remoteRevision: undefined });
  const graphSettings=(file:GameFile)=>JSON.stringify({nodes:file.nodes.map(node=>{const data={...node.data};delete data.balance;delete data.level;if(['condition','unlock','prestige'].includes(data.kind))delete data.enabled;if(data.kind==='prestige')delete data.prestigeMultiplier;return{id:node.id,type:node.type,position:node.position,parentId:node.parentId,style:node.style,data};}),edges:file.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,sourceHandle:edge.sourceHandle,targetHandle:edge.targetHandle,label:edge.label,type:edge.type}))});
  const recoverGraphConflict=(local:GameFile,remote:GameFile)=>{
    const graphDiff=graphSettings(local)!==graphSettings(remote),metadataDiff=local.name!==remote.name||JSON.stringify(local.runs)!==JSON.stringify(remote.runs)||local.offlineCapSeconds!==remote.offlineCapSeconds;
    if(!graphDiff&&!metadataDiff)return false;
    if(!graphDiff){
      const runs=Array.from(new Map([...(remote.runs??[]),...(local.runs??[])].map(run=>[run.id,run])).values()).sort((a,b)=>a.savedAt-b.savedAt).slice(-12);
      const merged:GameFile={...remote,name:local.name,offlineCapSeconds:local.offlineCapSeconds,runs,remoteRevision:remote.remoteRevision};suppress.add(local.id);useStore.setState(s=>({files:s.files.map(f=>f.id===local.id?merged:f)}));seen.set(local.id,currentSignature(remote));queueMicrotask(()=>{suppress.delete(local.id);void save(merged);});return true;
    }
    const currentById=new Map(remote.nodes.map(node=>[node.id,node]));
    const nodes=local.nodes.map(node=>{const current=currentById.get(node.id);if(!current)return node;const data={...node.data};data.balance=current.data.balance;data.level=current.data.level;if(['condition','unlock','prestige'].includes(data.kind))data.enabled=current.data.enabled;if(data.kind==='prestige'){data.prestigeMultiplier=current.data.prestigeMultiplier;data.bonus=current.data.bonus;}return{...node,data};});
    const recovered:GameFile={...structuredClone(remote),...local,id:crypto.randomUUID(),name:`${local.name} · recovered edits`,nodes,edges:structuredClone(local.edges),running:false,remoteRevision:undefined,revision:1,updatedAt:Date.now(),history:structuredClone(remote.history),runs:Array.from(new Map([...(remote.runs??[]),...(local.runs??[])].map(run=>[run.id,run])).values()).sort((a,b)=>a.savedAt-b.savedAt).slice(-12),events:['Recovered unsaved graph edits after a simultaneous update',...remote.events].slice(0,80)};
    suppress.add(local.id);suppress.add(recovered.id);
    useStore.setState(s=>({files:[recovered,...s.files.map(f=>f.id===remote.id?remote:f)],currentId:s.currentId===local.id?recovered.id:s.currentId}));
    seen.set(remote.id,currentSignature(remote));
    queueMicrotask(()=>{suppress.delete(local.id);suppress.delete(recovered.id);void save(recovered);});
    return true;
  };
  const performCommand = async (fileId:string,command:string,argument?:string|number):Promise<boolean> => {
    const file = useStore.getState().files.find(f => f.id === fileId);
    if (!file?.remoteRevision) return false;
    if(command==='tick'){
      try{
        const presence=await json<{participants:{id:string}[]}>(`/api/files/${encodeURIComponent(fileId)}/presence`);
        const ids=(presence.participants??[]).map(p=>p.id.split(':').at(-1)!).filter(Boolean).sort();
        const own=participantId();if(ids.length&&ids[0]!==own)return true;
        let tab=sessionStorage.getItem('idle-lab-tab');if(!tab){tab=crypto.randomUUID();sessionStorage.setItem('idle-lab-tab',tab);}
        const key=`idle-lab-ticker:${fileId}`,now=Date.now();
        const lease=JSON.parse(localStorage.getItem(key)||'null') as {tab:string;expires:number}|null;
        if(lease&&lease.expires>now&&lease.tab!==tab)return true;
        localStorage.setItem(key,JSON.stringify({tab,expires:now+5000}));
      }catch{return false;}
    }
    try {
      const payload = { command, ...(command === 'mine' || command === 'upgrade' || command === 'prestige' ? { nodeId: argument } : { value: argument }), expectedTick: file.tick, baseRevision: file.remoteRevision };
      const result = await json(`/api/files/${encodeURIComponent(fileId)}/simulation`, { method: 'POST', body: JSON.stringify(payload) });
      const received=result.file as GameFile; seen.set(fileId,currentSignature(received)); suppress.add(fileId); applyFile(received); queueMicrotask(()=>suppress.delete(fileId));
      if(command==='offline'&&(received.offlineRemainderMs??0)>=1000) return performCommand(fileId,'offline');
      return true;
    } catch (error) {
      const err = error as { value?: { file?: GameFile } };
      if (err.value?.file) { const received=err.value.file,latest=useStore.getState().files.find(f=>f.id===fileId); if(!latest||!recoverGraphConflict(latest,received)){clearGraphHistory(fileId);seen.set(fileId,currentSignature(received));suppress.add(fileId);applyFile(received);queueMicrotask(()=>suppress.delete(fileId));} }
      return false;
    }
  };
  commandHandler=performCommand;
  const save = async (file: GameFile) => {
    const signature = currentSignature(file);
    if (seen.get(file.id) === signature) return;
    try {
      if (!file.remoteRevision) {
        const result = await json<{file:GameFile}>('/api/files', { method: 'POST', body: JSON.stringify({ file }) });
        applyFile(result.file); seen.set(file.id, currentSignature(result.file));
      } else {
        const result = await json<{file:GameFile}>(`/api/files/${encodeURIComponent(file.id)}`, { method: 'PUT', body: JSON.stringify({ file, baseRevision: file.remoteRevision }) });
        applyFile(result.file); seen.set(file.id, currentSignature(result.file));
      }
      setStatus('shared');
    } catch (error) {
      const err = error as { response?: Response; value?: { file?: GameFile } };
      if (err.value?.file) { const latest=useStore.getState().files.find(f=>f.id===file.id);if(!latest||!recoverGraphConflict(latest,err.value.file)){clearGraphHistory(file.id);applyFile(err.value.file);seen.set(file.id,currentSignature(err.value.file));} }
      setStatus(err.response ? 'shared' : 'offline');
    }
  };
  const poll = async () => {
    if (!alive || polling) return;
    polling = true;
    try {
      const result = await json(`/api/changes?after=${cursor}`) as { changes: Change[]; cursor: number };
      for (const change of result.changes) {
        cursor = Math.max(cursor, change.id);
        if (change.operation === 'delete') { useStore.setState(s => ({ files: s.files.filter(f => f.id !== change.fileId), currentId: s.currentId === change.fileId ? null : s.currentId })); seen.delete(change.fileId); continue; }
        try {
          const file = JSON.parse(change.document) as GameFile;
          if (!file || typeof file.id !== 'string') continue;
          const signature = currentSignature(file);
          if (seen.get(file.id) !== signature) {
            const local=useStore.getState().files.find(f=>f.id===file.id);
            if(local&&seen.has(file.id)&&currentSignature(local)!==seen.get(file.id)&&recoverGraphConflict(local,file))continue;
            clearGraphHistory(file.id); suppress.add(file.id); applyFile(file); seen.set(file.id, signature); queueMicrotask(() => suppress.delete(file.id));
          }
        } catch { /* Ignore malformed historical rows and keep polling. */ }
      }
      cursor = Math.max(cursor, result.cursor || cursor);
      setStatus('shared');
    } catch { setStatus('offline'); }
    finally { polling = false; if (alive) timer = setTimeout(poll, 850); }
  };
  const unsubscribe = useStore.subscribe((state, previous) => {
    if (suppress.size) return;
    const before = new Map(previous.files.map(f => [f.id, f]));
    for (const file of state.files) {
      const old = before.get(file.id);
      if (!old || currentSignature(file) !== currentSignature(old)) {
      const oldTimer = debounceTimers.get(file.id); if (oldTimer) clearTimeout(oldTimer);
      debounceTimers.set(file.id, setTimeout(() => { if (!suppress.has(file.id)) void save(useStore.getState().files.find(f => f.id === file.id) ?? file); }, 300));
      }
    }
    for (const old of previous.files) if (!state.files.some(f => f.id === old.id) && old.remoteRevision) {
      void json(`/api/files/${encodeURIComponent(old.id)}`, { method: 'DELETE' }).catch(() => setStatus('offline'));
    }
  });
  const initialize = async () => {
    try {
      const result = await json('/api/files') as { files: GameFile[]; cursor: number };
      cursor = result.cursor || 0;
      const remoteFiles = result.files || [];
      const localFiles = useStore.getState().files;
      const remoteIds = new Set(remoteFiles.map(f => f.id));
      const merged = [...remoteFiles, ...localFiles.filter(f => !remoteIds.has(f.id))];
      useStore.setState({ files: merged, currentId: useStore.getState().currentId ?? merged[0]?.id ?? null });
      for (const file of remoteFiles) seen.set(file.id, currentSignature(file));
      for (const file of localFiles) if (!remoteIds.has(file.id)) await save(file);
      for (const file of remoteFiles) if(file.running&&(file.offlineCapSeconds??14400)>0) await performCommand(file.id,'offline');
      setStatus('shared');
      void poll();
    } catch { setStatus('offline'); timer = setTimeout(() => { if (alive) void initialize(); }, 3000); }
  };
  void initialize();
  const onVisibility = () => { if (document.visibilityState === 'visible') void poll(); };
  document.addEventListener('visibilitychange', onVisibility);
  const presence = async () => {
    const state = useStore.getState();
    const file = state.files.find(f => f.id === state.currentId);
    if (!file || !state.name) return;
    try {
      await json(`/api/files/${encodeURIComponent(file.id)}/presence`, { method: 'POST', body: JSON.stringify({ id: participantId(), name: state.name, color: state.color }) });
      window.dispatchEvent(new CustomEvent('idle-lab-presence', { detail: { fileId: file.id } }));
    } catch { /* Presence expires automatically if a visitor disconnects. */ }
  };
  presence();
  const presenceId = setInterval(presence, 4000);
  stopCurrent = () => { alive = false; unsubscribe(); if (timer) clearTimeout(timer); debounceTimers.forEach(clearTimeout); clearInterval(presenceId); document.removeEventListener('visibilitychange', onVisibility); };
}

export async function remoteCommand(fileId: string, command: string, argument?: string | number) {
  return commandHandler ? commandHandler(fileId,command,argument) : false;
}
