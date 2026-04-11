import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateScript(topic: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a YouTube script writer"
      },
      {
        role: "user",
        content: `Write a 5 minute YouTube script about ${topic}`
      }
    ]
  })

  return res.choices[0].message.content
}
