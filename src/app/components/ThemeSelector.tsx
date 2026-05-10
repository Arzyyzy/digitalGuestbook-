import { Heart, GraduationCap, Briefcase } from 'lucide-react';

interface ThemeSelectorProps {
  currentTheme: 'wedding' | 'graduation' | 'corporate';
  onThemeChange: (theme: 'wedding' | 'graduation' | 'corporate') => void;
}

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const themes = [
    { id: 'wedding' as const, name: 'Wedding', icon: Heart, color: '#D4AF37' },
    { id: 'graduation' as const, name: 'Wisuda', icon: GraduationCap, color: '#1e3a8a' },
    { id: 'corporate' as const, name: 'Corporate', icon: Briefcase, color: '#1f2937' },
  ];

  return (
    <div className="fixed top-4 right-4 z-30 flex gap-2">
      {themes.map((theme) => {
        const Icon = theme.icon;
        return (
          <button
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            className={`p-3 rounded-full shadow-lg transition-all ${
              currentTheme === theme.id
                ? 'bg-white scale-110'
                : 'bg-white/80 hover:bg-white'
            }`}
            style={{
              color: currentTheme === theme.id ? theme.color : '#6b7280',
            }}
            title={theme.name}
          >
            <Icon className="w-5 h-5" />
          </button>
        );
      })}
    </div>
  );
}
