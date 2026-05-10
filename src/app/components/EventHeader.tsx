import { Heart } from 'lucide-react';

interface EventHeaderProps {
  theme: 'wedding' | 'graduation' | 'corporate';
}

export function EventHeader({ theme }: EventHeaderProps) {
  const configs = {
    wedding: {
      title: 'Intan & Ari',
      subtitle: '16 Mei 2026',
      venue: 'Masjid Raya KH. Hasyim Asy\'ari',
      icon: <Heart className="w-8 h-8 text-[#D4AF37]" fill="#D4AF37" />,
      decoration: (
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 200 100">
            <path
              d="M10 50 Q 30 20, 50 50 T 90 50"
              stroke="#D4AF37"
              strokeWidth="2"
              fill="none"
              opacity="0.3"
            />
            <path
              d="M110 50 Q 130 20, 150 50 T 190 50"
              stroke="#D4AF37"
              strokeWidth="2"
              fill="none"
              opacity="0.3"
            />
          </svg>
        </div>
      )
    },
    graduation: {
      title: 'Wisuda',
      subtitle: 'Angkatan 2026',
      venue: 'Universitas Indonesia',
      icon: (
        <div className="w-8 h-8 text-blue-900">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
          </svg>
        </div>
      ),
      decoration: null
    },
    corporate: {
      title: 'Corporate Event',
      subtitle: '2026',
      venue: 'Grand Ballroom',
      icon: (
        <div className="w-8 h-8 text-gray-800">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
          </svg>
        </div>
      ),
      decoration: null
    }
  };

  const config = configs[theme];

  return (
    <div className="relative text-center py-12 space-y-4">
      {config.decoration}

      <div className="relative z-10">
        <div className="flex justify-center mb-4">
          {config.icon}
        </div>

        <h1
          className="text-6xl mb-3 text-[#2C1810]"
          style={{
            fontFamily: theme === 'wedding' ? "'Great Vibes', cursive" : "'Playfair Display', serif",
            textShadow: '0 2px 8px rgba(212, 175, 55, 0.2)'
          }}
        >
          {config.title}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#D4AF37]"></div>
          <p className="text-xl text-gray-600 font-serif">{config.subtitle}</p>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#D4AF37]"></div>
        </div>

        <p className="text-base text-gray-500 font-serif">{config.venue}</p>
      </div>

      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-1 h-12 bg-gradient-to-b from-[#D4AF37] to-transparent opacity-30"></div>
    </div>
  );
}
