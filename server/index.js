import express from "express"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())

// ✅ Serve frontend (index.html from root folder)

app.use(express.static("public"))

app.get("/", (req, res) => {
  res.sendFile(path.resolve("public/index.html"))
})

// ✅ MAIN API (Frontend → Worker)
app.post("/api/autopilot", async (req, res) => {
  try {
    const topic = req.body.topic || "Success mindset"

    const response = await fetch(process.env.WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ topic })
    })

    app.get("/status/:id", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.json2video.com/v2/movies/${req.params.id}`,
      {
        headers: {
          "x-api-key": process.env.JSON2VIDEO_API_KEY
        }
      }
    )

    const data = await response.json()
    res.json(data)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
    
    const data = await response.json()

    res.json({
      success: true,
      data
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

// ✅ Start server
app.listen(process.env.PORT || 10000, () => {
  console.log("Server running 🚀")
})
