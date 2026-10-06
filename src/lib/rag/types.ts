export interface TextbookRow {
  id: string;
  owner_id: string;
  title: string;
  subject_id: string | null;
  grade: number | null;
  storage_path: string | null;
  status: "pending" | "indexing" | "ready" | "error";
  status_error: string | null;
  page_count: number | null;
  chunk_count: number;
  visibility: "private" | "unlisted" | "public";
  created_at: string;
  updated_at: string;
}

export interface TextbookChunkMatch {
  id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  similarity: number;
}
