# 1. Build the Vite React App
FROM node:20-bullseye-slim AS build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
# Add environment arguments if needed 
ARG VITE_API_PROXY_TARGET=/api
ENV VITE_API_PROXY_TARGET=${VITE_API_PROXY_TARGET}
RUN npm run build

# 2. Serve the App with Nginx
FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Replace default Nginx config to support frontend routing and proxy API requests
RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
