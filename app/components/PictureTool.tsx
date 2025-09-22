"use client";
import React, { useEffect, useRef, useState } from "react";

const API_BASE  = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

export default function PictureTool() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);                  // 0.2 .. 8
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // pan px
  const [drag, setDrag] = useState<{sx:number; sy:number; ox:number; oy:number} | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const canvasRef  = useRef<HTMLCanvasElement>(null);   // final 64x64
  const previewRef = useRef<HTMLCanvasElement>(null);   // on-screen preview

  const draw = () => {
    const c = canvasRef.current, p = previewRef.current;
    if (!c || !p) return;
    const W = 64, H = 64;
    const ctx = c.getContext("2d")!;
    const pctx = p.getContext("2d")!;

    // black background (letterbox)
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = "black";
    ctx.fillRect(0,0,W,H);
    pctx.clearRect(0,0,W,H);
    pctx.fillStyle = "black";
    pctx.fillRect(0,0,W,H);

    if (!img) return;

    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;

    const baseScale = Math.min(W/iw, H/ih);     // contain
    const scale = Math.max(0.2, Math.min(8, baseScale * zoom));
    const drawW = Math.max(1, Math.floor(iw * scale));
    const drawH = Math.max(1, Math.floor(ih * scale));
    const x = Math.floor((W - drawW)/2 + offset.x);
    const y = Math.floor((H - drawH)/2 + offset.y);

    // crisp pixels
    ctx.imageSmoothingEnabled  = false;
    pctx.imageSmoothingEnabled = false;

    ctx.drawImage(img, x, y, drawW, drawH);
    pctx.drawImage(img, x, y, drawW, drawH);
  };

  useEffect(() => { draw(); }, [img, zoom, offset]);

  const handleFiles = (files: FileList | null) => {
    if (!files?.[0]) return;
    const f = files[0];
    if (!/^image\/(png|jpe?g)$/i.test(f.type)) {
      setStatus("Pick a PNG or JPG");
      return;
    }
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      setImg(im);
      setZoom(1);
      setOffset({x:0,y:0});
      setStatus("");
    };
    im.src = url;
  };

  const onWheel: React.WheelEventHandler<HTMLCanvasElement> = (e) => {
    if (!img) return;
    e.preventDefault();
    const dz = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.2, Math.min(8, +(z + dz).toFixed(2))));
  };

  const onPointerDown: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y });
  };
  const onPointerMove: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (!drag) return;
    setOffset({ x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) });
  };
  const onPointerUp: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
  };

  const exportPNG = async (): Promise<Blob> => {
    const c = canvasRef.current!;
    draw();
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png")
    );
  };

  const onApply = async () => {
    if (!img) return;
    setBusy(true);
    setStatus("Uploading…");
    try {
      const png = await exportPNG();
      const r = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: png,
      });
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
      setStatus("Sent ✔ Your Pi should update.");
    } catch (e: any) {
      setStatus(e?.message || "Failed to send image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div
        style={styles.drop}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        onClick={() => (document.getElementById("filepick") as HTMLInputElement).click()}
      >
        <input id="filepick" type="file" accept="image/png,image/jpeg" style={{display:"none"}}
               onChange={(e) => handleFiles(e.target.files)} />
        <span>Drop PNG/JPG here or click</span>
      </div>

      <div style={styles.controls}>
        <label style={styles.label}>
          Zoom
          <input type="range" min={0.2} max={8} step={0.05} value={zoom}
                 onChange={(e)=>setZoom(parseFloat(e.target.value))}
                 style={{ width: 180, marginLeft: 8 }}/>
          <span style={{ marginLeft: 8 }}>{zoom.toFixed(2)}×</span>
        </label>
        <div style={{ fontSize: 12, color: "#9ab" }}>Tip: drag to pan • scroll to zoom</div>
      </div>

      <div style={styles.previewRow}>
        <div style={styles.previewBox}>
          <canvas
            ref={previewRef}
            width={64}
            height={64}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={styles.canvas}
          />
          <div style={styles.previewLabel}>Preview (64×64)</div>
        </div>
        {/* hidden export canvas */}
        <canvas ref={canvasRef} width={64} height={64} style={{ display: "none" }} />
      </div>

      <button onClick={onApply} disabled={busy || !img} style={styles.btn}>
        {busy ? "Sending…" : "Apply to Matrix"}
      </button>

      <div style={styles.status}>{status}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display:"flex", flexDirection:"column", gap:10, marginTop:12 },
  drop: {
    border: "1px dashed #456", color: "#9ab", borderRadius: 10,
    padding: 18, textAlign: "center", cursor: "pointer",
  },
  controls: { display:"flex", flexDirection:"column", gap:8 },
  label: { display:"flex", alignItems:"center", color:"#cfe" },
  previewRow: { display:"flex", gap:16, alignItems:"center" },
  previewBox: {
    width: 96, height: 96, padding: 16, borderRadius: 12, background: "#0b0f14",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    border: "1px solid #123",
  },
  canvas: {
    width: 64, height: 64, imageRendering: "pixelated", borderRadius: 8, border: "1px solid #123",
    touchAction: "none",
  },
  previewLabel: { marginTop: 8, fontSize: 12, color: "#7fa" },
  btn: { padding:"10px 16px", borderRadius:10, border:"1px solid #2a5", background:"linear-gradient(#1a3,#092)", color:"#fff" },
  status: { minHeight: 20, color: "#9cf", fontSize: 13 },
};
