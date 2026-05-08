FROM node:18-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate --schema prisma-foundation/schema.prisma && npx prisma generate || true
RUN npm run build \
  && npm prune --omit=dev

FROM node:18-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app /app

EXPOSE 3000

CMD ["node", "-r", "./scripts/cheekyOsLoadEnv.js", "./cheeky-os/server.js"]
