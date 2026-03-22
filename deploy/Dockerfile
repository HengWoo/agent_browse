FROM node:22-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/dist/ ./dist/
COPY server/package.json ./
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
