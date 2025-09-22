"use client";
import React from "react";
import Cropper from "react-easy-crop";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://matrix-backend-lv4k.onrender.com";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

async function uploadPNG(blob: Blob) {
  const form = new FormData();
  form.append("file", new File([blob], "upload.png", { type: "image/png" }));
  const res = await fetch(`${API_BASE}/image`, {
    method: "POST",
    headers: {
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload failed: ${res.status} ${txt}`);
  }
  return res.json();
}

function createCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

async function cropToPng(img: HTMLImageElement, cropPixels: {x:number;y:number;width:number;height:number}) {
  const c = createCanvas(cropPixels.width, cropPixels.height);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false; // crisp
  ctx.drawImage(
    img,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, cropPixels.width, cropPixels.height
  );
  // scale to 64x64 with black letterbox
  const out = createCanvas(64,64);
  const octx = out.getContext("2d")!;
  octx.fillStyle = "black";
  octx.fillRect(0,0,64,64);
  const scale = Math.min(64/c.width, 64/c.height);
  const nw = Math.max(1, Math.floor(c.width*scale));
  const nh = Math.max(1, Math.floor(c.height*scale));
  const ox = Math.floor((64 - nw)/2);
  const oy = Math.floor((64 - nh)/2);
  octx.imageSmoothingEnabled = false;
  octx.drawImage(c, 0,0,c.width,c.height, ox,oy,nw,nh);
  return await new Promise<Blob>((resolve) => out.toBlob(b => resolve(b!), "image/png"));
}

export default function PictureTool() {
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [imgEl, setImgEl] = React.useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = React.useState<{x:number;y:number}>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<{x:number;y:number;width:number;height:number} | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [etag, setEtag] = React.useState<string | null>(null);

  // Load last image (persistence)
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/image`, { cache: "no-store" });
        if (res.ok) {
          const et = res.headers.get("ETag");
          setEtag(et);
          const blob = await res.blob();
          setPreviewUrl(URL.createObjectURL(blob));
        }
      } catch {}
    })();
  }, []);

  const onFile = async (f: File) => {
    if (!f) return;
    if (!f.type.includes("png")) {
      alert("Please upload a PNG for now.");
      return;
    }
    setImageSrc(URL.createObjectURL(f));
    setPreviewUrl(null);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
  };

  const onCropComplete = React.useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const doApply = async () => {
    if (!imgEl || !croppedAreaPixels) {
      alert("Choose an image and set the crop first.");
      return;
    }
    try {
      setBusy(true);
      const png = await cropToPng(imgEl, croppedAreaPixels);
      const res = await uploadPNG(png);
      setEtag(res.etag || null);
      // refresh preview
      const r = await fetch(`${API_BASE}/image`, {
        headers: etag ? { "If-None-Match": etag } : {},
        cache: "no-store",
      });
      if (r.status === 200) {
        const et2 = r.headers.get("ETag"); setEtag(et2);
        const blob = await r.blob();
        setPreviewUrl(URL.createObjectURL(blob));
      }
      // Optional: ensure mode 5 (but picture.py polls, so not strictly required)
      await fetch(`${API_BASE}/state`, {
        method: "POST",
        headers: {
          "Content-Type":"application/json",
          ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
        },
        body: JSON.stringify({ mode: 5 })
      });
    } catch (e:any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={(e)=>e.preventDefault()}
        style={{
          border:"1px dashed rgba(255,255,255,0.4)",
          borderRadius:12,
          padding:12,
          marginBottom:12,
          display:"flex",
          gap:12,
          flexWrap:"wrap"
        }}
      >
        <label style={{display:"inline-block"}}>
          <input type="file" accept="image/png" style={{display:"none"}}
            onChange={(e)=> e.target.files?.[0] && onFile(e.target.files[0])}/>
          <span style={{cursor:"pointer", padding:"8px 12px", background:"rgba(255,255,255,0.08)", borderRadius:8}}>
            Choose PNG
          </span>
        </label>
        <span style={{opacity:0.75}}>…or drag & drop a PNG here</span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 200px", gap:16}}>
        <div style={{position:"relative", width:"min(420px, 90vw)", height:420, background:"#111", borderRadius:12, overflow:"hidden", border:"1px solid rgba(255,255,255,0.15)"}}>
          {imageSrc ? (
            <>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                cropShape="rect"
                showGrid={false}
                restrictPosition
              />
              {/* invisible <img> to feed canvas exporter crisp pixels */}
              <img src={imageSrc} ref={setImgEl} alt="" style={{display:"none"}} />
            </>
          ) : (
            <div style={{display:"grid",placeItems:"center",height:"100%", color:"rgba(255,255,255,0.6)"}}>
              Select an image to crop
            </div>
          )}
        </div>

        <div>
          <div style={{marginBottom:12}}>
            <div style={{marginBottom:6, opacity:0.8, fontSize:12}}>Zoom</div>
            <input type="range" min={1} max={8} step={0.1} value={zoom} onChange={(e)=>setZoom(Number(e.target.value))} />
          </div>
          <button
            onClick={doApply}
            disabled={busy || !imageSrc || !croppedAreaPixels}
            style={{
              padding:"10px 14px",
              borderRadius:10,
              border:"1px solid rgba(255,255,255,0.25)",
              background: busy ? "rgba(255,255,255,0.25)":"linear-gradient(180deg,#2563EB,#1D4ED8)",
              color:"white", fontWeight:700, cursor: busy ? "default":"pointer"
            }}
          >
            {busy ? "Applying…" : "Apply to Matrix"}
          </button>

          <div style={{marginTop:16, opacity:0.85}}>Current on matrix:</div>
          <div style={{marginTop:8, width:128, height:128, background:"#000", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, display:"grid", placeItems:"center"}}>
            {previewUrl
              ? <img src={previewUrl} alt="current" width={128} height={128} style={{imageRendering:"pixelated"}}/>
              : <span style={{opacity:0.6}}>none</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
