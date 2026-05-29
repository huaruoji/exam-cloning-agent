from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from models.document import DocumentUpdate
from services.store import documents_table

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def list_documents(course_id: str = Query(...)):
    documents = [d for d in documents_table.load() if d["course_id"] == course_id]
    documents.sort(key=lambda item: item["created_at"], reverse=True)
    return {"documents": documents}


@router.patch("/{document_id}")
async def update_document(document_id: str, payload: DocumentUpdate):
    documents = documents_table.load()
    for document in documents:
        if document["id"] == document_id:
            if payload.title is not None:
                document["title"] = payload.title.strip()
            if payload.document_type is not None:
                document["document_type"] = payload.document_type.value
            document["updated_at"] = datetime.utcnow().isoformat()
            documents_table.save(documents)
            return document
    raise HTTPException(status_code=404, detail="Document not found")
