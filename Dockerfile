FROM node:22-bookworm-slim

WORKDIR /app

# Runtime dependencies for the DKCT module.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

# The Vite app imports the shared module from ../client, so build with the repo tree present.
COPY . .
RUN npm ci --prefix standalone \
  && npm run build --prefix standalone \
  && npm prune --omit=dev --prefix standalone

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "standalone/server/index.js"]
