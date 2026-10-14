// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LessonTalkMode } from './LessonTalkMode';

vi.mock('./control', () => ({ createLessonViewPublisher: () => ({ publish: vi.fn(), close: vi.fn() }) }));

describe('LessonTalkMode', () => {
  it('still has a live talk after a StrictMode remount on an open connection', () => {
    // Live bug: start and end went out in the same millisecond and the avatar waited forever.
    const sendLessonTalk = vi.fn<(message: Record<string, unknown>) => boolean>(() => true);
    render(
      <StrictMode>
        <LessonTalkMode kioskId="K1" isConnected sendLessonTalk={sendLessonTalk} stopAvatarSpeech={vi.fn()}
          onExit={vi.fn()} onFreeTalk={vi.fn()} />
      </StrictMode>,
    );
    const types = sendLessonTalk.mock.calls.map(([message]) => message.type);
    expect(types[types.length - 1]).toBe('lesson_talk_start');
    expect(types.filter((type) => type === 'lesson_talk_start').length).toBe(types.filter((type) => type === 'lesson_talk_end').length + 1);
  });

  it('ends the talk when the mode closes', () => {
    const sendLessonTalk = vi.fn<(message: Record<string, unknown>) => boolean>(() => true);
    const view = render(<LessonTalkMode kioskId="K1" isConnected sendLessonTalk={sendLessonTalk} stopAvatarSpeech={vi.fn()}
      onExit={vi.fn()} onFreeTalk={vi.fn()} />);
    view.unmount();
    expect(sendLessonTalk.mock.calls.map(([message]) => message.type)).toEqual(['lesson_talk_start', 'lesson_talk_end']);
  });
});
