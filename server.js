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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const tmpDir = './tmp';
if (!fs.existsSync(tmpDir)){
  fs.mkdirSync(tmpDir, { recursive: true });
}

app.get('/', (req, res) => {
  res.json({ status: 'AutoVid AI Running!', version: '2.2 - 720p Fast' });
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

    // 1. Generate Script
    const scriptPrompt = `Create a ${duration} ${language} motivational video script about "${topic}".
    Split into exactly 4 scenes. Each scene needs:
    1. narration: 1-2 short sentences to speak
    2. visual: 2-3 keywords like "nature", "city", "person working"
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
      throw new Error('Script generation failed');
    }

    console.log(`[2/5] Script generated: ${scenes.length} scenes`);

    // 2. Generate Voice
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

    // 3. Get Pexels Video - 720p preference
    let videoUrl = null;
    const searchQueries = ['nature', 'landscape', 'motivational', 'success', 'city'];

    for (const query of searchQueries) {
      try {
        console.log(`[4/5] Searching Pexels for: ${query}`);
        const pexelsResponse = await axios.get('https://api.pexels.com/videos/search', {
          headers: { Authorization: process.env.PEXELS_API_KEY },
          params: { query, per_page: 5, orientation: 'portrait' },
          timeout: 10000
        });

        if (pexelsResponse.data.videos && pexelsResponse.data.videos.length > 0) {
          // Prefer SD/720p videos - faster to process
          const video = pexelsResponse.data.videos[0];
          const videoFile = video.video_files
         .filter(v => v.height <= 1280)
         .sort((a, b) => (b.width || 0) - (a.width || 0))[0] || video.video_files[0];

          if (videoFile && videoFile.link) {
            videoUrl = videoFile.link;
            console.log(`[4/5] Found video: ${videoFile.width}x${videoFile.height}`);
            break;
          }
        }
      } catch (err) {
        console.log(`Pexels search failed for "${query}":`, err.message);
      }
    }

    if (!videoUrl) {
      console.log('[4/5] Using fallback video');
      videoUrl = 'https://videos.pexels.com/video-files/1448735/1448735-sd_540_960_24fps.mp4';
    }

    console.log('[4/5] Downloading video...');

    const videoStream = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000
    });

    const writer = fs.createWriteStream(tempVideoPath);
    videoStream.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      setTimeout(() => reject(new Error('Download timeout 30s')), 30000);
    });

    const stats = fs.statSync(tempVideoPath);
    console.log(`[4/5] Downloaded: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    if (stats.size < 10000) {
      throw new Error('Downloaded video file too small');
    }

    console.log('[5/5] Processing video with FFmpeg...');

    // 4. FFmpeg - 720x1280 FAST SETTINGS
    const filter = '[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24[outv]';

    await new Promise((resolve, reject) => {
      const command = ffmpeg()
   .input(tempVideoPath)
   .input(audioPath)
   .complexFilter([filter])
   .outputOptions([
          '-map', '[outv]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'superfast',
          '-crf', '30',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-shortest',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-threads', '1',
          '-tune', 'fastdecode',
          '-t', '35'
        ])
   .output(outputPath);

      let timeoutId = setTimeout(() => {
        command.kill('SIGKILL');
        reject(new Error('FFmpeg timeout after 60s'));
      }, 60000);

      command
   .on('start', () => {
          console.log('FFmpeg started - 720p mode');
        })
   .on('progress', (p) => {
          if (p.percent) console.log(`Processing: ${Math.floor(p.percent)}%`);
        })
   .on('end', () => {
          clearTimeout(timeoutId);
          console.log('Video created successfully:', outputPath);
          resolve();
        })
   .on('error', (err) => {
          clearTimeout(timeoutId);
          console.error('FFmpeg error:', err.message);
          reject(new Error(`FFmpeg failed: ${err.message}`));
        })
   .run();
    });

    // Cleanup
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ SUCCESS in ${timeTaken}s`);

    res.json({
      success: true,
      message: 'Video generated successfully!',
      path: outputPath,
      duration: `${timeTaken}s`,
      resolution: '720x1280',
      scenes: scenes.length
    });

  } catch (err) {
    console.error('❌ ERROR:', err.message);

    [tempVideoPath, audioPath, outputPath].forEach(file => {
      if (file && fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch(e) {}
      }
    });

    res.status(500).json({
      error: err.message,
      hint: 'Try again - Render free tier is slow'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
