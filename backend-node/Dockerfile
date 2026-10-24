FROM node:22-alpine AS build
WORKDIR /app/backend-node
COPY backend-node/package.json backend-node/package-lock.json ./
RUN npm ci
COPY backend-node/tsconfig.json ./
COPY backend-node/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app/backend-node
COPY backend-node/package.json backend-node/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend-node/dist ./dist
COPY shared /app/shared
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/server.js"]
