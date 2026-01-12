# INSTALL DEPENDENCIES
FROM node:20-alpine AS deps

# Set working directory
WORKDIR /app

# Copy dependency definition
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# RUNTIME
FROM node:20-alpine

# Security: create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install PM2 runtime globally
RUN npm install -g pm2 \
    && npm cache clean --force

# Copy node_modules and source code
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Fix ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Expose backend port
EXPOSE 5000

# Run Express app via PM2 Runtime (PID 1)
CMD ["pm2-runtime", "app.js"]