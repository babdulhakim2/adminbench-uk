FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY data ./data

EXPOSE 4000
CMD ["npm", "start"]
