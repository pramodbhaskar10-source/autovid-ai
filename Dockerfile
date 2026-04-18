# Use Node 18 with Debian base - includes apt-get
FROM node:18-bullseye

# Install FFmpeg + fonts for subtitles + cleanup
RUN apt-get update && \
    apt-get install -y ffmpeg fonts-dejavu-core && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first - better caching
COPY package*.json./

# Install Node dependencies
RUN npm install --production

# Copy rest of code
COPY..

# Expose port - Render auto-sets PORT env var
EXPOSE 10000

# Start command
CMD ["node", "server.js"]
