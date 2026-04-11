import express from "express"
import OpenAI from "openai"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// ===== OpenAI Setup =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===== Root Route =====
app.get("/", (req, res) => {
  res.send("🚀 Autovid Backend Running")
})

// ===== Storage =====
let jobs: any = {}

// ===== Generate Script =====
async function createVideo(script: string, job_id: string) {
  const videoPath = `video-${job_id}.mp4`

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=black:s=1280x720:d=12') // 12 sec video
      .inputFormat('lavfi')
      .outputOptions([
        '-vf',
        `drawtext=text='${script.substring(0, 100).replace(/:/g, "\\:")}':fontcolor=white:fontsize=24:x=10:y=H-th-10`,
        '-c:v libx264',
        '-pix_fmt yuv420p'
      ])
      .save(videoPath)
      .on('end', () => resolve(videoPath))
      .on('error', reject)
  })
}

// ===== AUTOPILOT API =====
app.post("/api/autopilot", async (req, res) => {
  const { topic } = req.body

  const job_id = Date.now().toString()
  jobs[job_id] = { status: "processing" }

  res.json({ job_id })

  try {
    console.log("Starting job:", job_id)

    const script = await generateScript(topic || "Motivation")

const video = await createVideo(script, job_id)

jobs[job_id] = {
  status: "completed",
  script,
  video_url: `/api/video/${job_id}`
}

  } catch (e: any) {
    jobs[job_id] = {
      status: "failed",
      error: e.message
    }
  }
})

// ===== CHECK JOB =====
app.get('/api/job/:id', (req, res) => {
  res.json(jobs[req.params.id] || { error: "Not found" })
})

app.get('/api/video/:id', (req, res) => {
  const file = path.join(process.cwd(), `video-${req.params.id}.mp4`)

  if (!fs.existsSync(file)) {
    return res.status(404).send("Video not found")
  }

  res.sendFile(file)
})


// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
