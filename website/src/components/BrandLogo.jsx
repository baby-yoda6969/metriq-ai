import { useTheme } from '../lib/ThemeContext.jsx';

export function BrandLogo({ mode, mark = false, className = '' }) {
  const theme = useTheme();
  const appearance = mode || theme.mode;
  return <img src={`/brand/${mark ? 'mark' : 'logo'}-${appearance}.png`}
    alt={mark ? '' : 'metriq ai'} className={`object-contain ${className}`} />;
}
