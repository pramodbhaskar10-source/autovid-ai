export const metadata = {
  title: "Autovid Pro",
  description: "Faceless YouTube Automation SaaS"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
