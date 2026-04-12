const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// DEBUG ROUTE - Idhu add pannu
app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug build active',
    nodeVersion: process.version,
    hasJson2VideoKey: !!process.env.JSON2VIDEO_API_KEY,
    keyLength: process.env.JSON2VIDEO_API_KEY?.length || 0,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/generate', async (req, res) => {
  console.log('=== /api/generate HIT ===');
  console.log('Request body:', req.body);
  
  try {
    const { prompt } = req.body;
    if (!prompt) {
      console.log('ERROR: No prompt');
      return res.status(400).json({ success: false, error: 'Prompt required' });
    }

    console.log('Checking API key...');
    if (!process.env.JSON2VIDEO_API_KEY) {
      console.log('ERROR: JSON2VIDEO_API_KEY missing');
      throw new Error('JSON2VIDEO_API_KEY missing in Vercel env');
    }
    console.log('API key found, length:', process.env.JSON2VIDEO_API_KEY.length);
    
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

    console.log('JSON2Video status:', response.status);
    const data = await response.json();
    console.log('JSON2Video response:', JSON.stringify(data));
    
    if (!response.ok) {
      throw new Error(data.message || 'JSON2Video API failed');
    }

    const projectId = data.project || data.movie?.id || data.id;
    console.log('Project ID found:', projectId);

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

module.exports = app;
