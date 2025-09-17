FROM node:20-bullseye AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci || (echo "No lockfile, falling back to npm i" && npm i)

FROM node:20-bullseye AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure OpenSSL present during generate (not strictly needed in build stage, but safe)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npx prisma generate && npm run build

FROM node:20-bullseye
WORKDIR /app
ENV NODE_ENV=production
# Install OpenSSL for Prisma query engine
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY package.json .
EXPOSE 8080
CMD sh -c "npx prisma migrate deploy && npx tsx src/index.ts"
