import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { Button } from "@/components/Button"
import { MathRenderer } from "@/components/MathRenderer"
import { cn } from "@/lib/utils"

const DIFFICULTY_COLORS = {
  easy: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  hard: "bg-danger/10 text-danger",
}

const TYPE_LABELS: Record<string, string> = {
  mcq: "Multiple Choice",
  short_answer: "Short Answer",
  calculation: "Calculation",
  true_false: "True / False",
  essay: "Essay",
}

export function QuestionBank() {
  const [questions, setQuestions] = useState<any[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [filterTopic, setFilterTopic] = useState("")
  const [filterDifficulty, setFilterDifficulty] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = () => {
    const filters: Record<string, string> = {}
    if (filterTopic) filters.topic = filterTopic
    if (filterDifficulty) filters.difficulty = filterDifficulty
    api.getQuestions(filters).then((r) => setQuestions(r.questions)).catch(() => {})
  }

  useEffect(() => {
    api.getTopics().then((r) => setTopics(r.topics)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [filterTopic, filterDifficulty])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Question Bank</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          className="h-9 rounded-md border border-border bg-ivory-card px-3 text-sm"
        >
          <option value="">All Topics</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          className="h-9 rounded-md border border-border bg-ivory-card px-3 text-sm"
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-sm text-slate-muted">
              No questions yet. Upload an exam PDF to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-muted">{questions.length} questions</p>
          {questions.map((q) => (
            <Card key={q.id} className="cursor-pointer" onClick={() => setExpanded(expanded === q.id ? null : q.id)}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-xs px-2 py-0.5 rounded", DIFFICULTY_COLORS[q.difficulty as keyof typeof DIFFICULTY_COLORS])}>
                        {q.difficulty}
                      </span>
                      <span className="text-xs text-slate-muted">
                        {TYPE_LABELS[q.question_type] || q.question_type}
                      </span>
                      <span className="text-xs text-slate-light">|</span>
                      <span className="text-xs text-slate-muted">{q.topic}</span>
                    </div>
                    <p className="text-sm line-clamp-2">
                      <MathRenderer content={q.content} />
                    </p>
                  </div>
                </div>

                {expanded === q.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    {q.options && (
                      <div className="mb-3 space-y-1">
                        {q.options.map((opt: string, i: number) => (
                          <p key={i} className="text-sm pl-4">
                            <MathRenderer content={opt} />
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="p-3 bg-success/5 rounded-md">
                      <p className="text-xs font-medium text-success mb-1">Answer</p>
                      <p className="text-sm"><MathRenderer content={q.answer} /></p>
                    </div>
                    {q.explanation && (
                      <div className="p-3 bg-ivory-warm rounded-md mt-2">
                        <p className="text-xs font-medium text-slate-muted mb-1">Explanation</p>
                        <p className="text-sm"><MathRenderer content={q.explanation} /></p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
