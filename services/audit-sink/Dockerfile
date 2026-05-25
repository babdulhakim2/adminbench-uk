FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./

EXPOSE 4001
CMD ["npm", "start"]
