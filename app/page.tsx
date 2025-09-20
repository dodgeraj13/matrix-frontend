"use client";
import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

type State = { mode: number; brightness: number; rotation: 0 | 90 | 180 | 270 };

function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const opts = [0, 90, 180, 270] as const;
  let best = 0 as 0 | 90 | 180 | 270, diff = Infinity;
  for (const o of opts) {
    const d = Math.abs(o - deg);
    if (d < diff) { best = o; diff = d; }
  }
  return best;
}

export default function Home() {
  const [mode, setMode] = React.useState<number>(0);
  const [brightness, setBrightness] = React.useState<number>(60);
  const [rotation, setRotation] = React.useState<0 | 90 | 180 | 270>(0);
  const [wsOK, setWsOK] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(true);

  async function apiGet(): Promise<State> {
    const res = await fetch(`${API_BASE}/state`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch state");
    return res.json();
  }

  async function apiPost(next: Partial<State>) {
    const res = await fetch(`${API_BASE}/state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        mode,
        brightness,
        rotation,
        ...next,
      }),
    });
    if (!res.ok) throw new Error("Failed to update state");
    const s: State = await res.json();
    setMode(s.mode);
    setBrightness(s.brightness);
    setRotation((s.rotation as 0 | 90 | 180 | 270) ?? 0);
  }

  // Initial fetch + WebSocket live updates
  React.useEffect(() => {
    (async () => {
      try {
        const s = await apiGet();
        setMode(s.mode);
        setBrightness(s.brightness);
        setRotation((s.rotation as 0 | 90 | 180 | 270) ?? 0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();

    let ws: WebSocket | null = null;
    try {
      const wsUrl = API_BASE.replace(/^http/, "ws") + "/ws";
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsOK(true);
      ws.onclose = () => setWsOK(false);
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === "state") {
            if (typeof data.mode === "number") setMode(data.mode);
            if (typeof data.brightness === "number") setBrightness(data.brightness);
            if (typeof data.rotation === "number") setRotation(normalizeRotation(data.rotation));
          }
        } catch {}
      };
    } catch (e) {
      console.warn("WS connect failed", e);
    }
    return () => { try { ws?.close(); } catch {} };
  }, []);

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0b1437",
    color: "white",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };
  const card: React.CSSProperties = {
    width: 680,
    maxWidth: "95vw",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  };
  const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };
  const btn = (active: boolean): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid",
    borderColor: active ? "transparent" : "rgba(255,255,255,0.25)",
    background: active
      ? "linear-gradient(180deg,#2563EB,#1D4ED8)"
      : "rgba(255,255,255,0.08)",
    color: active ? "white" : "white",
    cursor: "pointer",
    fontWeight: 600,
  });
  const label: React.CSSProperties = { width: 140, opacity: 0.9 };
  const input: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    width: 110,
  };
  const slider: React.CSSProperties = { width: 260 };

  const ModeButton: React.FC<{label: string; value: number}> = ({ label, value }) => (
    <button style={btn(mode === value)} onClick={() => apiPost({ mode: value })}>
      {label}
    </button>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
          <h1 style={{margin:0}}>Matrix Controller</h1>
          <span style={{fontSize:12, opacity:0.8}}>
            WS: {wsOK ? "connected ✅" : "disconnected ⭕"}
          </span>
        </div>

        <div style={{margin:"12px 0"}}>
          <div style={row}>
            <ModeButton label="Idle (0)" value={0} />
            <ModeButton label="MLB (1)" value={1} />
            <ModeButton label="Music (2)" value={2} />
            <ModeButton label="Clock (3)" value={3} />
            <ModeButton label="Weather (4)" value={4} />
            <ModeButton label="Picture (5)" value={5} />
          </div>
        </div>

        <div style={{marginTop:16}}>
          <div style={row}>
            <span style={label}>Brightness</span>
            <input
              type="range"
              min={0}
              max={100}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              onMouseUp={() => apiPost({ brightness })}
              onTouchEnd={() => apiPost({ brightness })}
              style={slider}
            />
            <span style={{minWidth:40, textAlign:"right"}}>{brightness}</span>
            <button style={btn(false)} onClick={() => apiPost({ brightness })}>Apply</button>
          </div>

          <div style={{...row, marginTop:12}}>
            <span style={label}>Rotation (deg)</span>
            <input
              type="number"
              value={rotation}
              onChange={(e) => setRotation(normalizeRotation(Number(e.target.value || 0)))}
              onBlur={(e) => {
                const snapped = normalizeRotation(Number(e.target.value || 0));
                setRotation(snapped);
                apiPost({ rotation: snapped });
              }}
              placeholder="0/90/180/270"
              style={input}
            />
            <button style={btn(false)} onClick={() => apiPost({ rotation })}>Apply</button>
          </div>
        </div>

        <div style={{opacity:0.75, fontSize:12, marginTop:16}}>
          {loading ? "Loading current state…" : `Mode=${mode}  Brightness=${brightness}  Rotation=${rotation}`}
        </div>
      </div>
    </div>
  );
}
