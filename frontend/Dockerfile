FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4200
CMD ["sh", "-c", "npx ng cache clean && npx ng serve --host 0.0.0.0 --port 4200 --proxy-config proxy.conf.json"]
