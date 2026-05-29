import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { Dashboard } from "@/pages/Dashboard"
import { Upload } from "@/pages/Upload"
import { QuestionBank } from "@/pages/QuestionBank"
import { Practice } from "@/pages/Practice"
import { MockExam } from "@/pages/MockExam"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/questions" element={<QuestionBank />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/exam" element={<MockExam />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
