# Correction Retry Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional correction retry flow that reuses the current microphone and STT connection, never enters the AI conversation pipeline, and awards 2 LP once per corrected turn.

**Architecture:** Add a deterministic practice matcher and per-WebSocket practice state to the FastAPI backend. The existing STT callbacks branch before normal conversation finalization while practice is active. The frontend adds practice state to Zustand, handles additive WebSocket events in `useVoiceSocket`, renders the states in `CorrectionCoachCard`, and includes the one-time reward in existing LP totals.

**Tech Stack:** Python 3.10, FastAPI WebSocket, `unittest`; Next.js, React, TypeScript, Zustand, Vitest, Testing Library.

## Global Constraints

- Reuse the existing WebSocket and STT audio stream; do not add another recorder or STT provider.
- Practice speech must not emit `final_user_request` or enter LLM history, correction, batch evaluation, mission matching, or TTS.
- Existing event payloads remain unchanged; only `practice_*` events are additive.
- A successful correction retry awards exactly 2 LP once per `sourceTurnId` in the current session.
- No LP penalty for failure, cancel, timeout, disconnect, or STT error.
- No `learnerId` persistence and no pronunciation claim in this version.
- Practice target length is 1 through 300 characters and idle timeout is 20 seconds.
- Preserve unrelated changes in both repositories.

## File Map

### Backend repository: `C:/Users/365mc/workspace/realtimechat-en/RealtimeVoiceChat`

- Create `code/correction_practice.py`: normalization, deterministic scoring, protocol-safe per-session state.
- Create `code/test_correction_practice.py`: matcher and state unit tests.
- Modify `code/server.py`: WebSocket controls, timeout lifecycle, STT callback branch.
- Create `code/test_correction_practice_server.py`: protocol and conversation-isolation tests.

### Frontend repository: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat`

- Modify `src/stores/useStore.ts`: practice UI state, completion record, deduplicated actions.
- Modify `src/stores/useStore.test.ts`: lifecycle and replay-preservation tests.
- Modify `src/lib/missionLp.ts`: add practice reward after the existing evaluation/mission calculation.
- Modify `src/lib/missionLp.test.ts`: one-time reward tests for provisional and evaluated messages.
- Modify `src/hooks/useVoiceSocket.ts`: additive practice event fields, outbound helpers, inbound state updates, disconnect cleanup.
- Modify `src/hooks/useVoiceSocket.test.ts`: protocol helper and event-shape tests.
- Modify `src/components/AssessmentPanel.tsx`: latest correction retry controls and state copy.
- Modify `src/components/AssessmentPanel.test.ts`: rendering and interaction tests.

---

### Task 1: Deterministic backend matcher and session state

**Files:**
- Create: `C:/Users/365mc/workspace/realtimechat-en/RealtimeVoiceChat/code/correction_practice.py`
- Create: `C:/Users/365mc/workspace/realtimechat-en/RealtimeVoiceChat/code/test_correction_practice.py`

**Interfaces:**
- Produces: `normalize_practice_text(text: str) -> str`
- Produces: `score_practice_attempt(target: str, transcript: str) -> PracticeScore`
- Produces: `CorrectionPracticeSession.start(source_turn_id: str, target: str, now: float | None = None) -> None`
- Produces: `CorrectionPracticeSession.cancel(source_turn_id: str | None = None) -> bool`
- Produces: `CorrectionPracticeSession.complete(transcript: str) -> dict | None`
- Produces: `CorrectionPracticeSession.is_expired(now: float | None = None) -> bool`

- [ ] **Step 1: Write matcher tests**

Add tests that require case and punctuation tolerance, contraction normalization, minor function-word tolerance, core-word rejection, the stricter three-word threshold, target validation, timeout, and one-time reward:

```python
class CorrectionPracticeMatcherTests(unittest.TestCase):
    def test_accepts_case_punctuation_and_contraction_variants(self):
        score = score_practice_attempt("I'm ready to go.", "I am ready to go")
        self.assertTrue(score.success)

    def test_rejects_attempt_missing_core_meaning(self):
        score = score_practice_attempt(
            "I went to the library yesterday.",
            "I went yesterday.",
        )
        self.assertFalse(score.success)

    def test_rewards_a_source_turn_only_once(self):
        session = CorrectionPracticeSession()
        session.start("turn-1", "I like reading books.", now=100.0)
        first = session.complete("I like reading books")
        self.assertEqual(first["rewardLp"], 2)
        with self.assertRaises(PracticeProtocolError):
            session.start("turn-1", "I like reading books.", now=101.0)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m unittest code.test_correction_practice -v`

Expected: import failure because `correction_practice.py` does not exist.

- [ ] **Step 3: Implement the pure matcher and state**

Use a frozen score type and a session-local state object:

```python
@dataclass(frozen=True)
class PracticeScore:
    score: float
    core_word_coverage: float
    success: bool

class CorrectionPracticeSession:
    TIMEOUT_SECONDS = 20.0
    REWARD_LP = 2

    def __init__(self):
        self.active: Optional[PracticeAttempt] = None
        self.rewarded_source_turn_ids: set[str] = set()
```

Normalize Unicode, lowercase, punctuation, whitespace, and common contractions. Combine `difflib.SequenceMatcher` ratio with token coverage. Require combined score `>= 0.78`, core-word coverage `>= 0.75`, and score `>= 0.90` for targets of three words or fewer. Validate `source_turn_id` and a stripped target length from 1 through 300.

- [ ] **Step 4: Run matcher tests and verify GREEN**

Run: `python -m unittest code.test_correction_practice -v`

Expected: all correction practice tests pass.

- [ ] **Step 5: Commit the backend matcher**

```powershell
git add code/correction_practice.py code/test_correction_practice.py
git commit -m "feat: add correction practice matcher"
```

### Task 2: Isolate practice speech in the backend WebSocket pipeline

**Files:**
- Modify: `C:/Users/365mc/workspace/realtimechat-en/RealtimeVoiceChat/code/server.py`
- Create: `C:/Users/365mc/workspace/realtimechat-en/RealtimeVoiceChat/code/test_correction_practice_server.py`

**Interfaces:**
- Consumes: `CorrectionPracticeSession` from Task 1.
- Produces: client events `practice_ready`, `practice_partial`, `practice_result`, `practice_timeout`, `practice_cancelled`, `practice_error`.
- Produces: `TranscriptionCallbacks.start_correction_practice(source_turn_id: str, target: str) -> None`.
- Produces: `TranscriptionCallbacks.cancel_correction_practice(source_turn_id: str | None = None, reason: str = "cancelled") -> bool`.

- [ ] **Step 1: Write protocol and isolation tests**

Build callbacks with fake pipeline, transcriber, loop, and queue. Assert that `practice_start` creates state, partial text emits only `practice_partial`, and final text emits only `practice_result`. The isolation assertion must verify these call counts remain zero:

```python
self.assertEqual(fake_pipeline.finalize_calls, [])
self.assertEqual(fake_callbacks.correction_calls, [])
self.assertEqual(fake_callbacks.evaluation_calls, [])
self.assertFalse(any(event["type"] == "final_user_request" for event in emitted))
```

Also test invalid target, duplicate success, explicit cancel, 20-second timeout, and normal `on_before_final` behavior when practice is inactive.

- [ ] **Step 2: Run server tests and verify RED**

Run: `python -m unittest code.test_correction_practice_server -v`

Expected: missing practice methods and event handling.

- [ ] **Step 3: Add per-session state and WebSocket controls**

Initialize the state in `ClientSession.__init__`:

```python
self.correction_practice = CorrectionPracticeSession()
```

Handle additive controls in `process_incoming_data`:

```python
elif msg_type == "practice_start":
    callbacks.start_correction_practice(
        data.get("sourceTurnId"),
        data.get("target"),
    )
elif msg_type == "practice_cancel":
    callbacks.cancel_correction_practice(
        data.get("sourceTurnId"),
        reason="cancelled",
    )
```

Convert `PracticeProtocolError` to `practice_error` without closing the socket. Schedule timeout using `loop.call_later(20, ...)`; cancel that handle on result, cancel, reset, and shutdown.

- [ ] **Step 4: Branch STT callbacks before conversation logic**

At the start of `_legacy_on_partial`, if practice is active, emit `practice_partial` and return before interruption handling. At the start of `on_before_final`, consume the normalized transcript, emit `practice_result`, mark this audio utterance handled, clear only transcription flags, and return before `pipeline.finalize_user_turn_and_prepare`.

The result payload must contain exactly:

```python
{
    "type": "practice_result",
    "sourceTurnId": result["sourceTurnId"],
    "transcript": result["transcript"],
    "score": result["score"],
    "success": result["success"],
    "rewardLp": result["rewardLp"],
}
```

- [ ] **Step 5: Run backend feature and regression tests**

Run:

```powershell
python -m unittest code.test_correction_practice code.test_correction_practice_server -v
python -m unittest discover -s code -p 'test_*.py'
```

Expected: feature tests pass and the existing backend suite has no new failures.

- [ ] **Step 6: Commit backend protocol isolation**

```powershell
git add code/server.py code/test_correction_practice_server.py
git commit -m "feat: isolate correction retry speech"
```

### Task 3: Add frontend practice state and one-time LP

**Files:**
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/stores/useStore.ts`
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/stores/useStore.test.ts`
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/lib/missionLp.ts`
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/lib/missionLp.test.ts`

**Interfaces:**
- Produces: `CorrectionPracticeState` with status `idle | listening | checking | success | retry | error`.
- Produces: `CorrectionPracticeCompletion` stored on `ChatMessage.correctionPracticeCompletion`.
- Produces store actions: `beginCorrectionPractice`, `setCorrectionPracticePartial`, `resolveCorrectionPractice`, `failCorrectionPractice`, `cancelCorrectionPractice`.
- Updates: `getCurrentMessageLp(message)` includes completion LP exactly once.

- [ ] **Step 1: Write failing store lifecycle tests**

Test transitions from idle to listening, partial transcript, successful result, retry result, cancel, disconnect error, and completion deduplication. Verify `resolveCorrectionPractice` does not append to `messages` and applies the completion only to the matching user message.

- [ ] **Step 2: Write failing LP tests**

Add one evaluated and one provisional message with:

```ts
correctionPracticeCompletion: {
    sourceTurnId: 'turn-1',
    transcript: 'I went to the library yesterday.',
    score: 0.94,
    rewardLp: 2,
    completedAt: '2026-07-15T00:00:00.000Z',
}
```

Assert each existing LP result increases by exactly 2 and repeated result handling cannot create another completion.

- [ ] **Step 3: Run frontend state tests and verify RED**

Run: `npm test -- src/stores/useStore.test.ts src/lib/missionLp.test.ts`

Expected: missing practice types/actions and unchanged LP totals.

- [ ] **Step 4: Implement minimal state and LP integration**

Add the completion to `ChatMessage`; keep active UI state outside `messages`. On successful resolution, replace only the matching message and refuse to overwrite an existing completion. Preserve local completion when `syncMessages` receives the same user message without that client-only field. Clear active practice on connection teardown, but keep completion records when only recording stops.

Calculate LP as:

```ts
const practiceLp = message.correctionPracticeCompletion?.rewardLp ?? 0;
return existingLp + practiceLp;
```

Apply this after low-confidence, evaluated, and provisional branch selection so all paths include it once.

- [ ] **Step 5: Run state and LP tests and verify GREEN**

Run: `npm test -- src/stores/useStore.test.ts src/lib/missionLp.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit frontend state**

```powershell
git add src/stores/useStore.ts src/stores/useStore.test.ts src/lib/missionLp.ts src/lib/missionLp.test.ts
git commit -m "feat: track correction practice rewards"
```

### Task 4: Wire additive practice events through the frontend socket

**Files:**
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/hooks/useVoiceSocket.ts`
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/hooks/useVoiceSocket.test.ts`

**Interfaces:**
- Consumes: store actions from Task 3.
- Produces: `sendCorrectionPracticeStart(socket, sourceTurnId, target) -> boolean`.
- Produces: `sendCorrectionPracticeCancel(socket, sourceTurnId) -> boolean`.
- Handles: `practice_ready`, `practice_partial`, `practice_result`, `practice_timeout`, `practice_cancelled`, `practice_error`.

- [ ] **Step 1: Write failing protocol helper tests**

Use a fake open WebSocket and verify exact JSON payloads. Verify closed sockets return `false` and send nothing. Add event reducer tests or exported handler tests proving `practice_result` invokes only `resolveCorrectionPractice`, never `addMessage` or `queueLocalEvaluationBatchTurn`.

- [ ] **Step 2: Run socket tests and verify RED**

Run: `npm test -- src/hooks/useVoiceSocket.test.ts`

Expected: missing helper and event handler exports.

- [ ] **Step 3: Implement outbound helpers and inbound cases**

Extend `SocketMessage` with `sourceTurnId`, `transcript`, `score`, `success`, and `rewardLp`. Add helpers that validate an open socket and send exact protocol payloads. Add switch cases that update only correction practice state.

On `ws.onclose` and explicit `disconnect`, call `cancelCorrectionPractice('연결이 끊어져 연습을 종료했어요.')`. Do not clear message completion records. On `stopListening`, cancel active practice before stopping the recorder so a half-recorded practice cannot become a normal turn after restart.

- [ ] **Step 4: Run socket and microphone regression tests**

Run:

```powershell
npm test -- src/hooks/useVoiceSocket.test.ts src/components/ControlPanel.test.tsx
```

Expected: all selected tests pass; microphone off still leaves the conversation socket connected.

- [ ] **Step 5: Commit frontend socket support**

```powershell
git add src/hooks/useVoiceSocket.ts src/hooks/useVoiceSocket.test.ts
git commit -m "feat: handle correction practice events"
```

### Task 5: Render the correction retry card without disrupting chat

**Files:**
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/components/AssessmentPanel.tsx`
- Modify: `C:/Users/365mc/workspace/realtimechat-en/realtime-voice-chat/src/components/AssessmentPanel.test.ts`

**Interfaces:**
- Consumes: `CorrectionPracticeState`, completion record, socket helpers, `isRecording`, `isPlaying`, and `isConnected`.
- Updates: `CorrectionCoachCard` props with source turn, target, state, availability, and handlers.

- [ ] **Step 1: Write failing card state tests**

Add tests for these visible strings and actions:

```text
다음에는 이렇게 말해보세요
다시 말하기 +2 LP
듣고 있어요…
확인하고 있어요…
잘했어요! +2 LP
한 번 더
넘어가기
```

Verify the button is disabled while AI audio plays or the microphone/socket is unavailable. Verify clicking retry does not add a chat message. Verify a new source turn resets the visible practice state.

- [ ] **Step 2: Run card tests and verify RED**

Run: `npm test -- src/components/AssessmentPanel.test.ts`

Expected: missing controls and state copy.

- [ ] **Step 3: Implement the stateful card**

Keep the current sentence, Korean reason, score, and LP animations mounted. Add a compact action row below the explanation. Start sends `practice_start` only when connected, recording, and not playing. Cancel and skip send `practice_cancel` when needed and update local state. Failed attempts show the recognized transcript in muted text; do not render it in `ChatOverlay`.

Only show the retry controls when:

```ts
Boolean(sourceTurnId && sentence.trim() && original.trim()
    && normalizeForDisplay(sentence) !== normalizeForDisplay(original))
```

Completed source turns show the success state and cannot earn again.

- [ ] **Step 4: Run component and full frontend tests**

Run:

```powershell
npm test -- src/components/AssessmentPanel.test.ts
npm test
npm run lint
npm run build
```

Expected: all tests pass, ESLint exits 0, and Next.js production build succeeds.

- [ ] **Step 5: Commit the card UI**

```powershell
git add src/components/AssessmentPanel.tsx src/components/AssessmentPanel.test.ts
git commit -m "feat: add correction retry practice card"
```

### Task 6: Cross-stack verification and handoff

**Files:**
- Verify only; modify tests or feature files only if a discovered defect is directly in scope.

**Interfaces:**
- Consumes all tasks.
- Produces verified backend-first deployment order and rollback note.

- [ ] **Step 1: Run both complete automated suites**

Backend:

```powershell
python -m unittest discover -s code -p 'test_*.py'
```

Frontend:

```powershell
npm test
npm run lint
npm run build
```

Expected: no new failures.

- [ ] **Step 2: Run local browser verification**

At `http://localhost:3003/chat`, complete one AI turn and verify:

- retry success produces no additional chat turn or assistant reply;
- evaluation pending count and mission progress do not change;
- total LP increases by 2 exactly once;
- retry failure can be retried or skipped;
- microphone off/on preserves conversation and completed reward;
- disconnect during retry returns the card to a safe non-rewarded state.

- [ ] **Step 3: Review diffs and operational risks**

Run in each repository:

```powershell
git diff --check
git status --short
git log --oneline -5
```

Confirm no generated caches, `.gstack`, secrets, audio files, or unrelated user changes are staged. Confirm backend must deploy before frontend; rollback is hiding the retry controls and removing only additive practice handlers.

- [ ] **Step 4: Record outcome and prepare integration**

Record the model/effort outcome with the advisor registry after verification. Use the finishing workflow to choose merge, push, or cleanup; do not force-push.
