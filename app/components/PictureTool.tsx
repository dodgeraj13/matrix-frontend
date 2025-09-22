/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";
const MATRIX_SIZE = 64;

export default function PictureTool() {
  const [fileName, setFileName] = React.useState<string>("");
  const [imgURL, setImgURL] = React.useState<string>("");
  const [backendURL, setBackendURL] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>("");

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = React.useState<number>(1);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dragRef = React.useRef({ dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 });

  const drawPreview = React.useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas) return;

    if (canvas.width !== MATRIX_SIZE) canvas.width = MATRIX_SIZE;
    if (canvas.height !== MATRIX_SIZE) canvas.height = MATRIX_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, MATRIX_SIZE, MATRIX_SIZE);

    if (!img) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const sw = MATRIX_SIZE * scale;
    const sh = MATRIX_SIZE * scale;

    const sx = offset.x - sw / 2 + iw / 2;
    const sy = offset.y - sh / 2 + ih / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, MATRIX_SIZE, MATRIX_SIZE);
  }, [scale, offset]);

  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/image`, { cache: "no-store" });
        if (aborted) return;
        if (res.status === 204) { setBackendURL(""); return; }
        if (res.ok && (res.headers.get("content-type") || "").startsWith("image/")) {
          const blob = await res.blob();
          if (!aborted && blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setBackendURL(url);
          }
        }
      } catch {}
    })();
    return () => { aborted = true; };
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png") {
      setError("Please upload a PNG file.");
      return;
    }
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    setImgURL(url);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const coverScale = Math.max(iw, ih) / MATRIX_SIZE;
    setScale(coverScale);
    setOffset({ x: 0, y: 0 });
    requestAnimationFrame(drawPreview);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startOffX = offset.x;
    dragRef.current.startOffY = offset.y;
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.startOffX + dx * scale, y: dragRef.current.startOffY + dy * scale });
  };
  const onMouseUp = () => { dragRef.current.dragging = false; };
  const onMouseLeave = () => { dragRef.current.dragging = false; };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    let next = scale * (dir > 0 ? 1.10 : 0.90);
    next = Math.max(0.2, Math.min(16, next));
    setScale(next);
  };

  React.useEffect(() => { drawPreview(); }, [drawPreview]);

  const onApplyToMatrix = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLoading(true);
    setError("");

    try {
      drawPreview();
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to export PNG from canvas");

      const up = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: blob,
      });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);

      // switch to mode 5 so agent starts picture.py immediately
      const sres = await fetch(`${API_BASE}/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: JSON.stringify({ mode: 5 }),
      });
      if (!sres.ok) throw new Error(`Failed to set mode 5: ${sres.status}`);

      // refresh the “currently applied” preview
      try {
        const r = await fetch(`${API_BASE}/image`, { cache: "no-store" });
        if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) {
          const b = await r.blob();
          if (b.size > 0) {
            if (backendURL) URL.revokeObjectURL(backendURL);
            setBackendURL(URL.createObjectURL(b));
          }
        }
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown upload error");
    } finally {
      setLoading(false);
    }
  };

  const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };
  const column: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
  const panel: React.CSSProperties = {
    border: "1px dashed rgba(255,255,255,0.25)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(255,255,255,0.05)",
  };
  const btn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div style={{ ...column }}>
      <div style={{ ...panel }}>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <label>
            <span style={{ display: "block", marginBottom: 6 }}>Upload PNG</span>
            <input type="file" accept="image/png" onChange={onFileChange} />
          </label>
          {fileName && <div>Selected: <strong>{fileName}</strong></div>}
        </div>

        <div style={{ ...row, marginTop: 10 }}>
          <div
            style={{
              width: 220, height: 220, display: "grid", placeItems: "center",
              background: "black", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
              position: "relative",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onWheel={onWheel}
          >
            <canvas
              ref={canvasRef}
              width={MATRIX_SIZE}
              height={MATRIX_SIZE}
              style={{ width: 196, height: 196, imageRendering: "pixelated", borderRadius: 6 }}
            />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Zoom</div>
              <input
                type="range"
                min={0.2}
                max={16}
                step={0.01}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                style={{ width: 180 }}
              />
            </div>

            <button onClick={onApplyToMatrix} style={btn} disabled={loading || !imgURL}>
              {loading ? "Applying…" : "Apply to Matrix (Mode 5)"}
            </button>

            {error && <div style={{ color: "#ff9a9a" }}>{error}</div>}
          </div>
        </div>
      </div>

      <div style={{ ...panel }}>
        <div style={{ marginBottom: 6, opacity: 0.9 }}>Selected image</div>
        {imgURL ? (
          <img src={imgURL} alt="selected" onLoad={onImageLoad} style={{ display: "none" }} />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No image selected yet.</div>
        )}
      </div>

      <div style={{ ...panel }}>
        <div style={{ marginBottom: 6, opacity: 0.9 }}>Currently applied on device</div>
        {backendURL ? (
          <img
            src={backendURL}
            alt="applied"
            width={196}
            height={196}
            style={{ imageRendering: "pixelated", borderRadius: 6, background: "black", border: "1px solid rgba(255,255,255,0.15)" }}
          />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No image found on device yet.</div>
        )}
      </div>
    </div>
  );
}
