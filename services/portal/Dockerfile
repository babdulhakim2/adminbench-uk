FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
RUN npm ci --omit=dev

COPY app ./app

EXPOSE 3000
CMD ["npm", "start"]
