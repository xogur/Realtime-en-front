import { describe, expect, it } from 'vitest';

import { selectPreferredVoice } from './useBrowserTts';

function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return {
    default: isDefault,
    lang,
    localService: true,
    name,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

describe('selectPreferredVoice', () => {
  it('prefers a natural Korean voice over the first installed Korean voice', () => {
    const installed = [
      voice('Basic Korean', 'ko-KR', true),
      voice('Microsoft SunHi Online (Natural)', 'ko-KR'),
      voice('English Natural', 'en-US'),
    ];

    expect(selectPreferredVoice(installed, 'ko-KR')?.name)
      .toBe('Microsoft SunHi Online (Natural)');
  });

  it('falls back to an available Korean system voice', () => {
    const installed = [
      voice('English Voice', 'en-US'),
      voice('Microsoft Heami Desktop', 'ko-KR'),
    ];

    expect(selectPreferredVoice(installed, 'ko-KR')?.name)
      .toBe('Microsoft Heami Desktop');
  });
});
