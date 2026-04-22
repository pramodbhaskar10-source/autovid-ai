# Use Node 18 with Debian base - includes apt-get
FROM node:18-bullseye

# Install FFmpeg + fonts for subtitles + cleanup
RUN apt-get update && \
    apt-get install -y ffmpeg fonts-dejavu-core && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy ALL code first - so prisma schema exists for postinstall
COPY . .

# Install Node dependencies - postinstall will find schema.prisma now
RUN npm install --production

# Expose port - Render auto-sets PORT env var
EXPOSE 10000

# Start command
CMD ["node", "server.js"]
