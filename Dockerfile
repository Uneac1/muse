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

# Install production dependencies for server
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --production

# Copy built server files
COPY --from=server-builder /app/server/dist ./dist
# Copy built frontend files to the location expected by server (../../web/dist relative to src)
# The server looks for ../../web/dist from its compiled location. 
# If server is in /app/server/dist/server.js, it looks for /app/web/dist
WORKDIR /app
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
