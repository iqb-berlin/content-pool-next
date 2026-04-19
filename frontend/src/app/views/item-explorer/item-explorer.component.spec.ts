import { describe, it, expect } from 'vitest';
import { ItemExplorerComponent } from './item-explorer.component';

function createComponent(): ItemExplorerComponent {
  const route = { snapshot: { paramMap: { get: () => 'acp-1' } } };
  const router = { navigate: () => Promise.resolve(true) };
  const api = {};
  const sanitizer = { bypassSecurityTrustHtml: (html: string) => html };
  const voudService = {};
  const authService = {};

  return new ItemExplorerComponent(
    route as any,
    router as any,
    api as any,
    sanitizer as any,
    voudService as any,
    authService as any,
  );
}

describe('ItemExplorerComponent', () => {
  it('shows audio/video coding variables by default', () => {
    const component = createComponent();
    component.currentCodingSchemeAsText = [
      { id: 'AUDIO_VAR', label: 'Audio prompt', codes: [] },
      { id: 'TEXT_VAR', label: 'Text prompt', codes: [] },
      { id: 'VIDEO_VAR', label: 'Video prompt', codes: [] },
    ] as any;

    const ids = component.filteredCodingSchemeAsText.map((coding) => coding.id);

    expect(ids).toEqual(['AUDIO_VAR', 'TEXT_VAR', 'VIDEO_VAR']);
  });

  it('hides audio/video coding variables when disabled', () => {
    const component = createComponent();
    component.showAudioVideoCodingVariables = false;
    component.currentCodingSchemeAsText = [
      { id: 'AUDIO_VAR', label: 'Prompt', codes: [] },
      { id: 'TEXT_VAR', label: 'Text prompt', codes: [] },
      { id: 'VAR_01', label: 'Video answer', codes: [] },
      { id: 'VAR_02', label: 'Other', codes: [] },
    ] as any;

    const ids = component.filteredCodingSchemeAsText.map((coding) => coding.id);

    expect(ids).toEqual(['TEXT_VAR', 'VAR_02']);
  });
});
