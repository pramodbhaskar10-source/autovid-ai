require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PORT = process.env.PORT || 3000;

// Create temp folder
if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');

// 1. Generate script with GPT-4o
async function generateScript(topic, duration, language) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "system",
      content: `You are a viral video scriptwriter. Create scripts for ${duration} ${language} videos.
      Return ONLY valid JSON: { "scenes": [{ "visual": "search term for stock video", "narration": "text to speak" }] }`
    }, {
      role: "user",
      content: `Topic: ${topic}. Duration: ${duration}. Language: ${language}.
      Make ${duration === '30s'? '3-4' : duration === '60s'? '6-8' : '12-15'} scenes.
      Visual should be 2-3 words for Pexels search. Narration should be engaging.`
    }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(completion.choices[0].message.content);
}

// 2. Search Pexels videos
async function searchPexels(query) {
  try {
    const res = await axios.get(`https://api.pexels.com/videos/search`, {
      headers: { Authorization: PEXELS_API_KEY },
      params: { query: query, per_page: 5, orientation: 'portrait' }
    });

    if (res.data.videos.length === 0) return null;

    // Get highest quality video file
    const video = res.data.videos[0];
    const hdFile = video.video_files.find(f => f.quality === 'hd') || video.video_files[0];
    return hdFile.link;
  } catch (err) {
    console.error('Pexels error:', err.message);
    return null;
  }
}

// 3. Generate TTS with OpenAI
async function generateTTS(text, voice = 'nova') {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: voice,
    input: text,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  const filename = `./tmp/voice_${Date.now()}.mp3`;
  await fs.promises.writeFile(filename, buffer);
  return filename;
}

// 4. Download video from URL
async function downloadVideo(url, filename) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(filename);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// 5. Create video with FFmpeg
async function createVideo(scenes, audioPath, outputPath, brandName) {
  return new Promise(async (resolve, reject) => {
    const command = ffmpeg();
    const videoPaths = [];

    // Download all stock videos
    for (let i = 0; i < scenes.length; i++) {
      const videoUrl = await searchPexels(scenes[i].visual);
      if (!videoUrl) continue;

      const videoPath = `./tmp/scene_${i}.mp4`;
      await downloadVideo(videoUrl, videoPath);
      videoPaths.push(videoPath);
      command.input(videoPath);
    }

    if (videoPaths.length === 0) return reject('No videos found');

    // Add audio
    command.input(audioPath);

    // Create filter for concat + scale + captions + watermark
    let filter = '';
    videoPaths.forEach((_, i) => {
      filter += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v${i}];`;
    });

    // Concat all videos
    filter += videoPaths.map((_, i) => `[v${i}]`).join('') + `concat=n=${videoPaths.length}:v=1:a=0[outv];`;

    // Add captions and watermark
const captionText = scenes.map(s => s.narration).join(' ');
filter += `[0:v]drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${brandName}':fontcolor=white:fontsize=40:x=w-tw-50:y=50:shadowcolor=black:shadowx=2:shadowy=2;`;
filter += `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${captionText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=h-200:borderw=3:bordercolor=black[out]`;
    
    command
     .complexFilter(filter)
     .outputOptions([
        '-map', '[out]',
        '-map', `${videoPaths.length}:a`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-shortest',
        '-t', '60'
      ])
     .output(outputPath)
     .on('end', () => {
        // Cleanup temp files
        videoPaths.forEach(p => fs.unlinkSync(p));
        fs.unlinkSync(audioPath);
        resolve();
      })
     .on('error', reject)
     .run();
  });
}

// API Endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { topic, duration = '30s', language = 'English', voiceChoice = 'nova', brandName = 'AutoVid AI' } = req.body;

    if (!topic) return res.status(400).json({ error: 'Topic required' });

    console.log(`Generating: ${topic} | ${duration} | ${language}`);

    // Step 1: Generate script
    const script = await generateScript(topic, duration, language);
    console.log('Script generated:', script.scenes.length, 'scenes');

    // Step 2: Combine all narration for TTS
    const fullNarration = script.scenes.map(s => s.narration).join(' ');
    const audioPath = await generateTTS(fullNarration, voiceChoice);
    console.log('Audio generated');

    // Step 3: Create video
    const outputPath = `./tmp/output_${Date.now()}.mp4`;
    await createVideo(script.scenes, audioPath, outputPath, brandName);
    console.log('Video created:', outputPath);

    res.json({
      success: true,
      message: 'Video generated successfully!',
      path: outputPath,
      scenes: script.scenes.length
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'AutoVid AI Running! Only 2 API keys needed!' });
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT} - Only 2 API keys needed!`);
});
