"use client";

import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";
const MATRIX_SIZE = 64;

type StateResponse = { mode: number; brightness: number; rotation: 0 | 90 | 180 | 270 };

export default function PictureTool() {
  // UI state
  const [fileName, setFileName] = React.useState<string>("");
  const [imgURL, setImgURL] = React.useState<string>("");    // original image URL (object URL)
  const [backendURL, setBackendURL] = React.useState<string>(""); // /image current URL for persistence preview
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>("");

  // canvas & image
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  // pan/zoom state (logical units: image px)
  const [scale, setScale] = React.useState<number>(1);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // dragging
  const dragRef = React.useRef<{ dragging: boolean; startX: number; startY: number; startOffX: number; startOffY: number }>({
    dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0,
  });

  // draw canvas (preview is always MATRIX_SIZE x MATRIX_SIZE in CSS and backing store)
  const drawPreview = React.useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas) return;

    // ensure backing store is exact pixels
    if (canvas.width !== MATRIX_SIZE) canvas.width = MATRIX_SIZE;
    if (canvas.height !== MATRIX_SIZE) canvas.height = MATRIX_SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // black background / borders
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, MATRIX_SIZE, MATRIX_SIZE);

    if (!img) return;

    // image draw: scale and offset into 64x64 square
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // destination is fixed (0,0)-(64,64)
    // we compute source rect from offset/scale
    // scale means: how many image pixels per canvas pixel
    // so source size = MATRIX_SIZE * scale
    const sw = MATRIX_SIZE * scale;
    const sh = MATRIX_SIZE * scale;

    // source top-left in image space:
    const sx = offset.x - sw / 2 + iw / 2;
    const sy = offset.y - sh / 2 + ih / 2;

    ctx.imageSmoothingEnabled = false; // crisp
    ctx.drawImage(
      img,
      sx, sy, sw, sh,
      0, 0, MATRIX_SIZE, MATRIX_SIZE
    );
  }, [scale, offset]);

  // load current backend image on mount (for persistence)
  React.useEffect(() => {
    let aborted = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/image`, { cache: "no-store" });
        if (aborted) return;

        if (res.ok) {
          const blob = await res.blob();
          if (aborted) return;
          if (blob.size > 0 && blob.type.startsWith("image/")) {
            const url = URL.createObjectURL(blob);
            setBackendURL(url); // show as "currently applied"
          } else {
            setBackendURL("");
          }
        } else {
          setBackendURL("");
        }
      } catch {
        // ignore (no existing image)
        setBackendURL("");
      }
    })();

    return () => {
      aborted = true;
    };
  }, []);

  // when a user picks a file
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

    // Reset transform for new image
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // when preview <img> loads, set default zoom to "cover" square
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;

    // Choose a default scale so the shorter side fills 64px (cover)
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const coverScale = Math.max(iw, ih) / MATRIX_SIZE; // image pixels per canvas pixel
    setScale(coverScale);
    setOffset({ x: 0, y: 0 }); // center
    // draw once
    requestAnimationFrame(drawPreview);
  };

  // pan handling
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
    // map pixels in canvas preview to image-space offset:
    // 1 canvas pixel => scale image pixels
    setOffset({ x: dragRef.current.startOffX + dx * scale, y: dragRef.current.startOffY + dy * scale });
  };
  const onMouseUp = (_e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current.dragging = false;
  };
  const onMouseLeave = (_e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current.dragging = false;
  };

  // wheel zoom (pinch-like)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const direction = Math.sign(e.deltaY); // 1 = zoom out, -1 = zoom in
    const factor = direction > 0 ? 1.10 : 0.90;
    let next = scale * factor;
    // clamp: avoid zero / extreme
    next = Math.max(0.2, Math.min(16, next));
    setScale(next);
  };

  // redraw on pan/zoom changes
  React.useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // export the canvas to PNG and send to backend, then set Mode 5
  const onApplyToMatrix = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLoading(true);
    setError("");

    try {
      // Ensure the preview is up-to-date
      drawPreview();

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to export PNG from canvas");

      // Upload to /image (binary, with token)
      const res = await fetch(`${API_BASE}/image`, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: blob,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Upload failed: ${res.status} ${msg}`);
      }

      // switch to mode 5 (picture)
      const sres = await fetch(`${API_BASE}/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: JSON.stringify({ mode: 5 }),
      });

      if (!sres.ok) {
        const msg = await sres.text();
        throw new Error(`Failed to set mode 5: ${sres.status} ${msg}`);
      }

      // Keep the applied image as "persisted" preview (round-trip from backend)
      try {
        const current = await fetch(`${API_BASE}/image`, { cache: "no-store" });
        if (current.ok) {
          const b = await current.blob();
          if (b.size > 0 && b.type.startsWith("image/")) {
            // revoke old URL if any
            if (backendURL) URL.revokeObjectURL(backendURL);
            const url = URL.createObjectURL(b);
            setBackendURL(url);
          }
        }
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown upload error");
    } finally {
      setLoading(false);
    }
  };

  // UI styles
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
  const strong: React.CSSProperties = { fontWeight: 700, opacity: 0.95 };

  return (
    <div style={{ ...column }}>
      <div style={{ ...panel }}>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <label style={{ display: "inline-block" }}>
            <span style={{ display: "block", marginBottom: 6 }}>Upload PNG</span>
            <input
              type="file"
              accept="image/png"
              onChange={onFileChange}
            />
          </label>
          {fileName && <div>Selected: <span style={strong}>{fileName}</span></div>}
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
            {/* visual 64x64 preview (pixel-art scaled up by CSS) */}
            <canvas
              ref={canvasRef}
              width={MATRIX_SIZE}
              height={MATRIX_SIZE}
              style={{
                width: 196,
                height: 196,
                imageRendering: "pixelated", // crisp
                borderRadius: 6,
              }}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScale(Number(e.target.value))}
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
        {/* hidden <img> just to load source pixels; we draw to canvas for preview */}
        {imgURL ? (
          <img
            src={imgURL}
            alt="selected"
            onLoad={onImageLoad}
            style={{ display: "none" }}
          />
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
