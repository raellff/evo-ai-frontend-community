import type { CSSProperties } from 'react';
import { useDarkMode } from '../hooks/useDarkMode';
import logoDark from '../assets/CRMUX.svg';
import logoLight from '../assets/CRMUX_light.svg';

interface AppLogoProps {
  className?: string;
  alt?: string;
  style?: CSSProperties;
  forceTheme?: 'dark' | 'light';
}

export function AppLogo({ className, alt = 'CrmUX', style, forceTheme }: AppLogoProps) {
  const { theme } = useDarkMode();
  const effectiveTheme = forceTheme ?? theme;
  const src = effectiveTheme === 'dark' ? logoDark : logoLight;

  return <img src={src} alt={alt} className={className} style={style} />;
}
