import axios from "axios"
import express from "express"

const app = express()
app.use(express.json())

// Health check
app.get("/", (req, res) => {
  res.send("Worker running ✅")
})

// MAIN WORKER API
app.post("/", async (req, res) => {
  try {
    const topic = req.body.topic || "Success mindset"

    const cleanScript = topic
      .replace(/\*\*/g, "")
      .replace(/\n/g, " ")
      .substring(0, 120)

    const response = await axios.post(
      "https://api.json2video.com/v2/movies",
      {
        scenes: [
          {
            elements: [
              {
                type: "text",
                text: cleanScript,
                style: "headline",
                duration: 6
              }
            ]
          }
        ]
      },
      {
        headers: {
          "x-api-key": process.env.JSON2VIDEO_API_KEY,
          "Content-Type": "application/json"
        }
      }
    )

    // ✅ IMPORTANT PART (you were missing this)
    res.json({
      success: true,
      project: response.data.project
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

// Keep alive
setInterval(() => {
  console.log("Worker alive...")
}, 5000)

app.listen(10000, () => {
  console.log("Worker server running on port 10000")
})
