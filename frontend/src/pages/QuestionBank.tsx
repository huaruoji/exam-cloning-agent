import { useEffect, useState } from "react"

import { Card, CardContent } from "@/components/Card"
import { MathRenderer } from "@/components/MathRenderer"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const difficultyColors = {
  easy: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  hard: "bg-danger/10 text-danger",
}

export function QuestionBank() {
  const { selectedCourse } = useLayoutContext()
  const [questions, setQuestions] = useState<any[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [topic, setTopic] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [sourceType, setSourceType] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCourse) return
    api.getTopics(selectedCourse.id).then((res) => setTopics(res.topics)).catch(() => setTopics([]))
  }, [selectedCourse])

  useEffect(() => {
    if (!selectedCourse) {
      setQuestions([])
      return
    }
    api
      .getQuestions({
        course_id: selectedCourse.id,
        ...(topic ? { topic } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(sourceType ? { source_type: sourceType } : {}),
      })
      .then((res) => setQuestions(res.questions))
      .catch(() => setQuestions([]))
  }, [selectedCourse, topic, difficulty, sourceType])

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Question Bank</h1>
        <p className="mt-2 text-sm text-slate-muted">Select a course to explore its parsed questions.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Question Bank</h1>
      <p className="mt-2 text-sm text-slate-muted">Inspect what was parsed from exams, homework, slides, and reference PDFs.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
          <option value="">All topics</option>
          {topics.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
          <option value="">All document types</option>
          <option value="past_exam">Past exam</option>
          <option value="homework">Written homework</option>
          <option value="slides">Slides</option>
          <option value="reference_pdf">Reference PDF</option>
        </select>
      </div>

      <div className="mt-6 space-y-3">
        {questions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-sm text-slate-muted">No questions match the current filters.</CardContent>
          </Card>
        ) : (
          questions.map((question) => (
            <Card key={question.id} className="cursor-pointer" onClick={() => setExpanded(expanded === question.id ? null : question.id)}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("rounded px-2 py-0.5", difficultyColors[question.difficulty as keyof typeof difficultyColors])}>
                        {question.difficulty}
                      </span>
                      <span className="text-slate-muted">{question.question_type}</span>
                      <span className="text-slate-muted">·</span>
                      <span className="text-slate-muted">{question.source_type?.replaceAll("_", " ")}</span>
                      <span className="text-slate-muted">·</span>
                      <span className="text-slate-muted">{question.topic}</span>
                    </div>
                    <div className="line-clamp-2 text-sm">
                      <MathRenderer content={question.content} />
                    </div>
                  </div>
                </div>

                {expanded === question.id && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    {question.options?.length ? (
                      <div className="space-y-2">
                        {question.options.map((option: string, index: number) => (
                          <div key={index} className="rounded-lg border border-border bg-ivory px-3 py-2 text-sm">
                            <MathRenderer content={option} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="rounded-lg bg-success/5 px-4 py-3">
                      <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Answer</p>
                      <div className="text-sm"><MathRenderer content={question.answer || "No answer extracted."} /></div>
                    </div>
                    {question.explanation && (
                      <div className="rounded-lg bg-ivory px-4 py-3 text-sm">
                        <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Explanation</p>
                        <MathRenderer content={question.explanation} />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
