# Base node image
FROM node:20-bullseye-slim

WORKDIR /app/backend

# Copy package and install production dependencies
COPY backend/package*.json ./
RUN npm install

# Install PM2 globally to run the Node wrapper process
RUN npm install pm2 -g

# Copy built dist (we'll run the build step in docker-compose or as multi-stage)
# Or we can build it right here
COPY backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build

# Start production server using PM2 runtime
CMD ["pm2-runtime", "dist/server.js"]
EXPOSE 5000
