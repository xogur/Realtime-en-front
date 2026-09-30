// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ButtonClickSound } from './ButtonClickSound';

const start = vi.fn();
const close = vi.fn(async () => undefined);
const resume = vi.fn(async () => undefined);
class FakeContext {
  state = 'running';
  currentTime = 1;
  destination = {};
  close = close;
  resume = resume;
  createDynamicsCompressor() {
    return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
      attack: { value: 0 }, release: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  }
  createOscillator() {
    return { frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn() };
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(), disconnect: vi.fn() };
  }
}

describe('ButtonClickSound', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('AudioContext', FakeContext); });
  afterEach(() => vi.unstubAllGlobals());

  it('plays once for a nested button icon without blocking the action', () => {
    const action = vi.fn();
    render(<><ButtonClickSound /><button onClick={action}><span>선택</span></button></>);
    fireEvent.click(screen.getByText('선택'));
    expect(start).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
  });

  it('ignores disabled and non-button targets', () => {
    render(<><ButtonClickSound /><button disabled>비활성</button><div role="button" aria-disabled="true">잠김</div><p>본문</p></>);
    for (const text of ['비활성', '잠김', '본문']) fireEvent.click(screen.getByText(text));
    expect(start).not.toHaveBeenCalled();
  });

  it('covers role buttons and keyboard-generated clicks', () => {
    render(<><ButtonClickSound /><div role="button">확정</div></>);
    fireEvent.click(screen.getByRole('button'), { detail: 0 });
    expect(start).toHaveBeenCalledOnce();
  });

  it('resumes suspended audio and closes it on unmount', async () => {
    vi.stubGlobal('AudioContext', class extends FakeContext {
      state = 'suspended';
      resume = async () => { resume(); this.state = 'running'; };
    });
    const view = render(<><ButtonClickSound /><button>선택</button></>);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(resume).toHaveBeenCalledOnce();
    view.unmount();
    expect(close).toHaveBeenCalledOnce();
  });

  it('still allows actions when browser audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    const action = vi.fn();
    render(<><ButtonClickSound /><button onClick={action}>선택</button></>);
    fireEvent.click(screen.getByRole('button'));
    expect(action).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });
});
