// src/test/Dashboard.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";

// ── Mock API client so Dashboard doesn't make real HTTP calls ────────────────
vi.mock("@/lib/apiClient", () => ({
  get: vi.fn(() => Promise.resolve({ books: [], recommendations: [] })),
  post: vi.fn(() => Promise.resolve({})),
}));

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      _id: "u1",
      name: "Test User",
      personalityProfile: "Genres: Fiction, Mystery. Difficulty: Beginner.",
    },
  }),
  AuthProvider: ({ children }: any) => children,
}));

// ── Mock BookshelfContext ─────────────────────────────────────────────────────
vi.mock("@/contexts/BookshelfContext", () => ({
  useBookshelf: () => ({ entries: [], loadingShelf: false }),
  BookshelfProvider: ({ children }: any) => children,
}));

import Dashboard from "@/pages/Dashboard";

const wrap = (ui: React.ReactElement) => (
  <ThemeProvider>
    <MemoryRouter>{ui}</MemoryRouter>
  </ThemeProvider>
);

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 5 mood chips", () => {
    render(wrap(<Dashboard />));
    expect(screen.getByText(/Happy/)).toBeInTheDocument();
    expect(screen.getByText(/Thoughtful/)).toBeInTheDocument();
    expect(screen.getByText(/Adventurous/)).toBeInTheDocument();
    expect(screen.getByText(/Relaxing/)).toBeInTheDocument();
    expect(screen.getByText(/Intense/)).toBeInTheDocument();
  });

  it("renders the conversational search input", () => {
    render(wrap(<Dashboard />));
    const input = screen.getByPlaceholderText(/find me a short mystery/i);
    expect(input).toBeInTheDocument();
  });

  it("clicking a mood chip does not crash", () => {
    render(wrap(<Dashboard />));
    const happyChips = screen.getAllByText(/Happy/);
    fireEvent.click(happyChips[0]);
    expect(screen.getAllByText(/Happy/).length).toBeGreaterThan(0);
  });

  it("shows For You section when no search query is present", () => {
    render(wrap(<Dashboard />));
    expect(screen.getByText(/For You/i)).toBeInTheDocument();
  });
});
