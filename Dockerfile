# Three targets from one file:
#   runtime: compiled services only, production dependencies, no keys (the k8s Deployments use this)
#   tests:   every dependency and the test sources (the e2e Job uses this)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY services ./services
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/services/auth/src/server.js"]

FROM deps AS tests
COPY . .
USER node
CMD ["node", "node_modules/jest/bin/jest.js", "--config", "jest.cluster.config.ts"]
