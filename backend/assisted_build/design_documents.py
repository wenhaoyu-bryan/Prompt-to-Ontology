"""Bounded Markdown evidence supplied with a DDL schema design."""

import hashlib
import re
from pathlib import Path


MAX_DOCUMENTS = 3
MAX_DOCUMENT_BYTES = 12 * 1024
MAX_TOTAL_BYTES = 24 * 1024
MAX_TOTAL_LINES = 600
HEADING = re.compile(r"^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$")


def document_lines(content):
    return content.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def prepare_documents(documents):
    if not isinstance(documents, list) or len(documents) > MAX_DOCUMENTS:
        raise ValueError("Use at most three Markdown reference documents")
    prepared = []
    total_bytes = total_lines = 0
    for index, document in enumerate(documents, 1):
        if not isinstance(document, dict):
            raise ValueError("Invalid reference document")
        name, content = document.get("name"), document.get("content")
        if (not isinstance(name, str) or not 1 <= len(name) <= 160
            or Path(name).suffix.lower() != ".md" or not isinstance(content, str)
            or not content.strip() or "\x00" in content):
            raise ValueError("Provide a nonempty UTF-8 Markdown (.md) document")
        try:
            raw = content.encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("Reference documents must be UTF-8 text") from None
        if len(raw) > MAX_DOCUMENT_BYTES:
            raise ValueError("Each Markdown document must be at most 12 KiB")
        line_count = len(document_lines(content))
        total_bytes += len(raw)
        total_lines += line_count
        if total_bytes > MAX_TOTAL_BYTES or total_lines > MAX_TOTAL_LINES:
            raise ValueError("Markdown documents must total at most 24 KiB and 600 lines")
        prepared.append({
            "id": f"doc-{index}", "name": Path(name).name, "content": content,
            "content_hash": hashlib.sha256(raw).hexdigest(), "line_count": line_count,
        })
    return prepared


def checked_citation(citation, documents):
    if not isinstance(citation, dict) or set(citation) != {"document_id", "start_line", "end_line", "quote"}:
        raise ValueError("Every document suggestion needs a citation")
    document_id = citation["document_id"]
    if not isinstance(document_id, str) or document_id not in documents:
        raise ValueError("Unknown cited document")
    document = documents[document_id]
    start, end, quote = citation["start_line"], citation["end_line"], citation["quote"]
    lines = document["lines"]
    if (type(start) is not int or type(end) is not int
        or not 1 <= start <= end <= len(lines) or end - start >= 10
        or not isinstance(quote, str) or not quote.strip() or len(quote) > 2000
        or quote != "\n".join(lines[start - 1:end])):
        raise ValueError("Citation must match the original document lines")
    heading = ""
    for line in reversed(lines[:start]):
        match = HEADING.match(line.lstrip("\ufeff"))
        if match:
            heading = match[1][:160]
            break
    return {**citation, "name": document["name"], "heading": heading}
