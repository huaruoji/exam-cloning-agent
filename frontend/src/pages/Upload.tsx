import { useCallback, useEffect, useMemo, useState } from "react"
import { FileText, Loader2, Upload as UploadIcon } from "lucide-react"

import { Button } from "@/components/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/Card"
import { useLayoutContext } from "@/hooks/useLayoutContext"
import { api, type DocumentRecord, type JobRecord } from "@/lib/api"

const documentTypes = [
  { value: "past_exam", label: "Past exam" },
  { value: "homework", label: "Written homework" },
  { value: "slides", label: "Slides / lecture notes" },
  { value: "reference_pdf", label: "Reference PDF" },
]

export function Upload() {
  const { selectedCourse, refreshCourses } = useLayoutContext()
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState("past_exam")
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])

  const loadMaterials = useCallback(async () => {
    if (!selectedCourse) return
    const [docs, jobRes] = await Promise.all([
      api.listDocuments(selectedCourse.id),
      api.listJobs(selectedCourse.id),
    ])
    setDocuments(docs.documents)
    setJobs(jobRes.jobs)
  }, [selectedCourse])

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
    } catch (e: any) {
      setError(e.message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  if (!selectedCourse) {
    return (
      <div>
        <h1 className="font-serif text-3xl">Materials</h1>
        <p className="mt-2 text-sm text-slate-muted">Select a course first, then upload exams, homework, slides, or reference PDFs.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Materials</h1>
      <p className="mt-2 text-sm text-slate-muted">
        Upload PDFs into <span className="text-slate-ink">{selectedCourse.name}</span>. Parsing runs in the background and updates the course profile automatically.
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upload a PDF</CardTitle>
            <CardDescription>
              Tell the system whether this is a past exam, homework set, slides, or a reference problem set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-muted">Document type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-border bg-ivory px-3 py-2 text-sm outline-none"
              >
                {documentTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
            <CardDescription>Uploads are parsed asynchronously so you can keep working while the course profile builds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.length === 0 ? (
              <p className="text-sm text-slate-muted">No jobs yet.</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-border bg-ivory p-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium">{job.stage.replaceAll("_", " ")}</p>
                      <p className="text-xs text-slate-muted">{job.message}</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.12em] text-slate-muted">{job.status}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-ivory-deep">
                    <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  {job.error && <p className="mt-2 text-xs text-danger">{job.error}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
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
