# Stage 1: Build the frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Backend URL baked into the Vite build at compile time
ARG VITE_API_URL=https://narrativelens-backend-49161696767.us-central1.run.app
ENV VITE_API_URL=$VITE_API_URL

# Build the Vite application
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts to Nginx html folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Cloud Run defaults mapping to 8080 (available as $PORT which we handle in nginx.conf or via env substitution)
# The custom nginx.conf is configured to listen on 8080.
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
