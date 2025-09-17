FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci || (echo "No lockfile, falling back to npm i" && npm i)
COPY . .
ENV PORT=8081
EXPOSE 8081
CMD ["npm","start"]