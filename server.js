const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Ensure tmp folder exists
const tmpDir = './tmp';
if (!fs.existsSync(tmpDir)){
  fs.mkdirSync(tmpDir, { recursive: true });
}

app.get('/', (req, res) => {
  res.json({
    status: 'AutoVid AI Running!',
    version: '2.0 - No Text Overlay',
    message: 'Only 2 API keys needed!'
  });
});

app.post('/api/generate', async (req, res) => {
  const startTime = Date.now();
  let tempVideoPath = '';
  let audioPath = '';
  let outputPath = '';

  try {
    const { topic, duration, language, voiceChoice, brandName } = req.body;

    if (!topic ||!duration ||!language ||!voiceChoice ||!brandName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[1/5] Generating: ${topic} | ${duration} | ${language}`);

    outputPath = path.join(tmpDir, `output_${Date.now()}.mp4`);
    audioPath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
    tempVideoPath = path.join(tmpDir, `temp_video_${Date.now()}.mp4`);

    // 1. Generate Script with OpenAI
    const scriptPrompt = `Create a ${duration} ${language} motivational video script about "${topic}".
    Split into exactly 4 scenes. Each scene needs:
    1. narration: 1-2 short sentences to speak
    2. visual: 2-3 keywords for stock video search
    Return ONLY JSON: {"scenes": [{"narration": "...", "visual": "..."}]}`;

    const scriptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: scriptPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const scriptData = JSON.parse(scriptResponse.choices[0].message.content);
    const scenes = scriptData.scenes;

    if (!scenes || scenes.length === 0) {
      throw new Error('Script generation failed - no scenes returned');
    }

    console.log(`[2/5] Script generated: ${scenes.length} scenes`);

    // 2. Generate Voice with OpenAI TTS
    const fullNarration = scenes.map(s => s.narration).join('. ');
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: voiceChoice,
      input: fullNarration,
      speed: 1.0
    });

    const buffer = Buffer.from(await speechResponse.arrayBuffer());
    fs.writeFileSync(audioPath, buffer);
    console.log('[3/5] Audio generated');

    // 3. Get Pexels Video
    const searchQuery = scenes[0].visual || topic;
    const pexelsResponse = await axios.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: { query: searchQuery, per_page: 5, orientation: 'portrait' }
    });

    if (!pexelsResponse.data.videos || pexelsResponse.data.videos.length === 0) {
      throw new Error(`No Pexels video found for: ${searchQuery}`);
    }

    // Get HD video file
    const videoFile = pexelsResponse.data.videos[0].video_files
     .filter(v => v.quality === 'hd' || v.quality === 'sd')
     .sort((a, b) => b.width - a.width)[0];

    if (!videoFile) {
      throw new Error('No suitable video file found');
    }

    console.log('[4/5] Downloading video from Pexels...');

    // Download video
    const videoStream = await axios({
      url: videoFile.link,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000
    });

    const writer = fs.createWriteStream(tempVideoPath);
    videoStream.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      setTimeout(() => reject(new Error('Video download timeout')), 30000);
    });

    console.log('[5/5] Processing video with FFmpeg...');

    // 4. FFmpeg: Combine video + audio - NO TEXT OVERLAY FOR NOW
    const filter = '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30[outv]';

    await new Promise((resolve, reject) => {
      ffmpeg()
     .input(tempVideoPath)
     .input(audioPath)
     .complexFilter([filter])
     .outputOptions([
          '-map', '[outv]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p'
        ])
     .output(outputPath)
     .on('start', (cmd) => {
          console.log('FFmpeg command:', cmd);
        })
     .on('progress', (p) => {
          console.log(`Processing: ${Math.floor(p.percent || 0)}%`);
        })
     .on('end', () => {
          console.log('Video created successfully:', outputPath);
          resolve();
        })
     .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          reject(new Error(`FFmpeg failed: ${err.message}`));
        })
     .run();
    });

    // Cleanup temp files
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ SUCCESS in ${timeTaken}s`);

    res.json({
      success: true,
      message: 'Video generated successfully!',
      path: outputPath,
      duration: `${timeTaken}s`,
      scenes: scenes.length,
      note: 'Text overlay disabled for stability. Video + Audio working!'
    });

  } catch (err) {
    console.error('❌ ERROR:', err.message);

    // Cleanup on error
    if (tempVideoPath && fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    res.status(500).json({
      error: err.message,
      details: 'Check Render logs for FFmpeg command',
      hint: 'Verify OPENAI_API_KEY and PEXELS_API_KEY in Render env vars'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 API: POST /api/generate`);
  console.log(`🔑 Required env vars: OPENAI_API_KEY, PEXELS_API_KEY`);
});
