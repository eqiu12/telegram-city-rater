FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Install build tools for native deps (e.g., sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first to leverage Docker layer cache
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the backend code
COPY . .

# Health endpoint exposed via Express on $PORT
EXPOSE 3000

# Entrypoint runs migrations, then starts the server
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]


