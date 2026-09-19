export interface ItemExplorerShellDomPort {
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): boolean;
  rememberFocusBeforeOverlay(): void;
  restoreFocusAfterOverlayClose(): boolean;
}

export interface ItemExplorerTableDomPort {
  focusFilter(): void;
  focusFallback(): void;
  scrollToSelection(): void;
}

export interface ItemExplorerPlayerDomPort {
  hasFrame(): boolean;
  postMessage(message: unknown): void;
  focus(
    selectors: string[],
    textCandidates: Array<string | undefined>,
    highlight: boolean,
  ): boolean;
  setPrintLabelOverrides(overrides: Readonly<Record<string, string>>): void;
  startAutoResize(onHeightChange: (height: number) => void): void;
  stopAutoResize(): void;
}
