import { useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';

interface MessagePreviewProps {
  imageData: string;
  onComplete: () => void;
}

export function MessagePreview({ imageData, onComplete }: MessagePreviewProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl space-y-6"
      >
        <div className="flex items-center justify-center gap-3 text-green-600">
          <CheckCircle2 className="w-12 h-12" />
          <h2 className="text-3xl font-bold">Terima Kasih!</h2>
        </div>

        <p className="text-center text-gray-600 text-lg">
          Ucapan Anda telah tersimpan
        </p>

        <div className="bg-gray-50 rounded-xl p-4">
          <img
            src={imageData}
            alt="Your message"
            className="w-full h-64 object-contain"
          />
        </div>

        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 3, ease: 'linear' }}
            className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F4D03F]"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
