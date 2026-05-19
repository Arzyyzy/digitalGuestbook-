import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGuestbook } from '../contexts/GuestbookContext';
import { EnhancedCanvas, EnhancedCanvasHandle } from '../components/EnhancedCanvas';
import { HeartAnimation } from '../components/HeartAnimation';
import { useIdleTimeout } from '../hooks/useIdleTimeout';

function GoldParticle({ style }: { style: CSSProperties }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: 3,
        height: 3,
        background: 'rgba(201,168,76,0.6)',
        ...style,
      }}
      animate={{
        y: [0, -30, 0],
        opacity: [0.2, 0.8, 0.2],
        scale: [1, 1.5, 1],
      }}
      transition={{
        duration: 3 + Math.random() * 2,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: Math.random() * 3,
      }}
    />
  );
}

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  style: {
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 30}%`,
  },
}));

export function DisplayPage() {
  const { settings, settingsLoading, addMessage } = useGuestbook();
  const canvasRef = useRef<EnhancedCanvasHandle>(null);

  const [showHearts, setShowHearts] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Frame and canvas positioning refs
  const frameImgRef = useRef<HTMLImageElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Canvas position state — computed from frame's rendered rect
  const [canvasStyle, setCanvasStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    overflow: 'hidden',
  });

  // ── Compute canvas position from the frame's rendered image content ─────
  //
  // The frame uses object-fit:cover to fill the full viewport. We calculate
  // the actual image scale and crop offsets from the original natural
  // dimensions so the canvas slot aligns pixel-perfectly with the frame hole.
  const updateCanvasPosition = useCallback(() => {
    if (!frameImgRef.current || !canvasContainerRef.current) {
      // No frame: canvas fills full container
      setCanvasStyle({
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      });
      return;
    }

    const img = frameImgRef.current;
    const container = canvasContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    // img rect relative to container
    const imgTop    = imgRect.top    - containerRect.top;
    const imgLeft   = imgRect.left   - containerRect.left;
    const imgWidth  = imgRect.width;
    const imgHeight = imgRect.height;

    const naturalWidth = settings.frameWidth || img.naturalWidth || imgWidth || 1;
    const naturalHeight = settings.frameHeight || img.naturalHeight || imgHeight || 1;
    const scale = Math.min(imgWidth / naturalWidth, imgHeight / naturalHeight);
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const offsetX = (imgWidth - renderedWidth) / 2;
    const offsetY = (imgHeight - renderedHeight) / 2;

    const hasCustomSlot = settings.frameSlotWidth > 0 && settings.frameSlotHeight > 0;
    const slotX = hasCustomSlot ? settings.frameSlotX : 0.107;
    const slotY = hasCustomSlot ? settings.frameSlotY : 0.259;
    const slotWidth = hasCustomSlot ? settings.frameSlotWidth : 0.795;
    const slotHeight = hasCustomSlot ? settings.frameSlotHeight : 0.547;

    const width = Math.min(renderedWidth * slotWidth, containerRect.width);
    const height = Math.min(renderedHeight * slotHeight, containerRect.height);
    const top = Math.min(Math.max(imgTop + offsetY + renderedHeight * slotY, 0), Math.max(0, containerRect.height - height));
    const left = Math.min(Math.max(imgLeft + offsetX + renderedWidth * slotX, 0), Math.max(0, containerRect.width - width));

    setCanvasStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`,
      zIndex: 10,
      overflow: 'hidden',
    });
  }, [settings.frameWidth, settings.frameHeight, settings.frameSlotX, settings.frameSlotY, settings.frameSlotWidth, settings.frameSlotHeight]);

  useEffect(() => {
    updateCanvasPosition();
    const ro = new ResizeObserver(updateCanvasPosition);
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current);
    window.addEventListener('resize', updateCanvasPosition);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateCanvasPosition);
    };
  }, [updateCanvasPosition, settings.frameUrl]);

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white">
        <p className="text-sm text-white/80">Memuat pengaturan event…</p>
      </div>
    );
  }

  const startCountdown = useCallback(() => {
    if (!hasDrawing) return;
    let count = 15;
    setIdleCountdown(count);
    intervalRef.current = setInterval(async () => {
      count--;
      setIdleCountdown(count);
      if (count <= 0) {
        clearInterval(intervalRef.current!);
        setIdleCountdown(null);
        try {
          const imageData = canvasRef.current?.getImageData();
          if (imageData && !canvasRef.current?.isEmpty()) {
            await addMessage(imageData);
            setShowHearts(true);
            setShowSuccess(true);
            setHasDrawing(false);
            canvasRef.current?.reset();
            setTimeout(() => setShowSuccess(false), 3000);
          } else {
            canvasRef.current?.reset();
            setHasDrawing(false);
          }
        } catch (err) {
          console.error('Failed to auto-submit message:', err);
          canvasRef.current?.reset();
          setHasDrawing(false);
        }
      }
    }, 1000);
  }, [hasDrawing, addMessage]);

  const cancelCountdown = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearTimeout(countdownRef.current);
    setIdleCountdown(null);
  }, []);

  const handleSubmit = useCallback(async (imageData: string) => {
    try {
      cancelCountdown();
      await addMessage(imageData);
      setShowHearts(true);
      setShowSuccess(true);
      setHasDrawing(false);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to submit message:', err);
    }
  }, [addMessage, cancelCountdown]);

  // Idle timeout — if drawing, start countdown; if empty, just reset
  useIdleTimeout({
    timeout: 20000,
    onIdle: () => {
      if (hasDrawing) {
        startCountdown();
      }
    },
    enabled: !settings.isEnded,
  });

  // Cancel countdown on any interaction
  useEffect(() => {
    const cancelIfNeeded = () => {
      if (idleCountdown !== null) cancelCountdown();
    };
    window.addEventListener('touchstart', cancelIfNeeded, { passive: true });
    window.addEventListener('mousedown', cancelIfNeeded, { passive: true });
    return () => {
      window.removeEventListener('touchstart', cancelIfNeeded);
      window.removeEventListener('mousedown', cancelIfNeeded);
    };
  }, [idleCountdown, cancelCountdown]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);

  const isWedding = settings.eventType === 'wedding';

  return (
    <div
      className="overflow-hidden relative flex flex-col"
      style={{
        minHeight: '100svh',
        height: '100svh',
        minWidth: '100vw',
        background: 'linear-gradient(160deg, #0a0a0f 0%, #110c1f 40%, #0f0c14 70%, #0a0a0f 100%)',
      }}
    >
      {/* CSS for layering: canvas (1) → frame (2) → fixed tools (10002) */}
      <style>{`
        /* Boost z-index of already-fixed elements (toolbar) */
        .fixed {
          z-index: 10002 !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      
      {/* Connection Status Badge (top right) */}
      <div 
        className="fixed top-4 right-4 z-10001 flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.3)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div 
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#10b981',
            animation: 'pulse 2s infinite',
          }}
        />
        <span className="text-xs font-medium text-emerald-300">Live</span>
      </div>
      {/* ═══ ZONE 1: TOP 30vh — Reserved for Xibo slideshow / Recent messages ═══ */}
      <div
        className="relative overflow-hidden flex-shrink-0"
        style={{ height: '30vh' }}
      >
        {/* Ambient particles */}
        {PARTICLES.map(p => (
          <GoldParticle key={p.id} style={p.style} />
        ))}

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(201,168,76,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.03) 1px,transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Gold ornament line */}
          <div className="flex items-center gap-4 mb-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#C9A84C]" />
            <div
              className="w-2 h-2 rotate-45"
              style={{ background: '#C9A84C' }}
            />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#C9A84C]" />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            style={{
              fontFamily: isWedding ? "'Great Vibes', cursive" : "'Playfair Display', serif",
              fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
              color: '#F0D888',
              textShadow: '0 2px 30px rgba(201,168,76,0.4), 0 0 80px rgba(201,168,76,0.15)',
              lineHeight: 1.2,
            }}
          >
            {settings.name}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="mt-2 text-sm font-serif tracking-widest uppercase"
            style={{ color: 'rgba(201,168,76,0.6)', letterSpacing: '0.25em' }}
          >
            {settings.subtitle}
          </motion.p>

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0a0a0f]" />
        </div>
      </div>

      {/* ═══ ZONE 2: CANVAS AREA — Drawing interface ═══ */}
      <div
        className="flex-1 relative flex flex-col items-center justify-center px-6"
        style={{ minHeight: 0 }}
      >
        {/* Canvas glow backdrop */}
        <div
          className="absolute inset-6 rounded-3xl"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative w-full min-h-[55svh]" ref={canvasContainerRef}>
          {/* Canvas — positioned precisely inside frame hole */}
          <div style={canvasStyle} data-display-canvas="">
            <EnhancedCanvas
              ref={canvasRef}
              theme={settings.eventType}
              frameUrl={settings.frameUrl}
              onSubmit={handleSubmit}
              isEnded={settings.isEnded}
              variant="display"
              onDrawStart={() => {
                cancelCountdown();
                setHasDrawing(true);
              }}
              onClear={() => {
                cancelCountdown();
                setHasDrawing(false);
              }}
            />
          </div>

          {/* Frame overlay — z-20, object-fit:cover so the frame fills the container.
              pointer-events:none so canvas remains fully usable.
              onLoad triggers canvas repositioning based on actual rendered rect. */}
          {settings.frameUrl && (
            <img
              ref={frameImgRef}
              src={settings.frameUrl}
              alt="Frame overlay"
              onLoad={updateCanvasPosition}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                zIndex: 20,
                pointerEvents: 'none',
                display: 'block',
              }}
            />
          )}
        </div>

        {/* Countdown overlay */}
        <AnimatePresence>
          {idleCountdown !== null && idleCountdown > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-end justify-center pb-12 pointer-events-none"
            >
              <div
                className="flex items-center gap-3 px-6 py-3 rounded-full"
                style={{
                  background: 'rgba(10,10,20,0.8)',
                  border: '1px solid rgba(201,168,76,0.4)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: 'linear-gradient(135deg,#C9A84C,#F0D080)',
                    color: '#1a0e00',
                  }}
                >
                  {idleCountdown}
                </div>
                <span className="text-sm" style={{ color: 'rgba(240,216,136,0.8)' }}>
                  Pesan akan dikirim otomatis…
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Event ended overlay */}
      <AnimatePresence>
        {settings.isEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(5,3,10,0.92)', backdropFilter: 'blur(10px)' }}
          >
            <div className="text-center space-y-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-6xl"
              >
                🎊
              </motion.div>
              <h2
                className="font-serif"
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 'clamp(1.8rem, 5vw, 3rem)',
                  color: '#F0D888',
                  textShadow: '0 0 30px rgba(201,168,76,0.4)',
                }}
              >
                Acara Telah Selesai
              </h2>
              <p className="text-sm" style={{ color: 'rgba(201,168,76,0.6)', letterSpacing: '0.15em' }}>
                Terima kasih atas partisipasi semua tamu
              </p>
              <div className="flex items-center justify-center gap-4 mt-4">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-[rgba(201,168,76,0.5)]" />
                <div className="w-1.5 h-1.5 rounded-full bg-[rgba(201,168,76,0.6)]" />
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-[rgba(201,168,76,0.5)]" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          >
            <div
              className="px-12 py-8 rounded-3xl text-center space-y-3"
              style={{
                background: 'rgba(10,8,20,0.9)',
                border: '1px solid rgba(201,168,76,0.4)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 0 60px rgba(201,168,76,0.15)',
              }}
            >
              <div className="text-5xl">✨</div>
              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '1.6rem',
                  color: '#F0D888',
                }}
              >
                Terima Kasih
              </p>
              <p style={{ color: 'rgba(201,168,76,0.6)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
                Ucapan Anda telah tersimpan
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <HeartAnimation trigger={showHearts} onComplete={() => setShowHearts(false)} color="#C9A84C" />
    </div>
  );
}