/**
 * src/contexts/BookshelfContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the user's bookshelf by calling the real backend API.
 * All state updates are optimistic: the UI updates immediately, then
 * the API call completes in the background.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { get, post, put, del } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

const BookshelfContext = createContext(undefined);

// Map frontend shelf names → API shelf names
const SHELF_MAP = { want: "wantToRead", reading: "reading", completed: "completed" };
const SHELF_MAP_REVERSE = { wantToRead: "want", reading: "reading", completed: "completed" };

export function BookshelfProvider({ children }) {
  const { user } = useAuth();

  // bookshelf shape: { wantToRead: [{book, addedAt}], reading: [...], completed: [...] }
  const [bookshelf, setBookshelf] = useState({ wantToRead: [], reading: [], completed: [] });
  const [loadingShelf, setLoadingShelf] = useState(false);

  // ── Fetch shelf from API whenever user changes ─────────────────────────────
  useEffect(() => {
    if (!user) { setBookshelf({ wantToRead: [], reading: [], completed: [] }); return; }
    setLoadingShelf(true);
    get("/bookshelf")
      .then((data) => setBookshelf(data.bookshelf))
      .catch(console.error)
      .finally(() => setLoadingShelf(false));
  }, [user]);

  // ── getStatus — returns 'want' | 'reading' | 'completed' | null ───────────
  const getStatus = useCallback((bookId) => {
    const id = String(bookId);
    // A book added from Google Books is stored in MongoDB with a new _id,
    // but its googleBooksId field retains the original volume ID.
    // We must match against BOTH so shelf state stays in sync.
    const matches = (e) => {
      const book = e.book;
      const mongoId = String(book?._id ?? book);
      const gBookId = book?.googleBooksId ? String(book.googleBooksId) : null;
      return mongoId === id || gBookId === id;
    };
    if (bookshelf.wantToRead?.some(matches)) return "want";
    if (bookshelf.reading?.some(matches)) return "reading";
    if (bookshelf.completed?.some(matches)) return "completed";
    return null;
  }, [bookshelf]);

  // ── setBookStatus — add, move, or remove a book from the shelf ───────────
  const setBookStatus = useCallback(async (bookId, newStatus) => {
    const apiShelf = newStatus ? SHELF_MAP[newStatus] : null;
    const currentStatus = getStatus(bookId);
    const currentApiShelf = currentStatus ? SHELF_MAP[currentStatus] : null;

    try {
      if (!newStatus) {
        // Remove from current shelf
        if (currentApiShelf) {
          await del(`/bookshelf/${bookId}?shelf=${currentApiShelf}`);
        }
      } else if (!currentStatus) {
        // Not on any shelf → add to WantToRead first
        await post(`/bookshelf/${bookId}`);
        // If target is not wantToRead, move immediately
        if (apiShelf !== "wantToRead") {
          await put(`/bookshelf/${bookId}/move`, { from: "wantToRead", to: apiShelf });
        }
      } else if (currentStatus !== newStatus) {
        // Move between shelves
        await put(`/bookshelf/${bookId}/move`, { from: currentApiShelf, to: apiShelf });
      }
      // Refresh shelf from server
      const data = await get("/bookshelf");
      setBookshelf(data.bookshelf);
    } catch (err) {
      console.error("Bookshelf update failed:", err.message);
      throw err;
    }
  }, [getStatus]);

  // ── entries — flat array matching old BookshelfContext shape ──────────────
  const entries = [
    ...(bookshelf.wantToRead || []).map((e) => ({ bookId: String(e.book?._id ?? e.book), googleBooksId: e.book?.googleBooksId ?? null, status: "want", book: e.book, addedAt: e.addedAt })),
    ...(bookshelf.reading || []).map((e) => ({ bookId: String(e.book?._id ?? e.book), googleBooksId: e.book?.googleBooksId ?? null, status: "reading", book: e.book, addedAt: e.addedAt })),
    ...(bookshelf.completed || []).map((e) => ({ bookId: String(e.book?._id ?? e.book), googleBooksId: e.book?.googleBooksId ?? null, status: "completed", book: e.book, addedAt: e.addedAt })),
  ];


  return (
    <BookshelfContext.Provider value={{ bookshelf, entries, loadingShelf, getStatus, setBookStatus }}>
      {children}
    </BookshelfContext.Provider>
  );
}

export function useBookshelf() {
  const context = useContext(BookshelfContext);
  if (!context) throw new Error("useBookshelf must be used within BookshelfProvider");
  return context;
}
