const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Ensure tmp folder exists
if (!fs.existsSync('./tmp')){
  fs.mkdirSync('./tmp');
}

app.get('/', (req, res) => {
  res.json({ status: 'AutoVid AI Running! Only 2 API keys needed!' });
});

app.post('/api/generate', async (req, res) => {
  try {
    const { topic, duration, language, voiceChoice, brandName } = req.body;

    console.log(`Generating: ${topic} | ${duration} | ${language}`);

    const outputPath = `./tmp/output_${Date.now()}.mp4`;
    const audioPath = `./tmp/audio_${Date.now()}.mp3`;

    // 1. Generate Script with OpenAI
    const scriptPrompt = `Create a ${duration} ${language} motivational video script about "${topic}".
    Split into 4 scenes. Each scene should have:
    1. narration: 1-2 sentences to speak
    2. visual: description for stock video search
    Return JSON array format: [{"narration": "...", "visual": "..."}]`;

    const scriptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: scriptPrompt }],
      response_format: { type: "json_object" }
    });

    const scriptData = JSON.parse(scriptResponse.choices[0].message.content);
    const scenes = scriptData.scenes || scriptData;
    console.log(`Script generated: ${scenes.length} scenes`);

    // 2. Generate Voice with OpenAI TTS
    const fullNarration = scenes.map(s => s.narration).join(' ');
    const speechResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: voiceChoice || "nova",
      input: fullNarration,
    });

    const buffer = Buffer.from(await speechResponse.arrayBuffer());
    fs.writeFileSync(audioPath, buffer);
    console.log('Audio generated');

    // 3. Get Pexels Video - using first scene visual
    const pexelsResponse = await axios.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: process.env.PEXELS_API_KEY },
      params: { query: scenes[0].visual, per_page: 1 }
    });

    if (!pexelsResponse.data.videos.length) {
      throw new Error('No Pexels video found for: ' + scenes[0].visual);
    }

    const videoUrl = pexelsResponse.data.videos[0].video_files.find(v => v.quality === 'hd').link;
    const tempVideoPath = `./tmp/temp_video_${Date.now()}.mp4`;

    // Download video
    const videoStream = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempVideoPath);
    videoStream.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // 4. FFmpeg: Combine video + audio + captions + watermark
    // THIS IS THE FIXED PART - PROPER FILTER CHAIN
    const captionText = scenes.map(s => s.narration).join(' ').replace(/'/g, "\\'").replace(/:/g, "\\:");

    let filter = '[0:v]scale=1080:1920...;';

    // Add brand watermark
    filter += `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${brandName}':fontcolor=white:fontsize=45:x=w-tw-50:y=50:shadowcolor=black:shadowx=3:shadowy=3;`;

    // Add captions
    filter += `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${captionText}':fontcolor=white:fontsize=55:x=(w-text_w)/2:y=h-250:borderw=4:bordercolor=black@0.8:line_spacing=10[out]`;

    await new Promise((resolve, reject) => {
      ffmpeg()
       .input(tempVideoPath)
       .input(audioPath)
       .complexFilter(filter, 'out')
       .outputOptions([
          '-map', '[out]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-movflags', '+faststart'
        ])
       .output(outputPath)
       .on('start', (cmd) => console.log('FFmpeg started:', cmd))
       .on('end', () => {
          console.log('Video created:', outputPath);
          // Cleanup temp files
          fs.unlinkSync(tempVideoPath);
          fs.unlinkSync(audioPath);
          resolve();
        })
       .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
       .run();
    });

    res.json({
      success: true,
      message: 'Video generated successfully!',
      path: outputPath,
      scenes: scenes.length
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT} - Only 2 API keys needed!`);
});
