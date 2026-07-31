This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

## Swappable STT providers

The microphone input is exposed through one STT adapter and has two interchangeable implementations:

- `browser` (default): uses the same Web Speech API path as the center Saju/stress-relief experiences and sends final English transcripts through the existing `user_text_message` WebSocket contract.
- `server`: preserves the original PCM streaming path and the backend STT provider configured by `STT_PROVIDER`.

Select the implementation before starting or building the frontend:

```dotenv
NEXT_PUBLIC_STT_PROVIDER=browser
NEXT_PUBLIC_BROWSER_STT_LANGUAGE=en-US
NEXT_PUBLIC_BROWSER_STT_CONTINUOUS=true
NEXT_PUBLIC_BROWSER_STT_INTERIM_RESULTS=true
NEXT_PUBLIC_BROWSER_STT_MAX_ALTERNATIVES=1
NEXT_PUBLIC_BROWSER_STT_PROCESS_LOCALLY=false
NEXT_PUBLIC_BROWSER_STT_PHRASES=
NEXT_PUBLIC_BROWSER_STT_SILENCE_MS=500
```

To restore the original STT without changing code, set:

```dotenv
NEXT_PUBLIC_STT_PROVIDER=server
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
