import { useCallback, useEffect, useState } from "react"
import { AlertCircle, ArrowRight, CheckCircle, Eye, Loader2, RefreshCw, SkipForward, XCircle } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardHeader } from "@/components/Card"
import { MathRenderer } from "@/components/MathRenderer"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { useToast } from "@/components/Toast"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const FORCED_TOPIC_KEY = "exam-cloner:practice-topic"

export function Practice() {
  const { selectedCourse } = useLayoutContext()
  const { addToast } = useToast()
  const [question, setQuestion] = useState<any>(null)
  const [source, setSource] = useState<string | null>("")
  const [answer, setAnswer] = useState("")
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [allowAi, setAllowAi] = useState(true)
  const [noQuestions, setNoQuestions] = useState(false)

  const loadNext = useCallback(async (forcedTopic?: string) => {
    if (!selectedCourse) return
    setLoading(true)
    setResult(null)
    setAnswer("")
    setSelectedOption(null)
    setRevealed(false)
    setNoQuestions(false)
    try {
      const topic = forcedTopic || localStorage.getItem(FORCED_TOPIC_KEY) || undefined
      if (topic) localStorage.removeItem(FORCED_TOPIC_KEY)
      const res = await api.getNextQuestion(selectedCourse.id, allowAi, topic)
      if (!res.question) {
        setNoQuestions(true)
        setQuestion(null)
        return
      }
      setQuestion(res.question)
      setSource(res.source)
    } catch (e: any) {
      addToast(e.message || "Failed to load question", "error")
    } finally {
      setLoading(false)
    }
  }, [selectedCourse, allowAi, addToast])

  // Auto-load a question when the course or AI toggle changes.
  useEffect(() => {
    if (selectedCourse) loadNext()
  }, [selectedCourse])

  const submitAction = async (action: "submit" | "reveal" | "next") => {
    if (!question || !selectedCourse) return

    if (action === "next") {
      loadNext()
      return
    }

    const finalAnswer = question.question_type === "mcq" ? (selectedOption || "") : answer
    if (action === "submit" && !finalAnswer.trim()) return

    setSubmitting(true)
    try {
      const res = await api.submitAnswer({
        courseId: selectedCourse.id,
        questionId: question.id,
        answer: finalAnswer,
        action,
      })
      setResult(res)
      if (action === "reveal") setRevealed(true)
    } catch (e: any) {
      addToast(e.message || "Submission failed", "error")
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Practice</h1>
          <p className="mt-2 text-sm text-slate-muted">
            Adaptive practice for <span className="text-slate-ink">{selectedCourse.name}</span>.
          </p>
        </div>

        {/* AI toggle */}
        <label className="flex items-center gap-2 text-sm text-slate-muted">
          <input
            type="checkbox"
            checked={allowAi}
            onChange={() => setAllowAi((v) => !v)}
            className="h-4 w-4 rounded border-border accent-coral"
          />
          Allow AI-generated questions
        </label>
      </div>

      {noQuestions && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-muted">
              {allowAi
                ? "No questions available for this course."
                : "No bank questions match. Enable AI-generated questions or upload more materials."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => loadNext()}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <Loader2 size={24} className="mx-auto mb-3 animate-spin text-coral" />
            <p className="text-sm text-slate-muted">Loading next question...</p>
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
              <span className="text-slate-muted">{question.question_type}</span>
              <span className="text-slate-muted">·</span>
              <span className="text-slate-muted">{question.topic}</span>
              {source === "generated" && <span className="ml-auto text-coral">AI generated</span>}
            </div>
            <div className="mt-2 text-base leading-relaxed">
              <MathRenderer content={question.content} />
            </div>
          </CardHeader>
          <CardContent>
            {/* MCQ options */}
            {question.question_type === "mcq" && question.options?.length ? (
              <div className="mb-6 space-y-2">
                {question.options.map((option: string, index: number) => {
                  const isSelected = selectedOption === option
                  const isCorrect = result && !result.grading_failed && String.fromCharCode(65 + index) === (question.answer || "").toUpperCase()
                  const isWrong = result && !result.grading_failed && isSelected && result.correct === false
                  return (
                    <button
                      key={index}
                      onClick={() => !result && !revealed && setSelectedOption(option)}
                      disabled={!!result || revealed}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left text-sm transition-colors",
                        !result && !revealed && isSelected && "border-coral bg-coral/5",
                        !result && !revealed && !isSelected && "border-border hover:border-slate-muted",
                        isCorrect && "border-success bg-success/5",
                        isWrong && "border-danger bg-danger/5"
                      )}
                    >
                      <MathRenderer content={option} />
                    </button>
                  )
                })}
              </div>
            ) : !result && !revealed ? (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="mb-4 min-h-[120px] w-full rounded-xl border border-border bg-ivory px-4 py-3 text-sm outline-none"
                placeholder="Type your answer..."
              />
            ) : null}

            {/* Action buttons */}
            {!result && !revealed && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="coral" onClick={() => submitAction("submit")}
                  disabled={submitting || (!selectedOption && !answer.trim())}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : "Submit"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => submitAction("reveal")} disabled={submitting}>
                  <Eye size={14} /> Show answer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => submitAction("next")} disabled={submitting}>
                  <SkipForward size={14} /> Next
                </Button>
              </div>
            )}

            {/* Result / reveal display */}
            {(result || revealed) && (
              <div className={cn(
                "mt-5 rounded-xl border p-4",
                revealed ? "border-border bg-ivory"
                : result?.grading_failed ? "border-warning/20 bg-warning/5"
                : result?.correct ? "border-success/20 bg-success/5"
                : "border-danger/20 bg-danger/5"
              )}>
                <div className="mb-2 flex items-center gap-2">
                  {revealed ? (
                    <Eye size={18} className="text-slate-muted" />
                  ) : result?.grading_failed ? (
                    <AlertCircle size={18} className="text-warning" />
                  ) : result?.correct ? (
                    <CheckCircle size={18} className="text-success" />
                  ) : (
                    <XCircle size={18} className="text-danger" />
                  )}
                  <span className="text-sm font-medium">
                    {result?.grading_failed ? "Grading unavailable" : revealed ? "Answer" : result?.correct ? "Correct" : "Needs review"}
                  </span>
                </div>

                {result?.feedback && (
                  <div className="mb-3 rounded-lg bg-ivory px-3 py-2 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Feedback</p>
                    <p>{result.feedback}</p>
                  </div>
                )}

                {/* Structured feedback */}
                {result && !result.correct && result.missing_steps?.length > 0 && (
                  <div className="mb-3 rounded-lg bg-ivory px-3 py-2 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Missing steps</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {result.missing_steps.map((step: string, i: number) => (
                        <li key={i} className="text-sm">{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result && !result.correct && result.wrong_concepts?.length > 0 && (
                  <div className="mb-3 rounded-lg bg-ivory px-3 py-2 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Watch out for</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {result.wrong_concepts.map((concept: string, i: number) => (
                        <li key={i} className="text-sm">{concept}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result && !result.correct && result.suggestion && (
                  <div className="mb-3 rounded-lg bg-ivory px-3 py-2 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Suggestion</p>
                    <p className="italic">{result.suggestion}</p>
                  </div>
                )}

                {question.answer && (revealed || (!result?.correct && result?.correct_answer)) && (
                  <div className="mb-3 text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">
                      {revealed ? "Answer" : "Expected answer"}
                    </p>
                    <MathRenderer content={question.answer} />
                  </div>
                )}
                {question.explanation && (revealed || result) && (
                  <div className="text-sm">
                    <p className="mb-1 text-xs uppercase tracking-[0.14em] text-slate-muted">Explanation</p>
                    <MathRenderer content={question.explanation} />
                  </div>
                )}
                {result && !revealed && (
                  <p className="mt-3 text-xs text-slate-muted">
                    Mastery {Math.round((result.mastery_score ?? 0.5) * 100)}% · Overall {Math.round((result.overall_accuracy ?? 0) * 100)}%
                  </p>
                )}
              </div>
            )}

            {(result || revealed) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {result?.grading_failed && (
                  <Button variant="outline" onClick={() => submitAction("submit")} disabled={submitting}>
                    <RefreshCw size={14} /> Retry grading
                  </Button>
                )}
                {result && !result.correct && question.topic && (
                  <Button variant="outline" onClick={() => loadNext(question.topic)}>
                    <RefreshCw size={14} /> Practice another "{question.topic}" question
                  </Button>
                )}
                <Button variant="outline" onClick={() => loadNext()}>
                  Next question <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
