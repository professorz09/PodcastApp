import { DebateSegment } from '../../types';
import { RenderAssets, VisualConfig } from '../canvasRenderer';

export interface DrawContext {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  time: number;
  audioLevel: number;
  script: DebateSegment[];
  segmentOffsets: number[];
  currentSegmentIndex: number;
  totalDuration: number;
  scores: { scoreA: string; scoreB: string };
  config: VisualConfig;
  assets: RenderAssets;
  themeConfig: any; // Theme-specific config
}

export interface ThemeProperty {
  id: string;
  label: string;
  type: 'color' | 'number' | 'boolean' | 'select';
  defaultValue: any;
  group?: string;   // Optional group/section header
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  properties: ThemeProperty[];
  draw: (context: DrawContext) => void;
}
