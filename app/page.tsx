"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://matrix-backend-lv4k.onrender.com";
const WS_URL   = process.env.NEXT_PUBLIC_WS_URL  ?? "wss://matrix-backend-lv4k.onrender.com/ws";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? "MY_SUPER_TOKEN_123";

type State = { mode: number; brightness: number };

const MODES = [
  { id: 0, label: "Idle" },
  { id: 1, label: "MLB" },
  { id: 2, label: "Music" },
  { id: 3, label: "Clock" },
  { id: 4, label: "Weather" },
  { id: 5, label: "Picture" },
];

async function apiGet(): Promise<State> {
  const res = await fetch(`${API_BASE}/state`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch state");
  return res.json();
}

async function apiPost(body: Partial<State>) {
  const res = await fetch(`${API_BASE}/state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to post state");
  return res.json();
}

export default function Page() {
  const [state, setState] = useState<State>({ mode: 0, brightness: 60 });
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // initial state
  useEffect(() => {
    apiGet().then(setState).catch(console.error);
  }, []);

  // websocket live updates
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as State;
        setState(data);
      } catch {}
    };
    return () => ws.close();
  }, []);

  const setMode = (m: number) => {
    setState((s) => ({ ...s, mode: m }));
    setPending(true);
    apiPost({ mode: m }).catch(console.error).finally(() => setPending(false));
  };

  const setBrightness = (b: number) => {
    setState((s) => ({ ...s, brightness: b }));
    apiPost({ brightness: b }).catch(console.error);
  };

  const statusDotClass = useMemo(
    () => (connected ? styles.dotLive : styles.dotOffline),
    [connected]
  );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Matrix Controller</h1>
          <div className={styles.status}>
            <span className={`${styles.dot} ${statusDotClass}`} />
            <span>{connected ? "Live (WS)" : "Offline"}</span>
          </div>
        </header>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Modes</h2>
          <div className={styles.modeGrid}>
            {MODES.map((m) => {
              const active = state.mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  disabled={pending && active}
                  className={`${styles.modeBtn} ${active ? styles.modeBtnActive : ""}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className={styles.brightness}>
            <label className={styles.brightnessLabel}>
              Brightness: <strong>{state.brightness}%</strong>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={state.brightness}
              onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
              className={styles.slider}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
