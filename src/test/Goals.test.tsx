// src/test/Goals.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";

// ── Mock toast ────────────────────────────────────────────────────────────────
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Mock API client with sample progress data ─────────────────────────────────
vi.mock("@/lib/apiClient", () => ({
  get: vi.fn(() =>
    Promise.resolve({
      progress: {
        goal: 24,
        completed: 8,
        percentage: 33,
        year: 2026,
      },
    })
  ),
  post: vi.fn(() => Promise.resolve({})),
}));

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { _id: "u1", name: "Test" }, token: "tok" }),
  AuthProvider: ({ children }: any) => children,
}));

// ── Mock BookshelfContext ─────────────────────────────────────────────────────
vi.mock("@/contexts/BookshelfContext", () => ({
  useBookshelf: () => ({ entries: [], loadingShelf: false }),
  BookshelfProvider: ({ children }: any) => children,
}));

import Goals from "@/pages/Goals";

const wrap = (ui: React.ReactElement) => (
  <ThemeProvider>
    <MemoryRouter>{ui}</MemoryRouter>
  </ThemeProvider>
);

describe("Goals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page heading", async () => {
    render(wrap(<Goals />));
    await waitFor(() => {
      expect(screen.getByText("Reading Goals")).toBeInTheDocument();
    });
  });

  it("shows books read count (8/24) from API", async () => {
    render(wrap(<Goals />));
    await waitFor(() => {
      expect(screen.getByText("8/24")).toBeInTheDocument();
    });
  });

  it("renders the milestone section", async () => {
    render(wrap(<Goals />));
    await waitFor(() => {
      expect(screen.getByText("Milestones")).toBeInTheDocument();
    });
  });

  it("renders the Save Goal button", async () => {
    render(wrap(<Goals />));
    await waitFor(() => {
      expect(screen.getByText("Save Goal")).toBeInTheDocument();
    });
  });

  it("renders the Update Yearly Goal section", async () => {
    render(wrap(<Goals />));
    await waitFor(() => {
      expect(screen.getByText("Update Yearly Goal")).toBeInTheDocument();
    });
  });
});
