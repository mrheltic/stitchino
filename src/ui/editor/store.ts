import { create } from 'zustand';
import type { CellRect } from '../../core/model/document.ts';
import type { Clip, Symmetry } from '../../core/model/ops.ts';
import type { ViewMode } from '../../render/chartRenderer.ts';

export type ToolId =
  | 'pan'
  | 'pencil'
  | 'half'
  | 'quarter'
  | 'threeQuarter'
  | 'backstitch'
  | 'knot'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'select'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'cleanup';

export interface Floating {
  clip: Clip;
  x: number;
  y: number;
}

export interface EditorState {
  tool: ToolId;
  activeId: number | null;
  halfDirection: 'slash' | 'backslash';
  shapeFilled: boolean;
  eraserTarget: 'stitches' | 'backstitch';
  /** Backstitch and knots snap to cell centres too, not only to holes. */
  halfSnap: boolean;
  symmetry: Symmetry;
  mode: ViewMode;
  grid: boolean;
  rulers: boolean;
  highlightId: number | null;
  hidden: Set<number>;
  showIsolated: boolean;
  selection: CellRect | null;
  /** Cells selected inside `selection` (lasso or same-colour selection); null = the whole rectangle. */
  selectionMask: Uint8Array | null;
  selectMode: 'rect' | 'lasso' | 'wand';
  minimap: boolean;
  clipboard: Clip | null;
  floating: Floating | null;
}

export interface EditorActions {
  set: (patch: Partial<EditorState>) => void;
  toggleHidden: (id: number) => void;
}

export const INITIAL_EDITOR: EditorState = {
  tool: 'pencil',
  activeId: null,
  halfDirection: 'slash',
  shapeFilled: false,
  eraserTarget: 'stitches',
  halfSnap: false,
  symmetry: 'none',
  mode: 'colorSymbols',
  grid: true,
  rulers: true,
  highlightId: null,
  hidden: new Set(),
  showIsolated: false,
  selection: null,
  selectionMask: null,
  selectMode: 'rect',
  minimap: true,
  clipboard: null,
  floating: null,
};

export const useEditor = create<EditorState & EditorActions>()((set) => ({
  ...INITIAL_EDITOR,
  set: (patch) => set(patch),
  toggleHidden: (id) =>
    set((s) => {
      const hidden = new Set(s.hidden);
      if (hidden.has(id)) hidden.delete(id);
      else hidden.add(id);
      return { hidden };
    }),
}));
