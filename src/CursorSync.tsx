"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";

type Person = { id: string; name: string; color: string; cursorX: number | null; cursorY: number | null };
export function CursorSync({ fileId }: { fileId: string }) {
  const name = useStore(s => s.name), color = useStore(s => s.color);
  const bounds = useRef<HTMLDivElement>(null), lastSent = useRef(0);
  const [people, setPeople] = useState<Person[]>([]);
  const own = typeof localStorage === "undefined" ? "" : (() => { let id = localStorage.getItem("idle-lab-participant"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("idle-lab-participant", id); } return id; })();
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/files/${encodeURIComponent(fileId)}/presence`).then(r => r.json() as Promise<{ participants: Person[] }>).then(v => { if (alive) setPeople(v.participants || []); }).catch(() => {});
    void load(); const poll = setInterval(load, 900);
    const move = (event: MouseEvent) => {
      const rect = bounds.current?.getBoundingClientRect(); if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      if (Date.now() - lastSent.current < 100) return; lastSent.current = Date.now();
      void fetch(`/api/files/${encodeURIComponent(fileId)}/presence`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: own || "guest", name: name || "Guest", color: color || "#9f7aea", cursorX: event.clientX - rect.left, cursorY: event.clientY - rect.top }) }).catch(() => {});
    };
    window.addEventListener("mousemove", move);
    return () => { alive = false; clearInterval(poll); window.removeEventListener("mousemove", move); };
  }, [fileId, own, name, color]);
  return <div ref={bounds} style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", overflow: "hidden" }}>
    {people.filter(p => p.id !== `${fileId}:${own}` && p.cursorX !== null && p.cursorY !== null).map(p => <div key={p.id} style={{ position: "absolute", left: p.cursorX!, top: p.cursorY!, color: p.color }}>
      <span style={{ display: "block", width: 9, height: 9, borderRadius: "50%", border: "2px solid white", background: p.color, boxShadow: "0 1px 5px #000" }} />
      <span style={{ display: "block", margin: "3px 0 0 9px", padding: "2px 5px", borderRadius: 3, background: p.color, color: "#101116", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</span>
    </div>)}
  </div>;
}
