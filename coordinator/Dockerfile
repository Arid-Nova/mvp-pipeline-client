# ==========================================
# Stage 1: Build the TypeScript code
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ==========================================
# Stage 2: Create the production image
# ==========================================
FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm install --only=production

COPY --from=builder /usr/src/app/dist ./dist

USER node

EXPOSE 3124

CMD ["npm", "start"]