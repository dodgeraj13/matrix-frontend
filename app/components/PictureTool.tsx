"use client";
import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

export default function PictureTool() {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string>("");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png") { setStatus("Please choose a PNG file."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus("");
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.type !== "image/png") { setStatus("Please drop a PNG file."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus("");
  }

  async function onUpload() {
    if (!file) { setStatus("Pick a PNG first."); return; }
    setStatus("Uploading…");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/image`, {
      method: "POST",
      headers: { ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}) },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text();
      setStatus(`Upload failed: ${res.status} ${t}`);
      return;
    }
    // switch mode to 5 after upload
    await fetch(`${API_BASE}/state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ mode: 5 }),
    });
    setStatus("Uploaded ✔ (Mode set to 5)");
  }

  const box: React.CSSProperties = {
    width: 260, height: 260, borderRadius: 10,
    border: "1px dashed rgba(255,255,255,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", background: "rgba(255,255,255,0.05)",
  };

  return (
    <div>
      <div
        style={box}
        onDragOver={(e)=>e.preventDefault()}
        onDrop={onDrop}
      >
        {preview ? (
          <img
            src={preview}
            alt="preview"
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
          />
        ) : (
          <span style={{opacity:0.8, textAlign:"center"}}>
            Drag & drop a PNG here
            <br/>or click below
          </span>
        )}
      </div>
      <div style={{marginTop:10, display:"flex", gap:8, alignItems:"center"}}>
        <input type="file" accept="image/png" onChange={onPick}/>
        <button
          onClick={onUpload}
          style={{padding:"8px 12px", borderRadius:8, border:"1px solid rgba(255,255,255,0.25)", background:"rgba(255,255,255,0.08)", color:"white", cursor:"pointer"}}
        >
          Apply to Matrix
        </button>
        <span style={{opacity:0.8, fontSize:12}}>{status}</span>
      </div>
      <div style={{opacity:0.7, fontSize:12, marginTop:6}}>
        Tip: image is scaled to 64×64 with black bars as needed.
      </div>
    </div>
  );
}
