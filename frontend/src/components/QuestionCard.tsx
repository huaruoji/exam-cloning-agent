import { useState } from "react"
import { Check, Pencil, Trash2, X } from "lucide-react"

import { MathRenderer } from "@/components/MathRenderer"
import { cn } from "@/lib/utils"

export interface QuestionData {
  id: string
  content: string
  question_type?: string
  difficulty?: string
  topic?: string
  source_type?: string
  options?: string[] | null
  answer?: string
  explanation?: string
}

interface QuestionCardProps {
  question: QuestionData
  /** Whether the card starts expanded (showing answer/explanation) */
  defaultExpanded?: boolean
  /** Allow inline topic editing */
  topicEditable?: boolean
  /** Show delete button */
  deletable?: boolean
  /** Called when delete is clicked */
  onDelete?: (id: string) => void
  /** Called when topic is changed */
  onTopicChange?: (id: string, topic: string) => void
  /** Extra elements below the question content but above answer (e.g. answer input) */
  children?: React.ReactNode
  /** Compact mode for review lists */
  compact?: boolean
}

const difficultyColors: Record<string, string> = {
  easy: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  hard: "bg-danger/10 text-danger",
}

export function QuestionCard({
  question,
  defaultExpanded = false,
  topicEditable = false,
  deletable = false,
  onDelete,
  onTopicChange,
  children,
  compact = false,
}: QuestionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState(question.topic || "")

  const saveTopic = () => {
    const t = topicDraft.trim()
    if (t && t !== question.topic && onTopicChange) {
      onTopicChange(question.id, t)
    }
    setEditingTopic(false)
  }

  const diffColor = difficultyColors[question.difficulty || ""] || "bg-ivory-deep text-slate-muted"

  return (
    <div className={cn("rounded-xl border border-border bg-ivory-card", !compact && "cursor-pointer")} onClick={() => !compact && setExpanded(!expanded)}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Meta badges */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              {question.difficulty && (
                <span className={cn("rounded px-2 py-0.5", diffColor)}>
                  {question.difficulty}
                </span>
              )}
              {question.question_type && (
                <span className="text-slate-muted">{question.question_type}</span>
              )}
              {question.source_type && question.source_type !== "generated" && (
                <>
                  <span className="text-slate-muted">·</span>
                  <span className="text-slate-muted">{question.source_type.replaceAll("_", " ")}</span>
                </>
              )}
              {question.source_type === "generated" && (
                <>
                  <span className="text-slate-muted">·</span>
                  <span className="text-coral">AI generated</span>
                </>
              )}

              {/* Topic — editable inline */}
              <span className="text-slate-muted">·</span>
              {editingTopic ? (
                <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveTopic()}
                    className="w-28 rounded border border-border bg-ivory px-1.5 py-0.5 text-xs outline-none"
                    autoFocus
                  />
                  <button onClick={(e) => { e.stopPropagation(); saveTopic() }} className="text-success"><Check size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingTopic(false) }} className="text-slate-muted"><X size={12} /></button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <span className="text-slate-muted">{question.topic || "unknown"}</span>
                  {topicEditable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTopic(true); setTopicDraft(question.topic || "") }}
                      className="text-slate-light hover:text-coral"
                      title="Edit topic"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </span>
              )}
            </div>

            {/* Question content */}
            <div className={compact ? "text-sm" : "line-clamp-2 text-sm"}>
              <MathRenderer content={question.content} />
            </div>
          </div>

          {/* Delete button */}
          {deletable && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(question.id) }}
              className="shrink-0 rounded-lg p-1.5 text-slate-muted hover:bg-danger/10 hover:text-danger"
              title="Remove this question"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {/* Options + answer + explanation (when expanded) */}
        {(expanded || compact) && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {/* MCQ options */}
            {question.options?.length ? (
              <div className="space-y-2">
                {question.options.map((opt, i) => (
                  <div key={i} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
                    <MathRenderer content={opt} />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Answer */}
            {question.answer && (
              <div className="rounded-lg bg-success/5 px-4 py-3">
                <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Answer</p>
                <div className="text-sm"><MathRenderer content={question.answer} /></div>
              </div>
            )}

            {/* Explanation */}
            {question.explanation && (
              <div className="rounded-lg bg-ivory px-4 py-3 text-sm">
                <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Explanation</p>
                <MathRenderer content={question.explanation} />
              </div>
            )}

            {/* Children (e.g. answer input, buttons) */}
            {children}
          </div>
        )}
      </div>
    </div>
  )
}