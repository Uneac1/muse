# Build stage for frontend
FROM node:18-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Build stage for backend
FROM node:18-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
# Build TypeScript to JavaScript
RUN npm run build

# Runtime stage
FROM node:18-alpine
WORKDIR /app

# Copy built server files and already-installed dependencies from builder.
# This avoids a second production-only install step that can fail on some VPS architectures.
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist
# Copy built frontend files to the location expected by server (../../web/dist relative to src)
# The server looks for ../../web/dist from its compiled location. 
# If server is in /app/server/dist/server.js, it looks for /app/web/dist
COPY --from=web-builder /app/web/dist ./web/dist

# Setup working directory for running the app
WORKDIR /app/server

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=./data/muse-mail.db

# Start command
CMD ["node", "dist/server.js"]
