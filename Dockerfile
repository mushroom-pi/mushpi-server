# Base
FROM node:22.15.0 AS base

# Install dependencies
FROM base AS deps
WORKDIR /usr/src/app
COPY package.json yarn.lock* ./
RUN yarn

# Build code
FROM base AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN yarn global add @vercel/ncc \
    && ncc build --asset-builds /usr/src/app/src/main.ts -o runner

# Development Build
FROM base AS dev
WORKDIR /usr/src/app
ENV APP_HOST=http://127.0.0.1
ENV APP_PORT=3000
ENV LOGS_LEVEL=warn
COPY --from=builder /usr/src/app/runner/ ./
EXPOSE 3000
CMD ["node", "index.js"]
