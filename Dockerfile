FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV APP_MODE=http

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"] 