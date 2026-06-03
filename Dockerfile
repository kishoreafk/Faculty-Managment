# Base node image
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Copy root package details if you have one, or just copy subdirectories
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies for both
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy all source
COPY backend ./backend
COPY frontend ./frontend

# Build backend and frontend
RUN cd backend && npm run build
RUN cd frontend && npm run build

# Production image
FROM node:20-bullseye-slim

WORKDIR /app

# Copy built backend
COPY --from=builder /app/backend/package*.json ./backend/
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy built frontend into backend's public directory if you were to serve it from backend;
# or we can use a multi-container setup with Docker Compose below.
# Here we will just package them together for flexibility or separate them in Compose.

# Install serve for frontend if we want to run statically, but typically we use docker-compose
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 5000 3000

CMD ["node", "backend/dist/server.js"]
