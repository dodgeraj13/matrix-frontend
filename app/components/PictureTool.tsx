"use client";
import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

type DragState = {
  active: boolean;
  startX: number;
  startY: number;
  atDragStartOffsetX: number;
  atDragStartOffsetY: number;
};

type ImgMeta = {
  el: HTMLImageElement;
  naturalW: number;
  naturalH: number;
};

export default function PictureTool() {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [img, setImg] = React.useState<ImgMeta | null>(null);
  const [scale, setScale] = React.useState<number>(1); // zoom
  const [offsetX, setOffsetX] = React.useState<number>(0);
  const [offsetY, setOffsetY] = React.useState<number>(0);
  const [busy, setBusy] = React.useState<boolean>(false);
  const [status, setStatus] = React.useState<string>("");

  // 64x64 target, but we preview on a larger canvas for UX
  const PREVIEW = 256;
  const TARGET = 64;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drag = React.useRef<DragState>({
    active: false,
    startX: 0,
    startY: 0,
    atDragStartOffsetX: 0,
    atDragStartOffsetY: 0,
  });

  // Load file -> dataURL
  const onFile = React.useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setDataUrl(String(rd.result));
    rd.readAsDataURL(f);
  }, []);

  // Drag & drop
  const onDrop = React.useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    if (ev.dataTransfer.files && ev.dataTransfer.files[0]) {
      const f = ev.dataTransfer.files[0];
      const rd = new FileReader();
      rd.onload = () => setDataUrl(String(rd.result));
      rd.readAsDataURL(f);
    }
  }, []);
  const onDragOver = React.useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
  }, []);

  // Load <img> from dataURL
  React.useEffect(() => {
    if (!dataUrl) { setImg(null); return; }
    const i = new Image();
    i.onload = () => setImg({ el: i, naturalW: i.naturalWidth, naturalH: i.naturalHeight });
    i.onerror = () => setStatus("Failed to load image");
    i.src = dataUrl;
  }, [dataUrl]);

  // Draw preview to canvas
  const redraw = React.useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // background (editor area)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PREVIEW, PREVIEW);

    if (!img) return;

    const { el, naturalW, naturalH } = img;

    // Fit/scale image so user can pan/zoom inside square frame
    const baseScale = Math.max(PREVIEW / naturalW, PREVIEW / naturalH); // cover
    const s = baseScale * scale;

    const drawW = Math.floor(naturalW * s);
    const drawH = Math.floor(naturalH * s);
    const dx = Math.floor((PREVIEW - drawW) / 2 + offsetX);
    const dy = Math.floor((PREVIEW - drawH) / 2 + offsetY);

    // Black borders fill are already handled by ctx.fillRect.
    // Draw the image
    ctx.drawImage(el, dx, dy, drawW, drawH);

    // OPTIONAL faint guides (subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, PREVIEW, PREVIEW);
  }, [img, scale, offsetX, offsetY]);

  React.useEffect(() => { redraw(); }, [redraw]);

  // Pointer handlers to drag the image
  const onPointerDown = React.useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current.active = true;
    drag.current.startX = ev.clientX;
    drag.current.startY = ev.clientY;
    drag.current.atDragStartOffsetX = offsetX;
    drag.current.atDragStartOffsetY = offsetY;
    (ev.currentTarget as HTMLCanvasElement).setPointerCapture(ev.pointerId);
  }, [offsetX, offsetY]);

  const onPointerMove = React.useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current.active) return;
    const dx = ev.clientX - drag.current.startX;
    const dy = ev.clientY - drag.current.startY;
    setOffsetX(drag.current.atDragStartOffsetX + dx);
    setOffsetY(drag.current.atDragStartOffsetY + dy);
  }, []);

  const onPointerUp = React.useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current.active = false;
    try { (ev.currentTarget as HTMLCanvasElement).releasePointerCapture(ev.pointerId); } catch {}
  }, []);

  // Wheel to zoom
  const onWheel = React.useCallback((ev: React.WheelEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    const delta = ev.deltaY < 0 ? 0.05 : -0.05;
    setScale((s) => Math.max(0.2, Math.min(6, s + delta)));
  }, []);

  // Upload the TARGET 64x64 PNG to backend
  const applyToMatrix = React.useCallback(async () => {
    if (!img) { setStatus("No image selected"); return; }
    setBusy(true); setStatus("Preparing…");
    try {
      // Render 64x64 the same way as preview, but into tiny canvas
      const tiny = document.createElement("canvas");
      tiny.width = TARGET; tiny.height = TARGET;
      const ctx = tiny.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D not available");
      ctx.imageSmoothingEnabled = false;

      // Compute how we drew in preview, but map to 64
      const baseScale = Math.max(PREVIEW / img.naturalW, PREVIEW / img.naturalH);
      const s = baseScale * scale;
      const drawW = Math.floor(img.naturalW * s);
      const drawH = Math.floor(img.naturalH * s);
      const dx = Math.floor((PREVIEW - drawW) / 2 + offsetX);
      const dy = Math.floor((PREVIEW - drawH) / 2 + offsetY);

      // Scale mapping preview->target
      const ratio = TARGET / PREVIEW;

      // Fill black border first
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, TARGET, TARGET);

      ctx.drawImage(
        img.el,
        Math.floor(dx * ratio),
        Math.floor(dy * ratio),
        Math.floor(drawW * ratio),
        Math.floor(drawH * ratio)
      );

      const blob: Blob | null = await new Promise((resolve) => tiny.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to encode PNG");

      const res = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: {
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
          "Content-Type": "image/png",
        },
        body: blob,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

      setStatus("Uploaded. Switching to Picture mode…");
      // Flip mode to 5 immediately
      const r2 = await fetch(`${API_BASE}/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: JSON.stringify({ mode: 5 }),
      });
      if (!r2.ok) throw new Error(`Failed to switch mode: ${r2.status}`);
      setStatus("Applied to matrix ✔");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }, [img, scale, offsetX, offsetY]);

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          style={{
            width: PREVIEW,
            height: PREVIEW,
            borderRadius: 12,
            border: "1px dashed rgba(255,255,255,0.25)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <canvas
            ref={canvasRef}
            width={PREVIEW}
            height={PREVIEW}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
            style={{ width: PREVIEW, height: PREVIEW, touchAction: "none", display: "block" }}
          />
          {!dataUrl && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center", color: "#ccd", fontSize: 14
            }}>
              Drop PNG / JPG here or use file picker →
            </div>
          )}
        </div>

        <div style={{ minWidth: 260, flex: "1 0 260px" }}>
          <div style={{ marginBottom: 12 }}>
            <input type="file" accept="image/png,image/jpeg" onChange={onFile} />
          </div>

          <div style={{ margin: "12px 0" }}>
            <div style={{ marginBottom: 6 }}>Zoom</div>
            <input
              type="range"
              min={0.2}
              max={6}
              step={0.05}
              value={scale}
              onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setScale(Number(ev.target.value))}
              style={{ width: 220 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              onClick={applyToMatrix}
              disabled={!img || busy}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid transparent",
                background: "linear-gradient(180deg,#2563EB,#1D4ED8)",
                color: "white",
                fontWeight: 700,
                cursor: img && !busy ? "pointer" : "not-allowed",
              }}
            >
              {busy ? "Uploading…" : "Apply to Matrix"}
            </button>
            <span style={{ fontSize: 12, opacity: 0.85 }}>{status}</span>
          </div>

          {dataUrl && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Source preview:</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dataUrl}
                alt="preview"
                style={{ maxWidth: 220, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
              />
            </div>
          )}
        </div>
      </div>

      {dataUrl && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>64×64 export preview:</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="tiny"
            src={(() => {
              // live tiny preview (client only)
              const c = document.createElement("canvas");
              c.width = TARGET; c.height = TARGET;
              const ctx = c.getContext("2d");
              if (ctx && img) {
                ctx.imageSmoothingEnabled = false;
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, TARGET, TARGET);

                const baseScale = Math.max(PREVIEW / img.naturalW, PREVIEW / img.naturalH);
                const s = baseScale * scale;
                const drawW = Math.floor(img.naturalW * s);
                const drawH = Math.floor(img.naturalH * s);
                const dx = Math.floor((PREVIEW - drawW) / 2 + offsetX);
                const dy = Math.floor((PREVIEW - drawH) / 2 + offsetY);
                const ratio = TARGET / PREVIEW;
                ctx.drawImage(
                  img.el,
                  Math.floor(dx * ratio),
                  Math.floor(dy * ratio),
                  Math.floor(drawW * ratio),
                  Math.floor(drawH * ratio)
                );
                return c.toDataURL("image/png");
              }
              return dataUrl;
            })()}
            style={{ imageRendering: "pixelated", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
