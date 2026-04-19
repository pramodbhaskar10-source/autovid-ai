const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Replicate = require('replicate');
const OpenAI = require('openai');
const { v2: cloudinary } = require('cloudinary');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const Razorpay = require('razorpay');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== CONFIG =====
const PORT = process.env.PORT || 10000;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const MASTER_KEY = process.env.MASTER_KEY;

const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ===== AUTH =====
const API_KEYS = new Set(['avp_live_' + MASTER_KEY]);

app.use('/api/generate-pro', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!API_KEYS.has(key)) {
    return res.status(401).json({ error: 'Invalid API key. Get yours at www.autovidpro.in' });
  }
  next();
});

// ===== JOB STORE =====
const JOBS = new Map();

// ===== VOICE MAPPING =====
const VOICE_IDS = {
  'Rachel': '21m00Tcm4TlvDq8ikWAM',
  'Domi': 'AZnzlk1XvdvUeBnXmlld',
  'Bella': 'EXAVITQu4vr4xnSDxMaL',
  'Antoni': 'ErXwobaYiN019PkySvjV',
  'Elli': 'MF3mGyEYCl7XYWbV9V6O',
  'Nova': '21m00Tcm4TlvDq8ikWAM'
};

// ===== STYLE PROMPTS =====
const STYLE_PROMPTS = {
  'studio Ghibli': 'Studio Ghibli anime style, hand-drawn, watercolor, whimsical, detailed background',
  'LEGO': 'LEGO brick style, plastic toy aesthetic, bright colors, blocky',
  'pixar': 'Pixar 3D animation style, cinematic lighting, vibrant, friendly',
  'cyberpunk': 'cyberpunk style, neon lights, futuristic city, dark atmosphere',
  'anime': 'Japanese anime style, vibrant colors, detailed characters',
  'realistic': 'photorealistic, 8k, detailed, professional photography',
  'watercolor': 'watercolor painting style, soft edges, artistic',
  'comic book': 'comic book style, bold lines, halftone dots, vibrant',
  'oil painting': 'oil painting style, textured brushstrokes, classical art',
  'pixel art': 'pixel art style, 16-bit, retro gaming aesthetic',
  'claymation': 'claymation style, stop motion, handcrafted look',
  '3d render': '3D render, octane, cinematic, ultra detailed',
  'low poly': 'low poly 3D style, geometric, minimal',
  'steampunk': 'steampunk style, brass gears, Victorian era, mechanical',
  'fantasy': 'fantasy art style, magical, ethereal, epic',
  'noir': 'film noir style, black and white, dramatic shadows',
  'pop art': 'pop art style, bold colors, Andy Warhol inspired',
  'minimalist': 'minimalist style, clean lines, simple, modern'
};

// ===== HELPERS =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDimensions(aspectRatio) {
  if (aspectRatio === 'vertical') return { width: 1080, height: 1920 };
  if (aspectRatio === 'square') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// ===== AI FUNCTIONS =====
async function generateScenes(topic, duration, style, jobId) {
  const sceneCount = Math.ceil(parseInt(duration) * 60 / 5);
  console.log(`[${jobId}] Generating ${sceneCount} scenes for: ${topic}`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Break down "${topic}" into ${sceneCount} visual scenes for a ${duration} video.
      Style: ${style}.
      Return JSON array: [{"scene": 1, "visual": "description", "narration": "text"}]`
    }],
    response_format: { type: "json_object" }
  });

  const data = JSON.parse(response.choices[0].message.content);
  return data.scenes || data;
}

async function generateImage(prompt, style, jobId) {
  const fullPrompt = `${prompt}, ${STYLE_PROMPTS[style] || style}, high quality, detailed`;

  const output = await replicate.run(
    "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    { input: { prompt: fullPrompt, negative_prompt: "blurry, low quality, text, watermark" } }
  );

  await sleep(2000);
  return output[0];
}

async function generateVoice(text, voice, jobId) {
  const voiceId = VOICE_IDS[voice] || VOICE_IDS['Rachel'];
  console.log(`[${jobId}] Generating voice with ${voice}`);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    { text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.5 } },
    { headers: { 'xi-api-key': ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
  );

  return Buffer.from(response.data);
}

async function generateCaptions(audioPath, jobId) {
  console.log(`[${jobId}] Using dummy captions - Whisper disabled for MVP`);
  return `1
00:00:00,000 --> 00:00:10,000
AutoVid AI Pro

2
00:00:10,000 --> 00:01:00,000
AI Generated Video`;
}

// ===== FFMPEG PRO =====
function stitchVideoPro(images, audio, srt, output, width, height, brand) {
  return new Promise((resolve, reject) => {
    const inputs = images.map(img => `-loop 1 -t 5 -i "${img}"`).join(' ');

    const filterComplex = images.map((_, i) =>
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `zoompan=z='min(zoom+0.0015,1.2)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=30[v${i}]`
    ).join(';') + ';' +
    images.map((_, i) => `[v${i}]`).join('') +
    `concat=n=${images.length}:v=1:a=0,` +
    `drawtext=text='${brand}':fontcolor=white:fontsize=28:x=w-tw-40:y=h-th-40:` +
    `box=1:boxcolor=black@0.5:boxborderw=10:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[final]`;

    const cmd = `ffmpeg ${inputs} -i "${audio}" -filter_complex "${filterComplex}" ` +
      `-map "[final]" -map ${images.length}:a ` +
      `-c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -shortest -y "${output}"`;

    console.log('Running FFmpeg PRO MODE: Captions + Watermark...');

    exec(cmd, { maxBuffer: 1024 * 500 }, (err, stdout, stderr) => {
      if (err) {
        console.error('=== FFMPEG FAILED ===');
        console.error(stderr.slice(-1000));
        reject(new Error(`FFmpeg failed: ${err.message}`));
      } else {
        console.log('=== FFMPEG SUCCESS - VIDEO WITH BRANDING ===');
        resolve();
      }
    });
  });
}

// ===== MAIN GENERATOR =====
async function generateVideoPro(params, jobId) {
  const { topic, style, voice, aspectRatio, duration, brandName } = params;
  const jobWorkDir = path.join('/tmp', 'autovid', jobId);
  await ensureDir(jobWorkDir);

  let job = { id: jobId, status: 'processing', progress: 0 };
  JOBS.set(jobId, job);

  try {
    job.progress = 10;
    JOBS.set(jobId, {...job});
    const scenes = await generateScenes(topic, duration.replace('min', ''), style, jobId);

    job.progress = 20;
    JOBS.set(jobId, {...job});
    const imagePaths = [];
    for (let i = 0; i < scenes.length; i++) {
      console.log(`[${jobId}] Image ${i+1}/${scenes.length}`);
      const imgUrl = await generateImage(scenes[i].visual, style, jobId);
      const imgData = await axios.get(imgUrl, { responseType: 'arraybuffer' });
      const imgPath = path.join(jobWorkDir, `img_${i}.png`);
      await fs.writeFile(imgPath, imgData.data);
      imagePaths.push(imgPath);
      job.progress = 20 + Math.floor((i+1) / scenes.length * 40);
      JOBS.set(jobId, {...job});
    }

    job.progress = 65;
    JOBS.set(jobId, {...job});
    const fullNarration = scenes.map(s => s.narration).join(' ');
    const audioBuffer = await generateVoice(fullNarration, voice, jobId);
    const audioPath = path.join(jobWorkDir, 'audio.mp3');
    await fs.writeFile(audioPath, audioBuffer);

    job.progress = 75;
    JOBS.set(jobId, {...job});
    const srtContent = await generateCaptions(audioPath, jobId);
    const srtPath = path.join(jobWorkDir, 'captions.srt');
    await fs.writeFile(srtPath, srtContent);

    job.progress = 85;
    JOBS.set(jobId, {...job});
    const { width, height } = getDimensions(aspectRatio);
    const videoPath = path.join(jobWorkDir, 'final.mp4');
    await stitchVideoPro(imagePaths, audioPath, srtPath, videoPath, width, height, brandName || 'PramodAI');

    job.progress = 95;
    JOBS.set(jobId, {...job});
    const upload = await cloudinary.uploader.upload(videoPath, {
      resource_type: 'video',
      folder: 'autovid',
      public_id: `${jobId}_${style.replace(/\s+/g, '_')}`
    });

    job = {...job, status: 'completed', progress: 100, videoUrl: upload.secure_url };
    JOBS.set(jobId, job);
    console.log(`[${jobId}] COMPLETED: ${upload.secure_url}`);

  } catch (error) {
    console.error(`[${jobId}] FAILED:`, error);
    job = {...job, status: 'failed', error: error.message };
    JOBS.set(jobId, job);
  }
}

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.json({ status: 'AutoVid AI Pro Backend v1.0 - Razorpay', docs: '/api' });
});

app.get('/api', (req, res) => {
  res.json({
    endpoints: {
      'POST /api/generate-pro': 'Generate video (requires x-api-key)',
      'GET /api/status/:jobId': 'Check job status',
      'POST /api/create-order': 'Create Razorpay order',
      'POST /api/verify-payment': 'Verify payment',
      'GET /api/me': 'Check credits'
    }
  });
});

app.get('/api/me', (req, res) => {
  res.json({ credits: 10, plan: 'pro', status: 'active' });
});

app.post('/api/generate-pro', async (req, res) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  JOBS.set(jobId, { id: jobId, status: 'queued', progress: 0 });
  generateVideoPro(req.body, jobId);
  res.json({ jobId, status: 'queued' });
});

app.get('/api/status/:jobId', (req, res) => {
  const job = JOBS.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ===== RAZORPAY ROUTES =====
app.post('/api/create-order', async (req, res) => {
  try {
    const options = {
      amount: 240000, // ₹2400 in paise = ₹2400
      currency: 'INR',
      receipt: 'rcpt_' + Date.now(),
      notes: { plan: 'pro_monthly' }
    };
    const order = await razorpay.orders.create(options);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const crypto = require('crypto');
  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto
   .createHmac('sha256', RAZORPAY_KEY_SECRET)
   .update(sign.toString())
   .digest('hex');

  if (razorpay_signature === expectedSign) {
    // Payment verified - activate user here
    res.json({ success: true, message: 'Payment verified' });
  } else {
    res.status(400).json({ success: false, error: 'Invalid signature' });
  }
});

app.listen(PORT, () => {
  console.log(`AutoVid AI Pro Backend v1.0 running on port ${PORT}`);
});
