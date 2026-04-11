import axios from "axios"
import express from "express"

const app = express()

app.get("/", (req, res) => {
  res.send("Worker is running ✅")
})

app.listen(10000, () => {
  console.log("Worker server running on port 10000")
})

// ✅ CLEAN SCRIPT
const cleanScript = "Success starts in your mind. Stay focused and never give up!"
  .replace(/\*\*/g, "")
  .replace(/\n/g, " ")
  .substring(0, 120)

// ✅ FUNCTION (IMPORTANT FIX)
async function createVideo() {
  try {
    const response = await axios.post(
      "https://api.json2video.com/v2/movies",
      {
  resolution: "1080x1920",
  scenes: [
    {
      duration: 6,
      elements: [
        {
          type: "video",
          src: "https://cdn.coverr.co/videos/coverr-working-on-laptop-5176/1080p.mp4"
        },
        {
          type: "text",
          text: cleanScript,
          style: "font-size:60px; color:#ffffff; text-align:center;",
          position: "center"
        }
      ]
    }
  ]
}

    console.log("✅ Video created:", response.data)
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message)
  }
}

// ✅ RUN EVERY 20 SECONDS (TEST)
setInterval(createVideo, 20000)

// KEEP ALIVE LOG
setInterval(() => {
  console.log("Worker alive...")
}, 5000)
