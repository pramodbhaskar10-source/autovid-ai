const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

app.get('/api/debug', (req, res) => {
  res.json({
    message: 'AutoVid AI API Working',
    timestamp: new Date().toISOString(),
    has_api_key:!!process.env.JSON2VIDEO_API_KEY
  });
});

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    if (!process.env.JSON2VIDEO_API_KEY) {
      return res.status(500).json({ success: false, error: 'API key not set' });
    }

    const response = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.JSON2VIDEO_API_KEY
      },
      body: JSON.stringify({
        resolution: "instagram-story",
        scenes: [{
          comment: prompt,
          voice: {
            model: "en-IN-NeerjaNeural",
            text: prompt
          }
        }]
      })
    });

    const data = await response.json();

    if (!data.success ||!data.project) {
      return res.status(500).json({
        success: false,
        error: 'JSON2Video error',
        raw: data
      });
    }

    res.json({
      success: true,
      project_id: data.project,
      message: 'Video generation started'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const response = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
      headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
    });

    const data = await response.json();

    if (data.success && data.movies.length > 0) {
      const movie = data.movies[0];

      if (movie.status === 'done' || movie.status === 'finished') {
        res.json({
          success: true,
          status: 'done',
          video_url: movie.url,
          message: 'Video ready!'
        });
      } else if (movie.status === 'error' || movie.status === 'failed') {
        res.json({
          success: false,
          status: 'error',
          message: movie.message || 'Video generation failed'
        });
      } else {
        res.json({
          success: true,
          status: movie.status,
          message: 'Video innum render aagudhu'
        });
      }
    } else {
      res.json({
        success: false,
        status: 'not_found',
        message: 'Project not found'
      });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app;
