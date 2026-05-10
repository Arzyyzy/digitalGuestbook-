import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Heart {
  id: number;
  x: number;
  delay: number;
  scale: number;
}

interface HeartAnimationProps {
  trigger: boolean;
  onComplete?: () => void;
  color?: string;
}

export function HeartAnimation({ trigger, onComplete, color = '#D4AF37' }: HeartAnimationProps) {
  const [hearts, setHearts] = useState<Heart[]>([]);

  useEffect(() => {
    if (!trigger) return;

    const newHearts: Heart[] = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: 5 + Math.random() * 90,
      delay: Math.random() * 0.5,
      scale: 0.6 + Math.random() * 1.2,
    }));

    setHearts(newHearts);

    const timer = setTimeout(() => {
      setHearts([]);
      onComplete?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, [trigger, onComplete]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      <AnimatePresence>
        {hearts.map(heart => (
          <motion.div
            key={heart.id}
            initial={{ y: '100vh', opacity: 1, x: 0, scale: 0 }}
            animate={{
              y: '-20vh',
              opacity: [1, 1, 0],
              x: [0, Math.random() * 40 - 20, Math.random() * 60 - 30],
              scale: [0, heart.scale, heart.scale * 0.8],
            }}
            transition={{
              duration: 2 + Math.random() * 0.5,
              delay: heart.delay,
              ease: 'easeOut',
            }}
            style={{
              position: 'absolute',
              left: `${heart.x}%`,
              bottom: 0,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
            >
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill={color}
              />
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
