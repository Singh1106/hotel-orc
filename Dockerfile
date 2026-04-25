FROM node:24-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Set production environment
ENV NODE_ENV=production

# Expose port (default 3000, can be overridden with PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
