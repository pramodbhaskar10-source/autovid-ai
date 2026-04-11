import express from "express"
import axios from "axios"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000

// Create video using JSON2Video
app.post("/create-video", async (req, res) => {
  try {
    const { script } = req.body

    const response = await axios.post(
      "https://api.json2video.com/v2/movies",
      {
        scenes: [
          {
            elements: [
              {
                type: "text",
                text: script.substring(0, 200),
                style: {
                  fontSize: 48,
                  color: "#ffffff",
                  background: "#000000"
                }
              }
            ]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.JSON2VIDEO_API_KEY
        }
      }
    )

    res.json({
      success: true,
      video: response.data
    })

  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Worker running on ${PORT}`)
})
