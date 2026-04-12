const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Health check - already working
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Autovid AI is running on Vercel',
    node: process.version,
    json2video: !!process.env.JSON2VIDEO_API_KEY,
    openai: !!process.env.OPENAI_API_KEY
  });
});

// UPDATED: Real JSON2Video call
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }
    if (!process.env.JSON2VIDEO_API_KEY) {
      throw new Error('JSON2VIDEO_API_KEY missing in Vercel env');
    }

    // JSON2Video API call - Basic template
    const j2vResponse = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.JSON2VIDEO_API_KEY
      },
      body: JSON.stringify({
        resolution: 'full-hd',
        quality: 'high',
        scenes: [
          {
            comment: 'Main scene',
            elements: [
              {
                type: 'text',
                text: prompt,
                duration: 5,
                style: '001'
              }
            ]
          }
        ]
      })
    });

    const data = await j2vResponse.json();

    if (!j2vResponse.ok) {
      throw new Error(data.message || 'JSON2Video API error');
    }

    res.status(200).json({ 
      success: true, 
      message: 'Video job started',
      project_id: data.project,
      status_url: `https://api.json2video.com/v2/movies?project=${data.project}`
    });

  } catch (error) {
    console.error('Generate Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check video status route
app.get('/api/status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const response = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
      headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error', message: err.message });
});

module.exports = app;
