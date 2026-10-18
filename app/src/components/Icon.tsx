import type { CSSProperties } from 'react';

interface IconProps {
  path: string;
  size?: number;
  strokeWidth?: number;
  fill?: 'none' | 'currentColor';
  style?: CSSProperties;
}

export function Icon({ path, size = 18, strokeWidth = 1.6, fill = 'none', style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d={path} />
    </svg>
  );
}
