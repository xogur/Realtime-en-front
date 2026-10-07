// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuidedApiError, saveGuidedProfile, sendGuidedCommand } from './api';
import { guidedFixture } from './fixtures';

describe('guided REST commands', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends current revision and a command id once, preserving server conflict state', async () => {
    const current = guidedFixture(); const latest = guidedFixture({ revision: 9 });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ detail: { code: 'REVISION_CONFLICT', snapshot: latest } }), { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    const error = await sendGuidedCommand(current, 'SELECT_CHOICE', { nodeId: 'r1', choiceId: 'tea' }).catch(e => e);
    expect(error).toBeInstanceOf(GuidedApiError);
    expect(error.snapshot.revision).toBe(9);
    expect(fetch).toHaveBeenCalledOnce();
    const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('/mission-learning/v2/sessions/guided-one/commands');
    expect(JSON.parse(call[1].body as string)).toMatchObject({ expectedRevision: 2, clientCommandId: expect.any(String), payload: { nodeId: 'r1', choiceId: 'tea' } });
    expect(call[1].cache).toBe('no-store');
  });
  it('writes a level-only profile without an age or role assertion', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetch);
    await saveGuidedProfile('beginner', 0);
    const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].method).toBe('PUT');
    expect(Object.keys(JSON.parse(call[1].body as string)).sort()).toEqual(['clientCommandId', 'expectedRevision', 'level']);
  });
});
