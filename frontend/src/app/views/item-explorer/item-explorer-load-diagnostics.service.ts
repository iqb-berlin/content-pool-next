import { Injectable } from '@angular/core';

export type ItemExplorerLoadPhase =
  | 'item-list'
  | 'item-selection-total'
  | 'unit-view'
  | 'response-state'
  | 'player-html'
  | 'definition'
  | 'player-ready';

export interface ItemExplorerTimingToken {
  phase: ItemExplorerLoadPhase;
  id: number;
  startedAt: number;
  startMark: string;
}

@Injectable()
export class ItemExplorerLoadDiagnostics {
  private sequence = 0;
  private readonly flagKey = 'cp.itemExplorer.performance';

  start(phase: ItemExplorerLoadPhase): ItemExplorerTimingToken {
    const id = ++this.sequence;
    const startMark = `item-explorer:${phase}:${id}:start`;
    const startedAt = performance.now();
    performance.mark(startMark);
    return { phase, id, startedAt, startMark };
  }

  finish(
    token: ItemExplorerTimingToken | null | undefined,
    detail: Record<string, unknown> = {},
  ): number {
    if (!token) return 0;

    const endMark = `item-explorer:${token.phase}:${token.id}:end`;
    const measureName = `item-explorer:${token.phase}`;
    performance.mark(endMark);
    performance.measure(measureName, token.startMark, endMark);
    const durationMs = performance.now() - token.startedAt;
    performance.clearMarks(token.startMark);
    performance.clearMarks(endMark);

    if (this.isEnabled()) {
      console.debug('[ItemExplorer performance]', {
        phase: token.phase,
        durationMs: Math.round(durationMs * 10) / 10,
        ...detail,
      });
    }
    return durationMs;
  }

  private isEnabled(): boolean {
    try {
      return localStorage.getItem(this.flagKey) === '1';
    } catch {
      return false;
    }
  }
}
