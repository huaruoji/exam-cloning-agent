import { useState } from "react"
import { ArrowRight, CheckCircle, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card"
import { MathRenderer } from "@/components/MathRenderer"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export function Practice() {
  const { selectedCourse } = useLayoutContext()
  const [question, setQuestion] = useState<any>(null)
  const [source, setSource] = useState("")
  const [answer, setAnswer] = useState("")
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadNext = async () => {
    if (!selectedCourse) return
    setLoading(true)
    setResult(null)
    setAnswer("")
    setSelectedOption(null)
    try {
      const res = await api.getNextQuestion(selectedCourse.id)
      setQuestion(res.question)
      setSource(res.source)
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    if (!question || !selectedCourse) return
    const finalAnswer = question.question_type === "mcq" ? (selectedOption || "") : answer
    if (!finalAnswer.trim()) return

    setSubmitting(true)
    try {
      const res = await api.submitAnswer({
        courseId: selectedCourse.id,
        questionId: question.id,
        answer: finalAnswer,
      })
      setResult(res)
    } catch {
      setResult({ correct: false })
    } finally {
      setSubmitting(false)
    }
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Practice</h1>
        <p className="mt-2 text-sm text-slate-muted">Select a course to start adaptive practice.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Practice</h1>
      <p className="mt-2 text-sm text-slate-muted">
        Generate questions from the course profile for <span className="text-slate-ink">{selectedCourse.name}</span>.
      </p>

      {!question && !loading && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-sm text-slate-muted">Start an adaptive session based on weak topics and the current style profile.</p>
            <Button variant="coral" onClick={loadNext}>Start practice</Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <Loader2 size={24} className="mx-auto mb-3 animate-spin text-coral" />
            <p className="text-sm text-slate-muted">Building the next question...</p>
          </CardContent>
        </Card>
      )}

      {question && !loading && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2 text-xs">
              <span className={cn(
                "rounded px-2 py-0.5",
                question.difficulty === "easy" && "bg-success/10 text-success",
                question.difficulty === "medium" && "bg-warning/10 text-warning",
                question.difficulty === "hard" && "bg-danger/10 text-danger",
              )}>
                {question.difficulty}
              </span>
              <span className="text-slate-muted">{question.topic}</span>
              {source === "generated" && <span className="ml-auto text-coral">AI generated</span>}
            </div>
            <CardTitle className="mt-2 text-xl">
              <MathRenderer content={question.content} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {question.question_type === "mcq" && question.options?.length ? (
              <div className="mb-6 space-y-2">
                {question.options.map((option: string, index: number) => {
                  const isSelected = selectedOption === option
                  const isCorrect = result && option === question.answer
                  const isWrong = result && isSelected && !result.correct
                  return (
                    <button
                      key={index}
                      onClick={() => !result && setSelectedOption(option)}
                      disabled={!!result}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left text-sm transition-colors",
                        !result && isSelected && "border-coral bg-coral/5",
                        !result && !isSelected && "border-border hover:border-slate-muted",
                        isCorrect && "border-success bg-success/5",
                        isWrong && "border-danger bg-danger/5"
                      )}
                    >
                      <MathRenderer content={option} />
                    </button>
                  )
                })}
              </div>
            ) : !result ? (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="mb-4 min-h-[120px] w-full rounded-xl border border-border bg-ivory px-4 py-3 text-sm outline-none"
                placeholder="Type your answer..."
              />
            ) : null}

            {!result && (
              <Button variant="coral" onClick={submit} disabled={submitting || (!selectedOption && !answer.trim())}>
                {submitting ? <Loader2 size={16} className="animate-spin" /> : "Submit answer"}
              </Button>
            )}

            {result && (
              <div className={cn(
                "mt-5 rounded-xl border p-4",
                result.correct ? "border-success/20 bg-success/5" : "border-danger/20 bg-danger/5"
              )}>
                <div className="mb-2 flex items-center gap-2">
                  {result.correct ? <CheckCircle size={18} className="text-success" /> : <XCircle size={18} className="text-danger" />}
                  <span className="text-sm font-medium">{result.correct ? "Correct" : "Needs review"}</span>
                </div>
                {!result.correct && question.answer && (
                  <div className="mb-3 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Answer</p>
                    <MathRenderer content={question.answer} />
                  </div>
                )}
                {question.explanation && (
                  <div className="text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Explanation</p>
                    <MathRenderer content={question.explanation} />
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-muted">
                  Mastery {Math.round(result.mastery_score * 100)}% · Overall {Math.round(result.overall_accuracy * 100)}%
                </p>
              </div>
            )}

            {result && (
              <Button variant="outline" className="mt-4" onClick={loadNext}>
                Next question <ArrowRight size={16} />
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
