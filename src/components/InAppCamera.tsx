import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InAppCameraProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const InAppCamera = ({ onCapture, onClose }: InAppCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Stop existing stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error('Camera error:', err);
      setError('カメラにアクセスできません。カメラの使用を許可してください。');
    }
  }, [stream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlip = () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    startCamera(newFacing);
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
        // Stop camera
        stream?.getTracks().forEach(t => t.stop());
        onCapture(file);
      }
    }, 'image/jpeg', 0.9);
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
          {/* Video viewfinder */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          {/* Controls */}
          <div className="bg-black/80 px-6 py-8 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20 w-12 h-12"
            >
              <X className="w-6 h-6" />
            </Button>

            <button
              onClick={handleCapture}
              className="w-18 h-18 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              <div className="w-14 h-14 rounded-full bg-white" style={{ width: 56, height: 56 }} />
            </button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleFlip}
              className="text-white hover:bg-white/20 w-12 h-12"
            >
              <RotateCcw className="w-6 h-6" />
            </Button>
          </div>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
};

export default InAppCamera;
