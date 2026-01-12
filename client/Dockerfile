# Base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy application files
COPY . .

# build the application
RUN npm run build

# Use Nginx as web server
FROM nginx:alpine

# Security hardening
RUN rm -rf /usr/share/nginx/html/*

# Copy Nginx custom configuration file 
COPY myjekid_nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app to Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose the application port
EXPOSE 8080

# Command to run the application
CMD ["nginx", "-g", "daemon off;"]
