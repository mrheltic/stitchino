import type { ComponentType } from 'react';
import {
  Circle,
  Eraser,
  Hand,
  Minus,
  PaintBucket,
  Pipette,
  Sparkles,
  Square,
  SquareDashed,
  type LucideIcon,
} from 'lucide-react';
import {
  BackstitchIcon,
  FullStitchIcon,
  HalfStitchIcon,
  KnotIcon,
  QuarterStitchIcon,
  ThreeQuarterStitchIcon,
} from './icons.tsx';
import type { ToolId } from './store.ts';

type IconType = LucideIcon | ComponentType<{ size?: number }>;

export const TOOLS: { id: ToolId; icon: IconType; key: string }[] = [
  { id: 'pan', icon: Hand, key: 'H' },
  { id: 'pencil', icon: FullStitchIcon, key: 'P' },
  { id: 'half', icon: HalfStitchIcon, key: '2' },
  { id: 'quarter', icon: QuarterStitchIcon, key: '4' },
  { id: 'threeQuarter', icon: ThreeQuarterStitchIcon, key: '3' },
  { id: 'backstitch', icon: BackstitchIcon, key: 'B' },
  { id: 'knot', icon: KnotIcon, key: 'K' },
  { id: 'eraser', icon: Eraser, key: 'E' },
  { id: 'fill', icon: PaintBucket, key: 'F' },
  { id: 'picker', icon: Pipette, key: 'I' },
  { id: 'select', icon: SquareDashed, key: 'S' },
  { id: 'line', icon: Minus, key: 'L' },
  { id: 'rect', icon: Square, key: 'R' },
  { id: 'ellipse', icon: Circle, key: 'O' },
  { id: 'cleanup', icon: Sparkles, key: 'C' },
];
