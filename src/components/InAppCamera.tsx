import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, RotateCcw, ZoomIn, ZoomOut, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InAppCameraProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const InAppCamera = ({ onCapture, onClose }: InAppCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [flashOn, setFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [ready, setReady] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    stopStream();
    setReady(false);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Check capabilities (zoom, flash)
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities?.() as any;
        if (capabilities?.zoom) {
          setMaxZoom(Math.min(capabilities.zoom.max || 1, 10));
          setZoom(capabilities.zoom.min || 1);
        } else {
          setMaxZoom(1);
        }
        setHasFlash(!!capabilities?.torch);
      }

      setError(null);
      setReady(true);
    } catch (err) {
      console.error('Camera error:', err);
      setError('カメラにアクセスできません。カメラの使用を許可してください。');
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlip = () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    setFlashOn(false);
    startCamera(newFacing);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    const step = Math.max(0.5, (maxZoom - 1) / 10);
    const newZoom = direction === 'in'
      ? Math.min(zoom + step, maxZoom)
      : Math.max(zoom - step, 1);

    try {
      (track as any).applyConstraints({ advanced: [{ zoom: newZoom }] });
      setZoom(newZoom);
    } catch (e) {
      console.warn('Zoom not supported:', e);
    }
  };

  const toggleFlash = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newFlash = !flashOn;
    try {
      (track as any).applyConstraints({ advanced: [{ torch: newFlash }] });
      setFlashOn(newFlash);
    } catch (e) {
      console.warn('Flash not supported:', e);
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream();
        onCapture(file);
      }
    }, 'image/jpeg', 0.92);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      {error ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-white space-y-4">
            <p>{error}</p>
            <Button variant="secondary" onClick={onClose}>閉じる</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Top bar with controls */}
          <div className="bg-black/60 px-4 py-3 flex items-center justify-between z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </Button>

            <div className="flex items-center gap-2">
              {hasFlash && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFlash}
                  className="text-white hover:bg-white/20"
                >
                  {flashOn ? <Zap className="w-5 h-5 text-yellow-400" /> : <ZapOff className="w-5 h-5" />}
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleFlip}
                className="text-white hover:bg-white/20"
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Video viewfinder */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white text-sm">カメラを起動中...</p>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="bg-black/80 px-6 py-6 space-y-4">
            {/* Zoom controls */}
            {maxZoom > 1 && (
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleZoom('out')}
                  disabled={zoom <= 1}
                  className="text-white hover:bg-white/20 w-10 h-10"
                >
                  <ZoomOut className="w-5 h-5" />
                </Button>
                <span className="text-white text-sm font-mono min-w-[3rem] text-center">
                  {zoom.toFixed(1)}x
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleZoom('in')}
                  disabled={zoom >= maxZoom}
                  className="text-white hover:bg-white/20 w-10 h-10"
                >
                  <ZoomIn className="w-5 h-5" />
                </Button>
              </div>
            )}

            {/* Shutter button */}
            <div className="flex items-center justify-center">
              <button
                onClick={handleCapture}
                disabled={!ready}
                className="rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
                style={{ width: 72, height: 72 }}
              >
                <div className="rounded-full bg-white" style={{ width: 56, height: 56 }} />
              </button>
            </div>
          </div>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
};

export default InAppCamera;
