"use client";
import React, { useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

// Canvas output size (matrix)
const OUT = 64;

type DragState = { dragging: boolean; sx: number; sy: number; ox: number; oy: number };

export default function PictureTool() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [offset, setOffset] = useState<{x:number;y:number}>({x:0,y:0});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [etag, setEtag] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<DragState>({ dragging:false, sx:0, sy:0, ox:0, oy:0 });

  // Load current image (so re-entering mode keeps last)
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/image`, { cache: "no-store" });
        if (abort) return;
        if (res.ok) {
          const tag = res.headers.get("ETag");
          if (tag) setEtag(tag);
          const blob = await res.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const imgEl = new Image();
            imgEl.onload = () => {
              if (!abort) {
                setImg(imgEl);
                setZoom(1.0);
                setOffset({x:0,y:0});
              }
              URL.revokeObjectURL(url);
            };
            imgEl.src = url;
          }
        }
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  // Draw preview
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;

    // preview canvas is 256 for nicer UX (scaled)
    c.width = 256; c.height = 256;
    // Fill black frame
    ctx.fillStyle = "#000";
    ctx.fillRect(0,0,c.width,c.height);

    if (!img) return;

    // compute scaled draw
    const scale = zoom * Math.min(c.width / img.width, c.height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (c.width - dw)/2 + offset.x;
    const dy = (c.height - dh)/2 + offset.y;

    // draw
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, dx, dy, dw, dh);

    // draw 64x64 grid preview box (optional helper)
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(0.5, 0.5, c.width-1, c.height-1);
  }, [img, zoom, offset]);

  // Handlers
  const onFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1.0);
      setOffset({x:0,y:0});
      setStatus("");
      URL.revokeObjectURL(url);
    };
    el.src = url;
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const onBrowse: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };

  // drag-to-pan
  const onMouseDown: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    drag.current = { dragging:true, sx:e.clientX, sy:e.clientY, ox:offset.x, oy:offset.y };
  };
  const onMouseMove: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    if (!drag.current.dragging) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    setOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy });
  };
  const onMouseUp: React.MouseEventHandler<HTMLCanvasElement> = () => {
    drag.current.dragging = false;
  };

  const applyToMatrix = async () => {
    if (!img) { setStatus("No image selected."); return; }
    setBusy(true);
    setStatus("Rendering…");

    try {
      // Render to true 64x64 with black letterbox
      const out = document.createElement("canvas");
      out.width = OUT; out.height = OUT;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0,0,OUT,OUT);
      ctx.imageSmoothingEnabled = false;

      // mirror preview transform to 64x64
      // compute scale of preview relative to 64x64
      // preview canvas was 256x256; factor = 64/256 = 0.25
      const factor = OUT / 256;
      const prevScale = zoom * Math.min(256 / img.width, 256 / img.height);
      const dw = img.width * prevScale * factor;   // scaled into 64 arena
      const dh = img.height * prevScale * factor;
      const dx = (OUT - dw)/2 + offset.x * factor;
      const dy = (OUT - dh)/2 + offset.y * factor;

      ctx.drawImage(img, dx, dy, dw, dh);

      const blob: Blob = await new Promise((resolve) => out.toBlob(b => resolve(b!), "image/png"));
      // Send as multipart/form-data to avoid 422
      const form = new FormData();
      form.append("file", blob, "picture.png");

      const res = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: {
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        throw new Error(`Upload failed: ${res.status} ${txt}`);
      }
      const json = await res.json();
      setEtag(json?.etag || null);
      setStatus("Uploaded. Switch to Picture (mode 5) or leave it there to display.");

      // Optionally auto-switch to mode 5 (comment out if you don’t want it)
      // await fetch(`${API_BASE}/state`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}) },
      //   body: JSON.stringify({ mode: 5 }),
      // });

    } catch (e:any) {
      setStatus(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const box: React.CSSProperties = {
    border: "1px dashed rgba(255,255,255,0.4)",
    borderRadius: 12,
    padding: 14,
  };

  const btn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div>
      <div style={box}
           onDrop={onDrop}
           onDragOver={(e)=>e.preventDefault()}>
        <div style={{display:"flex", gap:16, flexWrap:"wrap", alignItems:"flex-start"}}>
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            <canvas
              ref={canvasRef}
              width={256}
              height={256}
              style={{ width:256, height:256, imageRendering:"pixelated", cursor:"grab", background:"#000" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
            <div style={{display:"flex", gap:12, alignItems:"center"}}>
              <label style={{opacity:0.9, fontSize:12}}>Zoom</label>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e)=>setZoom(parseFloat(e.target.value))}
                style={{ width:180 }}
              />
              <span style={{opacity:0.8, fontSize:12}}>{zoom.toFixed(2)}×</span>
            </div>
            <div style={{display:"flex", gap:8}}>
              <input type="file" accept="image/*" onChange={onBrowse}/>
              <button style={btn} onClick={applyToMatrix} disabled={busy}>
                {busy ? "Applying…" : "Apply to Matrix"}
              </button>
            </div>
            {!!status && <div style={{fontSize:12, opacity:0.85, marginTop:6}}>{status}</div>}
            {!!etag && <div style={{fontSize:11, opacity:0.6}}>ETag: {etag}</div>}
          </div>

          <div>
            <div style={{opacity:0.85, marginBottom:6}}>Live 64×64 preview</div>
            <canvas
              width={OUT}
              height={OUT}
              style={{width:128, height:128, imageRendering:"pixelated", background:"#000", borderRadius:8}}
              ref={(node) => {
                if (!node) return;
                // draw tiny live preview
                const ctx = node.getContext("2d");
                if (!ctx) return;
                // render same as main effect
                const draw = () => {
                  ctx.fillStyle = "#000";
                  ctx.fillRect(0,0,OUT,OUT);
                  if (!img) return;
                  ctx.imageSmoothingEnabled = false;
                  const prevScale = zoom * Math.min(256 / img.width, 256 / img.height);
                  const dw = img.width * prevScale * (OUT/256);
                  const dh = img.height * prevScale * (OUT/256);
                  const dx = (OUT - dw)/2 + offset.x * (OUT/256);
                  const dy = (OUT - dh)/2 + offset.y * (OUT/256);
                  ctx.drawImage(img, dx, dy, dw, dh);
                };
                draw();
                // re-draw on changes
                const obs = new MutationObserver(draw);
                obs.observe(node, { attributes:false });
                // quick ticker
                const id = setInterval(draw, 100);
                return () => { clearInterval(id); obs.disconnect(); };
              }}
            />
          </div>
        </div>
        <div style={{fontSize:12, opacity:0.8, marginTop:8}}>
          Tip: drag the canvas to pan; use the slider to zoom. Black borders fill outside the image.
        </div>
      </div>
    </div>
  );
}
