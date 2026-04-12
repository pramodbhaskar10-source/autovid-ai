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

// JSON2Video route - IDHU DHAN MUKKIYAM
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required' 
      });
    }

    if (!process.env.JSON2VIDEO_API_KEY) {
      throw new Error('JSON2VIDEO_API_KEY missing in Vercel env');
    }
    
    console.log('Calling JSON2Video API with prompt:', prompt);
    
    // IDHU DHAN MISSING AH IRUNDHUCHU - JSON2VIDEO KU ACTUAL CALL
    const response = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.JSON2VIDEO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resolution: 'full-hd',
        quality: 'high',
        scenes: [
          {
            comment: 'Main scene',
            duration: 5,
            elements: [
              {
                type: 'text',
                text: prompt,
                duration: 5,
                style: '001',
                position: 'center-center'
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    console.log('JSON2Video response:', data);
    
    if (!response.ok) {
      throw new Error(data.message || data.error || 'JSON2Video API failed');
    }

    // IDHU DHAN NEENGA VENUMNUTTA PROJECT_ID
    res.json({
      success: true,
      message: 'Video job started',
      project_id: data.project || data.movie?.id || data.id,
      status: data.status || data.movie?.status
    });
    
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
