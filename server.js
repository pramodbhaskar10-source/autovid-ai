const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const Replicate = require('replicate');
const OpenAI = require('openai');
const { v2: cloudinary } = require('cloudinary');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// === CONFIG ===
const PORT = process.env.PORT || 10000;
const JOBS = new Map();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// === 18 STYLES MAPPED ===
const STYLE_PROMPTS = {
  'studio Ghibli': 'Studio Ghibli anime style, hand-drawn animation, soft watercolor, magical, dreamy, detailed backgrounds',
  'LEGO': 'LEGO brick style, plastic toy aesthetic, colorful blocks, playful, 3D render',
  'anime': 'Japanese anime style, vibrant colors, detailed character design, cel-shaded',
  'pixar': 'Pixar 3D animation style, cinematic lighting, expressive characters, photorealistic textures',
  'cyberpunk': 'Cyberpunk neon style, futuristic city, dark atmosphere, neon lights, high-tech',
  'watercolor': 'Watercolor painting style, soft edges, artistic, pastel colors, paper texture',
  '3d cartoon': '3D cartoon style, smooth render, vibrant, family-friendly, rounded shapes',
  'comic book': 'Comic book style, bold lines, halftone dots, speech bubbles aesthetic',
  'oil painting': 'Oil painting style, classical art, rich textures, dramatic lighting',
  'pixel art': 'Pixel art style, 8-bit retro, video game aesthetic, blocky pixels',
  'claymation': 'Claymation style, stop-motion clay, textured, handcrafted look',
  'sketch': 'Pencil sketch style, hand-drawn, monochrome, artistic lines',
  'isometric': 'Isometric 3D style, geometric, clean lines, tech illustration',
  'low poly': 'Low poly 3D style, geometric shapes, minimalist, modern game art',
  'vaporwave': 'Vaporwave aesthetic, retro 80s, pink/purple gradients, grid, palm trees',
  'steampunk': 'Steampunk style, Victorian era, brass gears, industrial, sepia tones',
  'minimalist': 'Minimalist style, clean, simple shapes, lots of white space, modern',
  'realistic': 'Photorealistic style, ultra detailed, 8K, professional photography'
};

// REPLACE the VOICES object with this:
const VOICES = {
  'Nova': 'EXAVITQu4vr4xnSDxMaL', // Sarah - Female, professional
  'Alloy': 'pNInz6obpgDQGcFmaJgB', // Adam - Male, deep
  'Echo': 'VR6AewLTigWG4xSOukaG', // Josh - Male, young
  'Fable': 'TxGEqnHWrfWFTfGW9XjX', // Josh alternative
  'Onyx': 'CYw3kZ02Hs0563khs1Fj', // Dave - Male, conversational
  'Shimmer': 'jsCqWAovK2LkecY7zXl4' // Freya - Female, warm
};

// === UTILS ===
const workDir = '/tmp/autovid';
fs.mkdir(workDir, { recursive: true }).catch(() => {});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(url, filepath) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  await fs.writeFile(filepath, res.data);
  return filepath;
}

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
  res.json({
    status: 'alive',
    env_check: {
      replicate:!!process.env.REPLICATE_API_TOKEN,
      openai:!!process.env.OPENAI_API_KEY,
      elevenlabs:!!process.env.ELEVENLABS_API_KEY,
      cloudinary:!!process.env.CLOUDINARY_CLOUD_NAME
    }
  });
});

// === MULTI-SCENE SCRIPT GENERATOR ===
async function generateScenes(topic, duration) {
  const sceneCount = Math.ceil(parseInt(duration) / 5); // 5s per scene

  const prompt = `Create a ${duration} video script about "${topic}".
Break it into exactly ${sceneCount} scenes, each 5 seconds long.
Return ONLY a JSON array of scene descriptions, each 15-20 words max.
Example: ["A hero stands on a mountain peak at sunrise", "Close-up of determination in their eyes",...]
No narration, just visual scene descriptions.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 500
  });

  const text = completion.choices[0].message.content;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('GPT did not return valid scenes array');

  const scenes = JSON.parse(jsonMatch[0]);
  return scenes.slice(0, sceneCount); // Cap at sceneCount
}

// === IMAGE GENERATION WITH RATE LIMIT HANDLING ===
async function generateImages(scenes, style, width, height, jobId) {
  const imageFiles = [];

  for (let i = 0; i < scenes.length; i++) {
    console.log(`[${jobId}] Image ${i+1}/${scenes.length}`);
    const imagePrompt = `${scenes[i]}, ${STYLE_PROMPTS[style]}, high quality, detailed, cinematic, no text, no watermark, no logo`;

    let retries = 3;
    let output;

    while (retries > 0) {
      try {
        output = await replicate.run(
          "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          {
            input: {
              prompt: imagePrompt,
              width,
              height,
              num_outputs: 1,
              num_inference_steps: 25,
              scheduler: "K_EULER"
            }
          }
        );
        break;
      } catch (err) {
        if (err.response?.status === 429 && retries > 1) {
          const waitTime = (4 - retries) * 15000; // 15s, 30s, 45s
          console.log(`[${jobId}] Rate limited. Waiting ${waitTime/1000}s...`);
          await sleep(waitTime);
          retries--;
        } else {
          throw err;
        }
      }
    }

    const imgPath = path.join(workDir, `${jobId}_scene_${i}.png`);
    await downloadFile(output[0], imgPath);
    imageFiles.push(imgPath);

    // Update progress
    const job = JOBS.get(jobId);
    if (job) {
      job.progress = 20 + Math.floor((i / scenes.length) * 35);
      JOBS.set(jobId, job);
    }

    // Critical: 2s delay between SDXL calls to avoid 429
    if (i < scenes.length - 1) {
      await sleep(2000);
    }
  }

  return imageFiles;
}

// === VOICEOVER GENERATION ===
async function generateVoiceover(script, voice) {
  const voiceId = VOICES[voice] || VOICES['Nova']; // Default to Sarah
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  console.log(`[${voice}] Using ElevenLabs voice ID: ${voiceId}`);

  const res = await axios.post(url, {
    text: script,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true
    }
  }, {
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    responseType: 'arraybuffer',
    timeout: 60000
  });

  return res.data;
}

// === CAPTIONS WITH WHISPER ===
async function generateCaptions(audioPath) {
  const audioFile = await fs.readFile(audioPath);

  const formData = new FormData();
  formData.append('file', new Blob([audioFile]), 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'srt');

  const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
     ...formData.getHeaders()
    },
    timeout: 120000
  });

  return res.data;
}

// === FFmpeg STITCH - PRO 1080p ===
function stitchVideoPro(images, audio, srt, output, width, height, brand) {
  return new Promise((resolve, reject) => {
    const inputs = images.map(img => `-loop 1 -t 5 -i "${img}"`).join(' ');

    // Ken Burns zoom + concat + subtitles + watermark
    const filterComplex = images.map((_, i) =>
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `zoompan=z='min(zoom+0.0015,1.2)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=30[v${i}]`
    ).join(';') + ';' +
    images.map((_, i) => `[v${i}]`).join('') +
    `concat=n=${images.length}:v=1:a=0[concatenated];` +
    `[concatenated]subtitles='${srt}':force_style='FontName=DejaVu Sans,FontSize=24,PrimaryColour=&H00FFFFFF,Outline=2,Bold=1'[v]`;

    const cmd = `ffmpeg ${inputs} -i "${audio}" -filter_complex "${filterComplex}" ` +
      `-map "[v]" -map ${images.length}:a ` +
      `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -shortest -y "${output}"`;

    console.log('Running FFmpeg (PRO MODE - 1080p)...');

    const child = exec(cmd, { maxBuffer: 1024 * 500 }, (err, stdout, stderr) => {
      if (err) {
        console.error('=== FFMPEG FAILED ===');
        console.error('Stderr:', stderr.slice(-1000));
        reject(new Error(`FFmpeg failed: ${err.message}`));
      } else {
        console.log('=== FFMPEG SUCCESS (1080p) ===');
        resolve();
      }
    });

    child.on('error', (err) => reject(err));
  });
}

// === MAIN GENERATION ENDPOINT ===
app.post('/api/generate-pro', async (req, res) => {
  const { topic, style, voice, aspectRatio, duration, language, brandName } = req.body;

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const job = { jobId, status: 'queued', progress: 0, topic };
  JOBS.set(jobId, job);

  res.json({ jobId, status: 'queued', message: 'Video generation started' });

  // Async processing
  (async () => {
    try {
      const jobWorkDir = path.join(workDir, jobId);
      await fs.mkdir(jobWorkDir, { recursive: true });

      // Dimensions
      const dims = {
        'vertical': { width: 1080, height: 1920 },
        'horizontal': { width: 1920, height: 1080 },
        'square': { width: 1080, height: 1080 }
      };
      const { width, height } = dims[aspectRatio] || dims['vertical'];

      // 1. Generate scenes
      job.status = 'processing';
      job.progress = 5;
      JOBS.set(jobId, {...job});
      console.log(`[${jobId}] Generating scenes...`);
      const scenes = await generateScenes(topic, duration);
      const fullScript = scenes.join('. ') + '.';

      // 2. Generate images
      job.progress = 20;
      JOBS.set(jobId, {...job});
      console.log(`[${jobId}] Generating ${scenes.length} images...`);
      const imageFiles = await generateImages(scenes, style, width, height, jobId);

      // 3. Generate voiceover
      job.progress = 60;
      JOBS.set(jobId, {...job});
      console.log(`[${jobId}] Generating voiceover with ${voice}...`);
      const audioBuffer = await generateVoiceover(fullScript, voice);
      const audioPath = path.join(jobWorkDir, 'voice.mp3');
      await fs.writeFile(audioPath, audioBuffer);

      // 4. Generate captions
      job.progress = 70;
      JOBS.set(jobId, {...job});
      console.log(`[${jobId}] Generating captions...`);
      const srtContent = await generateCaptions(audioPath);
      const srtPath = path.join(jobWorkDir, 'captions.srt');
      await fs.writeFile(srtPath, srtContent);

      // 5. Stitch video
      job.progress = 80;
      JOBS.set(jobId, {...job});
      console.log(`[${jobId}] Rendering with FFmpeg...`);
      const outputPath = path.join(jobWorkDir, 'final.mp4');
      await stitchVideoPro(imageFiles, audioPath, srtPath, outputPath, width, height, brandName);

      // 6. Upload to Cloudinary
      job.progress = 95;
      JOBS.set(jobId, {...job});
      console.log(`[${jobId}] Uploading to Cloudinary...`);
      const upload = await cloudinary.uploader.upload(outputPath, {
        resource_type: 'video',
        folder: 'autovid',
        public_id: `${jobId}_${style.replace(/\s/g, '_')}`
      });

      // 7. Complete
      job.status = 'completed';
      job.progress = 100;
      job.videoUrl = upload.secure_url;
      job.completedAt = new Date().toISOString();
      JOBS.set(jobId, job);
      console.log(`[${jobId}] COMPLETED: ${upload.secure_url}`);

      // Cleanup
      await fs.rm(jobWorkDir, { recursive: true, force: true }).catch(() => {});

    } catch (err) {
      console.error(`[${jobId}] FAILED:`, err);
      const job = JOBS.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = err.message;
        JOBS.set(jobId, job);
      }
    }
  })();
});

// === STATUS ENDPOINT ===
app.get('/api/status/:jobId', (req, res) => {
  const job = JOBS.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`AutoVid AI Pro running on ${PORT}`);
});
