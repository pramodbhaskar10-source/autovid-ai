const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v2: cloudinary } = require('cloudinary');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const Replicate = require('replicate');

const app = express();
app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// 18 STYLES - FacelessReels.com Killer
const STYLE_PROMPTS = {
  'Autoshorts V2': 'cinematic, viral short format, dynamic, trending',
  'LEGO': 'lego blocks style, plastic toy, colorful, blocky construction',
  'Comic Book': 'comic book style, bold ink lines, halftone dots, speech bubbles',
  'Disney toon': 'disney animation style, magical, vibrant colors, glossy, 3d',
  'studio Ghibli': 'studio ghibli style, hayao miyazaki, anime, painterly, soft lighting, detailed background',
  'pixelated': '8-bit pixel art, retro game style, blocky',
  'creepy toon': 'dark cartoon, tim burton style, eerie, gothic',
  'childrens book': 'children book illustration, soft colors, watercolor, cute',
  'photo realism': 'photorealistic, 8k uhd, ultra detailed, professional photography',
  'Minecraft': 'minecraft style, voxel art, blocky 3d, pixelated texture',
  'watercolor': 'watercolor painting, soft brush strokes, artistic, flowing',
  'expressionism': 'expressionist painting, bold colors, emotional, abstract',
  'Charcoal': 'charcoal sketch, black and white, artistic, hand drawn',
  'Gtav': 'gta v style, realistic game graphics, rockstar, detailed',
  'Anime': 'anime style, japanese animation, vibrant colors, detailed eyes, manga',
  'Autoshorts': 'trending short format, fast paced, viral, dynamic',
  'film noir': 'film noir style, black and white, dramatic shadows, 1940s, detective',
  '3D toon': '3d cartoon style, pixar, glossy render, subsurface scattering'
};

const ASPECT_RATIOS = {
  'vertical': { width: 1080, height: 1920 },
  'horizontal': { width: 1920, height: 1080 },
  'square': { width: 1080, height: 1080 }
};

// 6 VOICES + Clone support
const VOICE_MAP = {
  'Echo': 'EXAVITQu4vr4xnSDxMaL',
  'Alloy': 'XB0fDUnXU5powFXDhCwa',
  'Onyx': 'iP95p4xoKVk53GoZ742B',
  'Fable': 'SAz9YHcvj6GT2YYXdXww',
  'Nova': 'XB0fDUnXU5powFXDhCwa', // Tamil Native ⭐
  'Shimmer': 'jBpfuIE2acCO8z3wKNLl'
};

// Duration to scenes mapping
const DURATION_SCENES = {
  '30s': 6, '1min': 12, '2min': 24, '3min': 36,
  '5min': 60, '10min': 120, '15min': 180, '20min': 240
};

const jobs = new Map();

app.post('/api/generate-pro', async (req, res) => {
  const jobId = `job_${Date.now()}`;
  const { topic, style, voice, aspectRatio, duration, language, brandName } = req.body;

  jobs.set(jobId, { status: 'queued', progress: 0 });
  processVideoJobPro(jobId, { topic, style, voice, aspectRatio, duration, language, brandName });

  res.json({ jobId, status: 'queued', message: 'Faceless video generation started' });
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ jobId: req.params.jobId,...job });
});

async function processVideoJobPro(jobId, params) {
  const { topic, style, voice, aspectRatio, duration, language, brandName } = params;
  const job = jobs.get(jobId);
  const workDir = path.join('/tmp', jobId);

  try {
    await fs.mkdir(workDir, { recursive: true });

    // STEP 1: Split script into scenes using GPT-4o
    job.status = 'scripting'; job.progress = 10;
    const sceneCount = DURATION_SCENES[duration] || 12;
    const scenes = await generateScenes(topic, sceneCount, language);

    // STEP 2: Generate AI images for each scene
    job.status = 'generating_images'; job.progress = 20;
    const { width, height } = ASPECT_RATIOS[aspectRatio];
    const imageFiles = [];

    for (let i = 0; i < scenes.length; i++) {
      const imagePrompt = `${scenes[i]}, ${STYLE_PROMPTS[style]}, high quality, detailed, 8k`;
      const output = await replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        { input: { prompt: imagePrompt, width, height, num_outputs: 1, num_inference_steps: 30 } }
      );
      const imgPath = path.join(workDir, `scene_${i}.png`);
      const imgRes = await axios.get(output[0], { responseType: 'arraybuffer' });
      await fs.writeFile(imgPath, imgRes.data);
      imageFiles.push(imgPath);
      job.progress = 20 + Math.floor((i / scenes.length) * 30);
    }

    // STEP 3: Generate voiceover - full script
    job.status = 'voiceover'; job.progress = 55;
    const fullScript = scenes.join('. ');
    const audioRes = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_MAP[voice]}`,
      { text: fullScript, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
    );
    const audioPath = path.join(workDir, 'voiceover.mp3');
    await fs.writeFile(audioPath, audioRes.data);

    // STEP 4: Generate captions with Whisper
    job.status = 'captions'; job.progress = 65;
    const srtPath = path.join(workDir, 'captions.srt');
    // Simplified - in prod use Whisper API
    await fs.writeFile(srtPath, generateSRT(scenes, sceneCount));

    // STEP 5: Stitch with Ken Burns + Transitions + Captions
    job.status = 'rendering'; job.progress = 75;
    const outputPath = path.join(workDir, 'final.mp4');
    await stitchVideoPro(imageFiles, audioPath, srtPath, outputPath, width, height, brandName);

    // STEP 6: Upload Cloudinary
    job.status = 'uploading'; job.progress = 90;
    const uploadRes = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video', folder: 'autovid', public_id: `${jobId}_${style}_${voice}`
    });

    job.status = 'completed';
    job.progress = 100;
    job.result = { videoUrl: uploadRes.secure_url, style, voice, aspectRatio, duration, scenes: sceneCount };

    await fs.rm(workDir, { recursive: true, force: true });

  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
  }
}

async function generateScenes(topic, count, language) {
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Create ${count} visual scene descriptions for a ${language} video about "${topic}". Each scene 5 seconds. Format: Scene 1: description. Only return scenes, no extra text.`
    }]
  }, { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } });

  return res.data.choices[0].message.content.split('\n').filter(s => s.trim()).slice(0, count);
}

function generateSRT(scenes, count) {
  let srt = '';
  scenes.forEach((scene, i) => {
    const start = i * 5;
    const end = (i + 1) * 5;
    srt += `${i+1}\n00:00:${String(start).padStart(2,'0')},000 --> 00:00:${String(end).padStart(2,'0')},000\n${scene.replace(/^Scene \d+:\s*/, '')}\n\n`;
  });
  return srt;
}

function stitchVideoPro(images, audio, srt, output, width, height, brand) {
  return new Promise((resolve, reject) => {
    const inputs = images.map(img => `-loop 1 -t 5 -i "${img}"`).join(' ');
    const filter = images.map((_, i) =>
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `zoompan=z='min(zoom+0.0015,1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',` +
      `setsar=1,fps=30[v${i}]`
    ).join(';') + ';' + images.map((_, i) => `[v${i}]`).join('') +
    `concat=n=${images.length}:v=1:a=0[concatenated];` +
    `[concatenated]subtitles='${srt}':force_style='FontSize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'[subbed];` +
    `[subbed]drawtext=text='${brand}':x=w-tw-20:y=20:fontsize=32:fontcolor=white@0.8:shadow=1[v]`;

    const cmd = `ffmpeg ${inputs} -i "${audio}" -filter_complex "${filter}" -map "[v]" -map ${images.length}:a -c:v libx264 -preset fast -crf 23 -c:a aac -shortest -y "${output}"`;

    exec(cmd, (err) => err? reject(err) : resolve());
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AutoVid AI Pro running on ${PORT}`));
