import { useStore } from '@/stores/useStore';

/**
 * Routes a narration clip through the avatar's audio graph (the same analyser
 * the TTS player feeds), so the avatar's mouth follows the recorded story.
 * Returns the disconnect function; without an analyser the clip plays as is.
 */
export function connectNarrationToAvatar(audio: HTMLAudioElement): () => void {
  const analyser = useStore.getState().audioAnalyser;
  const context = analyser?.context as AudioContext | undefined;
  if (!analyser || !context || typeof context.createMediaElementSource !== 'function') return () => undefined;
  let source: MediaElementAudioSourceNode;
  try {
    source = context.createMediaElementSource(audio);
    source.connect(analyser);
  } catch {
    return () => undefined;
  }
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return () => {
    try {
      source.disconnect();
    } catch {
      // Already disconnected with its context.
    }
  };
}
