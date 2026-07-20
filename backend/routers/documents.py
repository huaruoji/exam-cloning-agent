from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from models.document import DocumentUpdate
from routers.deps import get_user_id
from services.store import documents_table

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def list_documents(course_id: str = Query(...), user_id: str = Depends(get_user_id)):
    documents = [
        d for d in documents_table.load()
        if d["course_id"] == course_id and d.get("user_id", "public") in (user_id, "public")
    ]
    documents.sort(key=lambda item: item["created_at"], reverse=True)
    return {"documents": documents}


@router.patch("/{document_id}")
async def update_document(document_id: str, payload: DocumentUpdate, user_id: str = Depends(get_user_id)):
    updated: dict = {}
    def do_update(documents):
        for document in documents:
            if document["id"] == document_id:
                if document.get("user_id", "public") not in (user_id, "public"):
                    raise HTTPException(status_code=403, detail="Not allowed")
                if payload.title is not None:
                    document["title"] = payload.title.strip()
                if payload.document_type is not None:
                    document["document_type"] = payload.document_type.value
                document["updated_at"] = datetime.now(timezone.utc).isoformat()
                updated.update(document)
                return
    documents_table.mutate(do_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Document not found")
    return updated
