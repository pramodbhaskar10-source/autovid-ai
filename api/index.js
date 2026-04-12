// Fix for Vercel: fetch is not available in Node < 18
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Health check endpoint
app.get('/api/debug', (req, res) => {
  res.json({ 
    message: 'AutoVid AI API Working',
    timestamp: new Date().toISOString(),
    has_api_key: !!process.env.JSON2VIDEO_API_KEY,
    node_version: process.version
  });
});

// Generate video endpoint
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
      return res.status(500).json({ 
        success: false, 
        error: 'JSON2VIDEO_API_KEY not set in Vercel Environment Variables' 
      });
    }
    
    const response = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.JSON2VIDEO_API_KEY
      },
      body: JSON.stringify({
        resolution: "instagram-story",
        scenes: [
          {
            comment: prompt,
            voice: {
              model: "en-IN-NeerjaNeural",
              text: prompt
            }
          }
        ]
      })
    });
    
    const data = await response.json();
    
    if (!data.project) {
      return res.status(500).json({ 
        success: false, 
        error: 'JSON2Video did not return project_id',
        raw: data 
      });
    }
    
    res.json({ 
      success: true, 
      project_id: data.project,
      message: 'Video generation started'
    });
    
  } catch (error) {
    console.error('Generate Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check video status endpoint
app.get('/api/status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ 
        success: false, 
        error: 'projectId is required' 
      });
    }
    
    if (!process.env.JSON2VIDEO_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'JSON2VIDEO_API_KEY not set in Vercel Environment Variables' 
      });
    }
    
    const response = await fetch(`https://api.json2video.com/v2/movies/${projectId}`, {
      headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
    });
    
    const data = await response.json();
    
    // DEBUG MODE: Return full response to see structure
    return res.json({
      success: true,
      debug_full_response: data,
      message: 'Check debug_full_response to see JSON2Video actual structure'
    });
    
  } catch (error) {
    console.error('Status Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

module.exports = app;
