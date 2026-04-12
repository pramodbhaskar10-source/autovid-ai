const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug build active',
    nodeVersion: process.version,
    hasJson2VideoKey: !!process.env.JSON2VIDEO_API_KEY,
    keyLength: process.env.JSON2VIDEO_API_KEY?.length || 0,
    time: new Date().toISOString()
  });
});

app.post('/api/generate', async (req, res) => {
  try {
    if (!process.env.JSON2VIDEO_API_KEY) {
      throw new Error('JSON2VIDEO_API_KEY missing');
    }
    const response = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.JSON2VIDEO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resolution: 'full-hd',
        scenes: [{ elements: [{ type: 'text', text: req.body.prompt, duration: 5 }] }]
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    res.json({ success: true, project_id: data.project || data.id, debug: 'New code' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get('/api/status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const response = await fetch(`https://api.json2video.com/v2/movies/${projectId}`, {
      headers: { 'x-api-key': process.env.JSON2VIDEO_API_KEY }
    });
    const data = await response.json();
    
    if (data.status === 'done') {
      res.json({
        success: true,
        status: 'done',
        video_url: data.movie.url
      });
    } else {
      res.json({
        success: true,
        status: data.status,
        message: 'Video innum render aagudhu'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
module.exports = app; // IDHU MUKKIYAM
