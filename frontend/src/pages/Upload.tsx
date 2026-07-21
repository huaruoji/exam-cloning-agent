import { useCallback, useEffect, useMemo, useState } from "react"
import { FileText, Loader2, RefreshCw, Upload as UploadIcon } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/Card"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { useToast } from "@/components/Toast"
import { api, type DocumentRecord, type JobRecord } from "@/lib/api"
import { useLanguage, type MessageKey } from "@/i18n"

const documentTypes: { value: string; label: MessageKey }[] = [
  { value: "past_exam", label: "docPastExam" },
  { value: "homework", label: "docHomework" },
  { value: "slides", label: "docSlides" },
  { value: "reference_pdf", label: "docReferencePdf" },
]

export function Upload() {
  const { selectedCourse, refreshCourses } = useLayoutContext()
  const { addToast } = useToast()
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState("past_exam")
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [uploadTab, setUploadTab] = useState<"pdf" | "text">("pdf")

  // Text upload state
  const [textTitle, setTextTitle] = useState("")
  const [textContent, setTextContent] = useState("")
  const [textUploading, setTextUploading] = useState(false)

  const loadMaterials = useCallback(async () => {
    if (!selectedCourse) return
    const results = await Promise.allSettled([
      api.listDocuments(selectedCourse.id),
      api.listJobs(selectedCourse.id),
    ])
    if (results[0].status === "fulfilled") {
      setDocuments(results[0].value.documents)
    } else {
      addToast("Failed to load documents", "error")
    }
    if (results[1].status === "fulfilled") {
      setJobs(results[1].value.jobs)
    } else {
      addToast("Failed to load jobs", "error")
    }
  }, [selectedCourse, addToast])

  useEffect(() => {
    if (!selectedCourse) {
      setDocuments([])
      setJobs([])
      return
    }
    loadMaterials().catch(() => {})
  }, [selectedCourse, loadMaterials])

  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === "queued" || job.status === "running"),
    [jobs]
  )

  useEffect(() => {
    if (!selectedCourse || activeJobs.length === 0) return
    const timer = window.setInterval(() => {
    loadMaterials().catch(() => {})
    }, 2000)
    return () => window.clearInterval(timer)
  }, [selectedCourse, activeJobs.length, loadMaterials])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.toLowerCase().endsWith(".pdf")) {
      setFile(dropped)
      setError("")
    } else {
      setError("Only PDF files are supported")
    }
  }, [])

  const handleUpload = async () => {
    if (!file || !selectedCourse) return
    setUploading(true)
    setError("")
    try {
      await api.upload({ file, courseId: selectedCourse.id, documentType })
      setFile(null)
      await refreshCourses()
      await loadMaterials()
      addToast("Upload queued for processing", "success")
    } catch (e: any) {
      setError(e.message || "Upload failed")
      addToast(e.message || "Upload failed", "error")
    } finally {
      setUploading(false)
    }
  }

  const handleTextUpload = async () => {
    if (!selectedCourse || !textTitle.trim() || !textContent.trim()) return
    setTextUploading(true)
    try {
      await api.uploadText({
        courseId: selectedCourse.id,
        documentType,
        title: textTitle.trim(),
        text: textContent.trim(),
      })
      setTextTitle("")
      setTextContent("")
      await refreshCourses()
      await loadMaterials()
      addToast("Text imported & queued", "success")
    } catch (e: any) {
      addToast(e.message || "Failed to import text", "error")
    } finally {
      setTextUploading(false)
    }
  }

  const handleRetry = async (jobId: string) => {
    try {
      await api.retryJob(jobId)
      addToast("Job queued for retry", "success")
      await loadMaterials()
    } catch (e: any) {
      addToast(e.message || "Failed to retry job", "error")
    }
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">{t("materials")}</h1>
        <p className="mt-2 text-sm text-slate-muted">{t("selectCourse")}</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">{t("materials")}</h1>
      <p className="mt-2 text-sm text-slate-muted">
        Upload PDFs or paste text into <span className="text-slate-ink">{selectedCourse.name}</span>. Parsing runs in the background and updates the course profile automatically.
      </p>

      <div className={`mt-8 grid gap-4 ${jobs.length ? "lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Import content</CardTitle>
              <div className="flex gap-1 rounded-lg border border-border bg-ivory p-0.5 text-xs">
                <button
                  onClick={() => setUploadTab("pdf")}
                  className={`rounded-md px-3 py-1.5 ${uploadTab === "pdf" ? "bg-coral/10 text-coral" : "text-slate-muted hover:text-slate-ink"}`}
                >
                  PDF
                </button>
                <button
                  onClick={() => setUploadTab("text")}
                  className={`rounded-md px-3 py-1.5 ${uploadTab === "text" ? "bg-coral/10 text-coral" : "text-slate-muted hover:text-slate-ink"}`}
                >
                  Paste text
                </button>
              </div>
            </div>
            <CardDescription>
              Tell the system whether this is a past exam, homework set, slides, or a reference problem set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-muted">{t("docType")}</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
              >
                {documentTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </div>

            {uploadTab === "pdf" ? (
              <>
                <div
                  className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                    dragOver ? "border-coral bg-coral/5" : "border-border bg-ivory"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <UploadIcon size={30} className="mx-auto mb-4 text-slate-muted" />
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <FileText size={16} className="text-coral" />
                      <span className="font-medium">{file.name}</span>
                      <button onClick={() => setFile(null)} className="text-xs text-slate-muted hover:text-danger">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-muted">Drag a PDF here, or browse from disk.</p>
                      <label className="mt-2 inline-block cursor-pointer text-sm text-coral hover:underline">
                        Browse files
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => {
                            const nextFile = e.target.files?.[0]
                            if (nextFile) setFile(nextFile)
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>

                {error && <p className="mt-3 text-sm text-danger">{error}</p>}

                <Button variant="coral" className="mt-4" disabled={!file || uploading} onClick={handleUpload}>
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Queue processing
                    </>
                  ) : (
                    "Upload & queue"
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Title</label>
                  <input
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="e.g. Chapter 3 notes"
                    className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-muted">Content (paste your text here)</label>
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    className="min-h-[200px] w-full rounded-xl border border-border bg-ivory px-4 py-3 text-sm outline-none"
                    placeholder="Paste the full text of the exam, homework, or reference material here..."
                  />
                </div>
                <Button variant="coral" className="mt-4" disabled={!textTitle.trim() || !textContent.trim() || textUploading} onClick={handleTextUpload}>
                  {textUploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Importing...
                    </>
                  ) : (
                    "Import & queue"
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {jobs.length > 0 && <Card>
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
            <CardDescription>Uploads are parsed asynchronously so you can keep working while the course profile builds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-border bg-ivory p-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium">{job.stage.replaceAll("_", " ")}</p>
                      <p className="text-xs text-slate-muted">{job.message}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.12em] text-slate-muted">{job.status}</span>
                      {job.status === "failed" && (
                        <button
                          onClick={() => handleRetry(job.id)}
                          className="rounded-lg p-1 text-slate-muted hover:bg-coral/10 hover:text-coral"
                          title="Retry this job"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-ivory-deep">
                    <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  {job.error && <p className="mt-2 text-xs text-danger">{job.error}</p>}
                </div>
              ))}
          </CardContent>
        </Card>}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Documents in this course</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-slate-muted">No materials uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {documents.map((document) => (
                <div key={document.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-ivory p-4 text-sm">
                  <div>
                    <p className="font-medium">{document.title}</p>
                    <p className="text-xs text-slate-muted">
                      {document.document_type.replaceAll("_", " ")} · {document.status}
                      {document.page_count ? ` · ${document.page_count} pages` : ""}
                    </p>
                    {document.detected_course_name && (
                      <p className="mt-1 text-xs text-slate-muted">Detected course name: {document.detected_course_name}</p>
                    )}
                  </div>
                  <p className="text-xs text-slate-muted">{new Date(document.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
