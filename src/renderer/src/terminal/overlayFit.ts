import { FitAddon, type ITerminalDimensions } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

// The private xterm-core path we read to size the grid — the exact same path
// xterm's own FitAddon uses internally. Cast through this rather than `any` so
// the shape is documented and any drift surfaces as a type error here.
interface TerminalWithCore extends Terminal {
  _core: {
    _renderService: {
      dimensions: { css: { cell: { width: number; height: number } } };
    };
  };
}

/**
 * Drop-in FitAddon that reserves ZERO width for the scrollbar.
 *
 * xterm v6's stock FitAddon always subtracts a scrollbar lane
 * (`overviewRuler?.width || 14` px) from every fit whenever scrollback is
 * enabled, and there is no public option to turn that off. We render xterm's
 * v6 VS Code-style scrollbar as a thin, auto-hiding OVERLAY (see
 * TerminalView.module.css), so the terminal should fill the full pane width and
 * let the scrollbar float over the last column. Reserving zero also means no
 * empty lane shows on the right behind full-screen TUIs (e.g. opencode) that
 * draw their own scrollbar.
 *
 * proposeDimensions mirrors v6's FitAddon verbatim except for the dropped
 * scrollbar reserve; the inherited fit() calls it and resizes as usual.
 */
export class OverlayFitAddon extends FitAddon {
  proposeDimensions(): ITerminalDimensions | undefined {
    const term = (this as unknown as { _terminal?: TerminalWithCore })._terminal;
    if (!term?.element?.parentElement) return undefined;

    const cell = term._core._renderService.dimensions.css.cell;
    if (cell.width === 0 || cell.height === 0) return undefined;

    const parentStyle = window.getComputedStyle(term.element.parentElement);
    const parentHeight = parseInt(parentStyle.getPropertyValue('height'), 10);
    const parentWidth = Math.max(0, parseInt(parentStyle.getPropertyValue('width'), 10));

    const elemStyle = window.getComputedStyle(term.element);
    const availableHeight =
      parentHeight -
      (parseInt(elemStyle.getPropertyValue('padding-top'), 10) +
        parseInt(elemStyle.getPropertyValue('padding-bottom'), 10));
    // No scrollbar reserve here (the one line that differs from stock FitAddon)
    // — the overlay scrollbar floats over content instead of claiming a lane.
    const availableWidth =
      parentWidth -
      (parseInt(elemStyle.getPropertyValue('padding-right'), 10) +
        parseInt(elemStyle.getPropertyValue('padding-left'), 10));

    return {
      cols: Math.max(2, Math.floor(availableWidth / cell.width)),
      rows: Math.max(1, Math.floor(availableHeight / cell.height)),
    };
  }
}
