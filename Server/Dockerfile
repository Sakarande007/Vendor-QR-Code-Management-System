FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/api/health || exit 1

CMD ["node", "server.js"]
