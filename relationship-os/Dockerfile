FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY .env* ./

RUN npx prisma generate --schema=src/db/schema.prisma

CMD ["node", "src/bot/index.js"]
