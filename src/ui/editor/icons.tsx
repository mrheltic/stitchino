import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

const frame = (
  <rect x="3" y="3" width="18" height="18" rx="2" strokeOpacity={0.35} strokeWidth={1.5} />
);

export function FullStitchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {frame}
      <path d="M6 6l12 12M18 6L6 18" strokeWidth={2.5} />
    </Svg>
  );
}

export function HalfStitchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {frame}
      <path d="M6 18L18 6" strokeWidth={2.5} />
    </Svg>
  );
}

export function QuarterStitchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {frame}
      <path d="M6 6l6 6" strokeWidth={2.5} />
    </Svg>
  );
}

export function ThreeQuarterStitchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      {frame}
      <path d="M6 18L18 6M6 6l6 6" strokeWidth={2.5} />
    </Svg>
  );
}

export function BackstitchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 18l5-6 5 3 6-9" strokeWidth={2.5} />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="14" cy="15" r="1.2" fill="currentColor" />
      <circle cx="20" cy="6" r="1.2" fill="currentColor" />
    </Svg>
  );
}

export function KnotIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <circle cx="12" cy="12" r="8.5" strokeOpacity={0.35} strokeWidth={1.5} />
    </Svg>
  );
}
