const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Vercel body limit fix - JSON2Video sends large payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Autovid AI is running on Vercel',
    node: process.version,
    json2video: !!process.env.JSON2VIDEO_API_KEY,
    openai: !!process.env.OPENAI_API_KEY
  });
});

// JSON2Video route example
app.post('/api/generate', async (req, res) => {
  try {
    if (!process.env.JSON2VIDEO_API_KEY) {
      throw new Error('JSON2VIDEO_API_KEY missing in Vercel env');
    }
    // Your JSON2Video logic here
    res.status(200).json({ success: true, message: 'Video job started' });
  } catch (error) {
    console.error('Generate Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;
