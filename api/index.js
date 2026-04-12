const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Debug route - IDHU DHAN MUKKIYAM
app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug build active',
    nodeVersion: process.version,
    hasJson2VideoKey: !!process.env.JSON2VIDEO_API_KEY,
    keyLength: process.env.JSON2VIDEO_API_KEY?.length || 0,
    timestamp: new Date().toISOString()
  });
});

// Generate route
app.post('/api/generate', async (req, res) => {
  console.log('=== /api/generate HIT ===');
  console.log('Request body:', req.body);
  
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt required' });
    }

    if (!process.env.JSON2VIDEO_API_KEY) {
      throw new Error('JSON2VIDEO_API_KEY missing in Vercel env');
    }
    
    console.log('Calling JSON2Video API NOW...');
    const response = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.JSON2VIDEO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resolution: 'full-hd',
        scenes: [{ 
          elements: [{ 
            type: 'text', 
            text: prompt, 
            duration: 5 
          }] 
        }]
      })
    });

    const data = await response.json();
    console.log('JSON2Video response:', JSON.stringify(data));
    
    if (!response.ok) {
      throw new Error(data.message || 'JSON2Video API failed');
    }

    const projectId = data.project || data.movie?.id || data.id;

    res.json({
      success: true,
      message: 'Video job started',
      project_id: projectId,
      status: data.status || 'pending',
      debug: 'New code is running'
    });
    
  } catch (error) {
    console.error('GENERATE ERROR:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debug: 'New code is running but failed'
    });
  }
});

// IDHU LAST LINE LA IRUKANUM - Vercel ku thevai
module.exports = app;
