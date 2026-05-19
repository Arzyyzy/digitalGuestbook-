/**
 * GuestbookKiosk.tsx — XHB/Xibo Signage Edition
 *
 * Layer order (flat, no nesting kompleks):
 *  z-1   Background
 *  z-2   Canvas (EnhancedCanvas fills inset:0)
 *  z-3   Floating particles (pointer-events:none)
 *  z-5   Frame PNG (pointer-events:none)
 *  z-100 Secret tap zone
 *  z-200 Idle overlay (solid rgba, NO backdrop-filter)
 *  z-201 Idle modal
 *  z-9999 Toolbar (via portal, position:fixed)
 *
 * XHB rules applied here:
 *  ✅ position:fixed + inset:0 (bukan 100vh / 100dvh)
 *  ✅ NO CSS transform/scale
 *  ✅ NO backdrop-filter
 *  ✅ NO CSS grid
 *  ✅ NO conic-gradient
 *  ✅ Solid rgba() only
 *  ✅ touch-action:none di semua elemen interaktif
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useGuestbook } from '../contexts/GuestbookContext';
import { EnhancedCanvas, EnhancedCanvasHandle } from '../components/EnhancedCanvas';
import { HeartAnimation } from '../components/HeartAnimation';
import { FloatingParticles } from '../components/FloatingParticles';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

const THEME_META = {
  wedding:    { bg: '#f5ede0', accent: '#D4AF37', heart: '#D4AF37' },
  graduation: { bg: '#eef2fb', accent: '#1e3a8a', heart: '#3b82f6' },
  corporate:  { bg: '#f1f3f6', accent: '#334155', heart: '#64748b' },
} as const;

const IDLE_TRIGGER_MS  = 30_000; // 30 detik tidak ada aktivitas
const IDLE_WARNING_SEC = 20;     // countdown 20 detik

export function GuestbookKiosk() {
  const { settings, settingsLoading, settingsError, storageError, addMessage, isOnline } = useGuestbook();
  const navigate  = useNavigate();
  const canvasRef = useRef<EnhancedCanvasHandle>(null);

  const [showHearts,    setShowHearts]    = useState(false);
  const [showThx,       setShowThx]       = useState(false);
  const [hasDrawing,    setHasDrawing]    = useState(false);
  const [warnVisible,   setWarnVisible]   = useState(false);
  const [countdown,     setCountdown]     = useState(IDLE_WARNING_SEC);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [tapCount,      setTapCount]      = useState(0);
  const [tapTimer,      setTapTimer]      = useState<ReturnType<typeof setTimeout> | null>(null);

  const idleRef      = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const warnRef      = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const meta = THEME_META[settings.eventType];

  // ── Idle timer ─────────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    if (idleRef.current)  { clearTimeout(idleRef.current);   idleRef.current  = null; }
    if (warnRef.current)  { clearTimeout(warnRef.current);   warnRef.current  = null; }
    if (countRef.current) { clearInterval(countRef.current); countRef.current = null; }
  }, []);

  const hideWarning = useCallback(() => {
    clearTimers();
    setWarnVisible(false);
    setCountdown(IDLE_WARNING_SEC);
  }, [clearTimers]);

  const showWarning = useCallback(() => {
    setWarnVisible(true);
    setCountdown(IDLE_WARNING_SEC);
    countRef.current = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
    warnRef.current  = setTimeout(() => {
      canvasRef.current?.reset();
      setHasDrawing(false);
      hideWarning();
    }, IDLE_WARNING_SEC * 1000);
  }, [hideWarning]);

  const startIdle = useCallback(() => {
    clearTimers();
    idleRef.current = setTimeout(showWarning, IDLE_TRIGGER_MS);
  }, [clearTimers, showWarning]);

  const handleActivity = useCallback(() => {
    if (!hasDrawing) return;
    if (warnVisible) hideWarning();
    startIdle();
  }, [hasDrawing, warnVisible, hideWarning, startIdle]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // ── Canvas handlers ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (imageData: string) => {
    try {
      setIsSubmitting(true);
      await addMessage(imageData);
      clearTimers();
      hideWarning();
      setHasDrawing(false);
      setShowHearts(true);
      setShowThx(true);
      setTimeout(() => setShowThx(false), 4000);
    } catch (err) {
      console.error('Failed to submit message:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [addMessage, clearTimers, hideWarning]);

  const handleDrawStart = useCallback(() => {
    setHasDrawing(true);
    hideWarning();
    startIdle();
  }, [hideWarning, startIdle]);

  const handleClear = useCallback(() => {
    setHasDrawing(false);
    hideWarning();
  }, [hideWarning]);

  // ── Secret tap ─────────────────────────────────────────────────────────────

  const handleSecretTap = () => {
    const n = tapCount + 1;
    setTapCount(n);
    if (tapTimer) clearTimeout(tapTimer);
    setTapTimer(setTimeout(() => setTapCount(0), 2500));
    if (n >= 5) { setTapCount(0); navigate('/guestbook/admin'); }
  };

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (settingsLoading) return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>
      <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>Memuat pengaturan event…</p>
    </div>
  );

  if (settingsError) return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', padding: 24 }}>
      <div style={{ maxWidth: 560, textAlign: 'center', color: '#fff' }}>
        <p style={{ fontSize: 16, color: '#ef4444', marginBottom: 8 }}>⚠️ Kesalahan Pengaturan</p>
        <p style={{ fontSize: 14, marginBottom: 12 }}>{settingsError}</p>
        <p style={{ fontSize: 12, opacity: 0.55 }}>Hubungi admin untuk memeriksa konfigurasi di admin panel.</p>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/*
        GLOBAL STYLE — injected di sini sebagai safety net
        touch-action juga diinjeksi oleh EnhancedCanvas, tapi kita pasang
        di sini juga agar berlaku sebelum canvas mount.

        PENTING: style ini TIDAK akan override style yg lebih specific di element.
      */}
      <style>{`
        html, body, #root {
          margin: 0; padding: 0; overflow: hidden;
          width: 100%; height: 100%;
          touch-action: none; -ms-touch-action: none;
        }
        *, *::before, *::after { box-sizing: border-box; }
      `}</style>

      {/* ── Storage error toast (enhanced) ─── */}
      {storageError && (
        <div style={{ position: 'fixed', top: 20, left: 20, right: 20, zIndex: 9500, pointerEvents: 'none' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', pointerEvents: 'auto' }}>
            <Alert variant="destructive">
              <AlertTitle>⚠️ Masalah Penyimpanan</AlertTitle>
              <AlertDescription>{storageError}</AlertDescription>
            </Alert>
          </div>
        </div>
      )}
      
      {/* ── Submitting loader overlay ─── */}
      {isSubmitting && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 8500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)',
          touchAction: 'none',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}>
            {/* Spinner */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#fff',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{
              color: '#fff',
              fontSize: 15,
              fontWeight: 500,
            }}>Mengunggah ucapan Anda...</p>
          </div>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/*
        ── ROOT CONTAINER ────────────────────────────────────────────────────────
        position: fixed + inset: 0  →  mengisi area Xibo region
        TIDAK pakai 100vw/100vh (fake viewport di XHB)
        TIDAK pakai transform
      */}
      <div style={{
        position:    'fixed',
        inset:       0,
        background:  meta.bg,
        overflow:    'hidden',
        touchAction: 'none',
      }}>

        {/* ── z-2: Canvas layer ─── */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, touchAction: 'none' }}>
          <EnhancedCanvas
            ref={canvasRef}
            theme={settings.eventType}
            frameUrl={settings.frameUrl}
            onSubmit={handleSubmit}
            isEnded={settings.isEnded}
            variant="kiosk"
            onDrawStart={handleDrawStart}
            onUserActivity={handleActivity}
            onClear={handleClear}
            className="w-full h-full"
          />
        </div>

        {/* ── z-3: Floating particles (decorative, pointer-events none) ─── */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
          <FloatingParticles />
        </div>

        {/* ── z-5: Frame PNG overlay — FULLSCREEN ─── */}
        {/* PENTING: tidak pakai object-fit sama sekali.
            width/height 100% + position absolute inset 0 = stretch penuh ke seluruh area.
            object-fit: cover/contain bisa bikin frame kelihatan kecil di XHB. */}
        {settings.frameUrl && (
          <img
            src={settings.frameUrl}
            alt=""
            style={{
              position:      'absolute',
              top:           0,
              left:          0,
              width:         '100%',
              height:        '100%',
              display:       'block',
              zIndex:        5,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* ── z-100: Secret tap zone (top-left 64×64) ─── */}
        <div
          onClick={handleSecretTap}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: 64, height: 64, zIndex: 100,
            opacity: 0, cursor: 'pointer', touchAction: 'none',
          }}
        />

        {/* ── z-200: Idle overlay — solid rgba, NO backdrop-filter ─── */}
        {warnVisible && (
          <div style={{
            position:   'absolute',
            inset:      0,
            zIndex:     200,
            background: 'rgba(0,0,0,0.72)',
            touchAction:'none',
          }} />
        )}

        {/* ── z-201: Idle modal ─── */}
        {warnVisible && (
          <div style={{
            position:  'absolute',
            top:       '50%',
            left:      '50%',
            transform: 'translate(-50%, -50%)',  // only transform used — centering only, no scale
            zIndex:    201,
            width:     'calc(100% - 32px)',
            maxWidth:  500,
            touchAction: 'none',
          }}>
            <div style={{
              borderRadius: 20,
              padding:      28,
              background:   '#ffffff',
              boxShadow:    '0 16px 48px rgba(0,0,0,0.3)',
            }}>
              <p style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 6px', color: '#111' }}>
                Masih ingin melanjutkan?
              </p>
              <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
                Sesi akan direset jika tidak ada aktivitas.
              </p>

              {/* Countdown */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>Otomatis reset dalam</p>
                <p style={{ fontSize: 40, fontWeight: 800, color: '#111', margin: '0 0 10px', lineHeight: 1 }}>
                  {countdown}
                  <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500, marginLeft: 4 }}>detik</span>
                </p>
                {/* Progress bar — linear only, NO conic-gradient */}
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(212,175,55,0.2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: 'linear-gradient(90deg,#D4AF37,#F4D03F)',
                    width: (countdown / IDLE_WARNING_SEC * 100) + '%',
                    transition: 'width 0.9s linear',
                  }} />
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleActivity}
                  style={{
                    flex: 1, padding: '11px 16px', borderRadius: 12,
                    fontWeight: 700, color: '#fff', fontSize: 14,
                    background: 'linear-gradient(135deg,#D4AF37,#F0D080)',
                    border: 'none', cursor: 'pointer', touchAction: 'none',
                    boxShadow: '0 3px 12px rgba(212,175,55,0.35)',
                  }}
                >
                  ✎ Lanjutkan
                </button>
                <button
                  onClick={() => { canvasRef.current?.reset(); setHasDrawing(false); hideWarning(); }}
                  style={{
                    flex: 1, padding: '11px 16px', borderRadius: 12,
                    fontWeight: 700, color: '#64748b', fontSize: 14,
                    background: 'rgba(100,116,139,0.08)',
                    border: '1.5px solid rgba(100,116,139,0.25)',
                    cursor: 'pointer', touchAction: 'none',
                  }}
                >
                  🗑 Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Heart animation (positioned fixed by HeartAnimation internally) ─── */}
      <HeartAnimation
        trigger={showHearts}
        onComplete={() => setShowHearts(false)}
        color={meta.heart}
      />

      {/* ── Thank-you modal (enhanced) ─── */}
      {showThx && (
        <div style={{
          position:   'fixed',
          inset:      0,
          zIndex:     9000,
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
          touchAction:'none',
          animation:  'fadeIn 0.3s ease-out',
        }}>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.1); }
            }
            @keyframes progress4s {
              from { width: 0% }
              to { width: 100% }
            }
          `}</style>
          
          <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafb 100%)',
            borderRadius: 28,
            padding: '48px 44px',
            textAlign: 'center',
            maxWidth: 360,
            boxShadow: '0 25px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05)',
            animation: 'slideUp 0.4s ease-out',
            border: `1px solid ${meta.accent}22`,
          }}>
            {/* Success emoji animation */}
            <div style={{
              fontSize: 56,
              marginBottom: 16,
              animation: 'pulse 0.6s ease-in-out',
            }}>✨</div>
            
            {/* Title */}
            <h2 style={{
              fontFamily: "'Playfair Display', 'Georgia', serif",
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#1f2937',
              margin: '0 0 8px',
              letterSpacing: '-0.5px',
            }}>
              Terima Kasih!
            </h2>
            
            {/* Subtitle */}
            <p style={{
              fontSize: 15,
              color: '#6b7280',
              margin: '0 0 20px',
              lineHeight: 1.5,
            }}>
              Ucapan Anda telah tersimpan dengan indah
            </p>
            
            {/* Status indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              background: isOnline ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
              borderRadius: 10,
              marginBottom: 20,
              border: `1px solid ${isOnline ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isOnline ? '#10b981' : '#f59e0b',
                animation: isOnline ? 'none' : 'pulse 2s infinite',
              }} />
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: isOnline ? '#059669' : '#92400e',
              }}>
                {isOnline ? '✓ Tersimpan ke cloud' : '⏳ Dalam antrian'}
              </span>
            </div>
            
            {/* Progress bar */}
            <div style={{
              height: 3,
              borderRadius: 2,
              background: '#e5e7eb',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                borderRadius: 2,
                background: `linear-gradient(to right, ${meta.accent}, #F4D03F)`,
                animation: 'progress4s 4s linear forwards',
              }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
