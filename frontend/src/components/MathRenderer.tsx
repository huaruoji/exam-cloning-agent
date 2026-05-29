import katex from "katex"
import "katex/dist/katex.min.css"

interface MathRendererProps {
  content: string
}

export function MathRenderer({ content }: MathRendererProps) {
  // Split content by LaTeX delimiters
  const parts: { type: "text" | "math-inline" | "math-display"; content: string }[] = []

  // Match display math ($$...$$) first, then inline math ($...$)
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\n]+?\$)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) })
    }

    const raw = match[0]
    if (raw.startsWith("$$")) {
      parts.push({ type: "math-display", content: raw.slice(2, -2).trim() })
    } else {
      parts.push({ type: "math-inline", content: raw.slice(1, -1).trim() })
    }
    lastIndex = match.index + raw.length
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) })
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.content}</span>
        }
        try {
          const html = katex.renderToString(part.content, {
            throwOnError: false,
            displayMode: part.type === "math-display",
          })
          return part.type === "math-display" ? (
            <div key={i} className="my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
          )
        } catch {
          return <code key={i}>{part.content}</code>
        }
      })}
    </>
  )
}
