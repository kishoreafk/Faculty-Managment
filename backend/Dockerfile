# Stage 1: Build and Compile TypeScript
FROM node:20-bullseye-slim AS builder

WORKDIR /app/backend

# Install all dependencies (including devDependencies for TypeScript compilation)
COPY backend/package*.json ./
RUN npm install

# Copy source code and config
COPY backend/tsconfig*.json ./
COPY backend/src ./src

# Compile the project to the dist/ folder
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-bullseye-slim

WORKDIR /app/backend

# Set timezone and production environment
ENV NODE_ENV=production

# Copy package files for installing production dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Install PM2 globally for process management
RUN npm install pm2 -g

# Copy only the compiled output from the builder stage
COPY --from=builder /app/backend/dist ./dist

# Ensure the uploads directory exists with correct permissions
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads

EXPOSE 5000

# Start production server using PM2 runtime
CMD ["pm2-runtime", "dist/server.js"]
