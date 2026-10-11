FROM node:22-alpine
WORKDIR /app
COPY ai-server/server.mjs ./ai-server/server.mjs
COPY drawing-ai-core.js ./drawing-ai-core.js
USER node
EXPOSE 8080
CMD ["node", "ai-server/server.mjs"]
