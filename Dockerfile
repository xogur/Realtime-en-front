# Build Stage
FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_STT_PROVIDER=server
ENV NEXT_PUBLIC_STT_PROVIDER=$NEXT_PUBLIC_STT_PROVIDER
ARG NEXT_PUBLIC_WS_URL=ws://localhost:18003/ws
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production Stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3003

ENV PORT=3003
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
