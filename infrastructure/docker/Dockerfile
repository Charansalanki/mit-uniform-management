# infrastructure/docker/Dockerfile
FROM node:24-alpine AS base
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

VOLUME ["/app/data", "/app/uploads"]

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "index.js"]
