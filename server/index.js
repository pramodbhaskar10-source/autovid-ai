const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Main video generation route - JSON2Video ku call pogum
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    // Prompt validation
    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required' 
      });
    }

    // API key check
    if (!process.env.JSON2VIDEO_API_KEY) {
      console.error('JSON2VIDEO_API_KEY not found in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'Server configuration error: API key missing' 
      });
    }
    
    console.log('Calling JSON2Video API with prompt:', prompt);
    
    // Call JSON2Video API
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
    
    // Check if JSON2Video returned error
    if (!response.ok) {
      throw new Error(data.message || data.error || 'JSON2Video API failed');
    }

    // Success response with project_id
    res.json({
      success: true,
      message: 'Video job started',
      project_id: data.project,
      status: data.status
    });
    
  } catch (error) {
    console.error('Error in /api/generate:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get video status route - Optional, video ready aana check panna
app.get('/api/status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const response = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
      headers: {
        'x-api-key': process.env.JSON2VIDEO_API_KEY
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to get status');
    }

    res.json({
      success: true,
      status: data.movie.status,
      url: data.movie.url || null
    });
    
  } catch (error) {
    console.error('Error in /api/status:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Export for Vercel
module.exports = app;
