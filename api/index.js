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
    has_api_key:!!process.env.JSON2VIDEO_API_KEY,
    node_version: process.version
  });
});

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

    // FIXED: Voice element with duration -1, no text element
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
            elements: [
              {
                type: "voice",
                model: "azure",
                text: prompt,
                voice: "en-IN-NeerjaNeural",
                duration: -1  // THIS IS KEY - Auto duration
              }
            ]
          }
        ]
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
    console.error('Generate Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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

    // Try 1: /v2/movies?movie=ID
    let response = await fetch(`https://api.json2video.com/v2/movies?movie=${projectId}`, {
      headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
    });
    let data = await response.json();

    // Try 2: /v2/movies?project=ID
    if (!data.success ||!data.movies || data.movies.length === 0) {
      response = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
        headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
      });
      data = await response.json();
    }

    // Try 3: /v2/movies/ID
    if (!data.success || (!data.movies &&!data.movie)) {
      response = await fetch(`https://api.json2video.com/v2/movies/${projectId}`, {
        headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
      });
      data = await response.json();

      if (data.success && data.movie) {
        data.movies = [data.movie];
      }
    }

    if (data.success && data.movies.length > 0) {
      const movie = data.movies[0];

      if (movie.status === 'done' || movie.status === 'finished') {
        return res.json({
          success: true,
          status: 'done',
          video_url: movie.url,
          message: 'Video ready!',
          duration: movie.duration || 0
        });
      } else if (movie.status === 'error' || movie.status === 'failed') {
        return res.json({
          success: false,
          status: 'error',
          message: movie.message || 'Video generation failed'
        });
      } else {
        return res.json({
          success: true,
          status: movie.status,
          message: 'Video innum render aagudhu, konjam wait pannunga'
        });
      }
    } else {
      return res.json({
        success: false,
        status: 'not_found',
        message: 'Project not found. Generate a new video with current API key.',
        debug: data
      });
    }

  } catch (error) {
    console.error('Status Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = app;
