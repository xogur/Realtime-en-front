This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Project startup settings

The sibling `RealtimeVoiceChat` repository holds the project's shared
`.env.prod` and `compose.prod.yml`. That Compose file defines both `app` and
`frontend`, along with the local AI services. For local frontend development,
this repository's ignored `.env.local` sets `NEXT_PUBLIC_WS_URL`. The backend's
`Start-AiRuntime.ps1` selects local or NIPA AI from the shared `.env.prod`;
its NIPA path starts the backend separately from the full-stack Compose file.
`NEXT_PUBLIC_WS_URL` is baked into a Next.js image, so changing the browser
WebSocket URL requires rebuilding the frontend image.

## Mode selection (learning mode)

When `NEXT_PUBLIC_MISSION_LEARNING_ENABLED=true`, the controller asks for a mode before free talk: free talk opens the existing difficulty and topic selector unchanged, and learning mode opens the mission entry. The learning card is enabled only when the backend `GET /api/mission-learning/home` reports `enabled: true` (backend `MISSION_LEARNING_ENABLED=true`). With the frontend flag unset, the mode step is skipped. The flag is baked into the Next.js build (Dockerfile build arg). Design: `../docs/02-design/features/learning-mission-mode.design.md`.

## Guided speaking mode

The book button on the controller opens a server-authoritative speaking lesson. The controller can select a restaurant or airport lesson, listen, request hints, and record an attempt. The viewer receives the same `learning_state` snapshots but exposes no write controls.

Learning attempts always request the existing server PCM recorder (`requiredAudio`) even when free talk prefers browser Web Speech. No learning-specific environment variables are required; the existing `NEXT_PUBLIC_WS_URL` also determines the learning HTTP origin.

## Getting Started - 

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

사용자용 키오스크는 아래 명령으로 실행합니다. 개발 서버가 실행 중이 아니면 자동으로 시작하며,
인쇄 버튼은 Windows 기본 프린터로 인쇄 미리보기 없이 바로 출력합니다.

```bash
npm run kiosk
```

## Swappable STT providers

The microphone input is exposed through one STT adapter and has two interchangeable implementations:

- `server` (default): preserves the original PCM streaming path and the backend STT provider configured by `STT_PROVIDER`.
- `browser`: uses the same Web Speech API path as the center Saju/stress-relief experiences and sends final English transcripts through the existing `user_text_message` WebSocket contract.

Select the implementation before starting or building the frontend:

```dotenv
NEXT_PUBLIC_STT_PROVIDER=server
NEXT_PUBLIC_BROWSER_STT_LANGUAGE=en-US
NEXT_PUBLIC_BROWSER_STT_CONTINUOUS=true
NEXT_PUBLIC_BROWSER_STT_INTERIM_RESULTS=true
NEXT_PUBLIC_BROWSER_STT_MAX_ALTERNATIVES=1
NEXT_PUBLIC_BROWSER_STT_PROCESS_LOCALLY=false
NEXT_PUBLIC_BROWSER_STT_UNSPOKEN_PUNCTUATION=true
NEXT_PUBLIC_BROWSER_STT_AEC_MODE=auto
NEXT_PUBLIC_BROWSER_STT_AUTO_GAIN_CONTROL=true
NEXT_PUBLIC_BROWSER_STT_PHRASES=
NEXT_PUBLIC_BROWSER_STT_SILENCE_MS=1500
NEXT_PUBLIC_MISSION_STT_SEGMENT_FALLBACK=true
```

When supported, `UNSPOKEN_PUNCTUATION` asks the browser recognizer to infer punctuation.
The mission fallback also preserves separate final recognition segments as optional metadata,
so a two-sentence speaking mission can pass without changing the transcript shown to the learner.
This evidence is used only for client-side coaching feedback; it is not authoritative proof
for server-side rewards or other durable state.
Set `NEXT_PUBLIC_MISSION_STT_SEGMENT_FALLBACK=false` to disable only that fallback.

Desktop Chrome browser STT opens one processed microphone track and passes that exact track
to `SpeechRecognition.start(track)`. `NEXT_PUBLIC_BROWSER_STT_AEC_MODE=auto` requests the
Chrome `all` echo-cancellation mode when the input device advertises it, then falls back to
standard `echoCancellation: true`. Use `standard` to disable only the experimental string
mode, or `off` for diagnostics. Chrome 135 or newer is required for track-backed recognition;
Chrome 141 or newer is recommended for the `all` mode. During TTS playback the recognizer
stays active so a non-echo interim result can interrupt playback.

To use browser Web Speech instead of the default server STT, set:

```dotenv
NEXT_PUBLIC_STT_PROVIDER=browser
```

Restart the Next.js development server (or rebuild the frontend image) after changing a `NEXT_PUBLIC_` value.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Translator overlay

The main control panel includes a Korean-English translator button. Opening it
disconnects the English conversation socket, stops microphone capture and TTS,
and places a modal overlay above the application. The conversation stays paused
until the overlay is closed and the user starts it again.

- Voice input: the existing browser Web Speech API (`ko-KR` or `en-US`)
- Translation: backend `POST /api/translate` using Argos Translate
- Listen button: browser `speechSynthesis`

The translator derives its HTTP endpoint from `NEXT_PUBLIC_WS_URL`. Set
`NEXT_PUBLIC_API_URL` only when the HTTP backend uses a different host.
