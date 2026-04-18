# Use Node 18 with Debian base
FROM node:18-bullseye

# Install FFmpeg and other dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy rest of code
COPY . .

# Expose port - Render uses PORT env var
EXPOSE 10000

# Start command
CMD ["node", "server.js"]
