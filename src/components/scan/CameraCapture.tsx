import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ImageIcon, RotateCcw, X, Check, Loader2 } from "lucide-react";
import { scanCaptureFileName } from "@/lib/scan-capture";

type Phase = "live" | "preview" | "unavailable";

type Props = {
  onClose: () => void;
  onUseImage: (file: File) => void;
  onGalleryRequest: () => void;
};

export function CameraCapture({ onClose, onUseImage, onGalleryRequest }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("live");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [starting, setStarting] = useState(true);

  function stopStream() {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startStream() {
    setStarting(true);
    setError(null);
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPhase("unavailable");
        setError("Kamera er ikke tilgjengelig i denne nettleseren.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("live");
    } catch (err: any) {
      console.warn("[CameraCapture] getUserMedia failed", err);
      setPhase("unavailable");
      setError(
        err?.name === "NotAllowedError"
          ? "Kameratilgang ble nektet. Bruk galleri i stedet."
          : "Klarte ikke å åpne kameraet. Bruk galleri i stedet.",
      );
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    void startStream();
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], scanCaptureFileName(), { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setPreviewFile(file);
        setPreviewUrl(url);
        setPhase("preview");
        stopStream();
      },
      "image/jpeg",
      0.92,
    );
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    void startStream();
  }

  function use() {
    if (!previewFile) return;
    onUseImage(previewFile);
  }

  function close() {
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={close} className="text-white hover:bg-white/10">
          <X className="h-5 w-5" />
        </Button>
        <div className="text-sm font-medium">Skann bilag</div>
        <div className="w-10" />
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {phase === "live" && (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="max-h-full max-w-full object-contain"
            />
            {starting && (
              <div className="absolute inset-0 grid place-items-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}
          </>
        )}
        {phase === "preview" && previewUrl && (
          <img src={previewUrl} alt="Forhåndsvisning" className="max-h-full max-w-full object-contain" />
        )}
        {phase === "unavailable" && (
          <div className="text-center p-6 space-y-3 max-w-sm">
            <Camera className="h-10 w-10 mx-auto opacity-70" />
            <p className="text-sm">{error ?? "Kamera er ikke tilgjengelig."}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-black/80 space-y-3">
        {phase === "live" && (
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="ghost"
              size="lg"
              onClick={onGalleryRequest}
              className="text-white hover:bg-white/10 flex-col h-auto py-2"
            >
              <ImageIcon className="h-6 w-6" />
              <span className="text-[10px] mt-1">Galleri</span>
            </Button>
            <button
              type="button"
              onClick={capture}
              disabled={starting}
              aria-label="Ta bilde"
              className="h-16 w-16 rounded-full bg-white ring-4 ring-white/30 active:scale-95 transition disabled:opacity-50"
            />
            <div className="w-[60px]" />
          </div>
        )}
        {phase === "preview" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={retake} size="lg">
              <RotateCcw className="h-4 w-4 mr-2" /> Ta på nytt
            </Button>
            <Button onClick={use} size="lg">
              <Check className="h-4 w-4 mr-2" /> Bruk bilde
            </Button>
            <Button
              variant="ghost"
              onClick={onGalleryRequest}
              className="col-span-2 text-white hover:bg-white/10"
            >
              <ImageIcon className="h-4 w-4 mr-2" /> Velg fra galleri
            </Button>
          </div>
        )}
        {phase === "unavailable" && (
          <div className="grid gap-2">
            <Button onClick={onGalleryRequest} size="lg">
              <ImageIcon className="h-4 w-4 mr-2" /> Velg fra galleri
            </Button>
            <Button variant="ghost" onClick={close} className="text-white hover:bg-white/10">
              Lukk
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
