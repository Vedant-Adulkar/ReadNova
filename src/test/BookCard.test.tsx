// src/test/BookCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookCard } from "@/components/BookCard";

const baseBook = {
  id: "abc123",
  _id: "abc123",
  title: "The Great Gatsby",
  author: "F. Scott Fitzgerald",
  rating: 4.2,
  reviewCount: 1500,
  genre: ["Literary Fiction"],
  difficulty: "Intermediate" as const,
  cover: "",
  description: "A novel about the American dream.",
};

const wrap = (ui: React.ReactElement) => (
  <MemoryRouter>{ui}</MemoryRouter>
);

describe("BookCard", () => {
  it("renders book title", () => {
    render(wrap(<BookCard book={baseBook} />));
    // There are two elements with the title (card text + hover overlay) — use getAllByText
    const titles = screen.getAllByText("The Great Gatsby");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("renders author", () => {
    render(wrap(<BookCard book={baseBook} />));
    expect(screen.getByText("F. Scott Fitzgerald")).toBeInTheDocument();
  });

  it("renders the difficulty badge", () => {
    render(wrap(<BookCard book={baseBook} />));
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
  });

  it("renders rating value", () => {
    render(wrap(<BookCard book={baseBook} />));
    // Rating appears in the main card area as a span
    const ratings = screen.getAllByText("4.2");
    expect(ratings.length).toBeGreaterThan(0);
  });

  it("shows AI explanation when showExplanation=true and aiExplanation is set", () => {
    const book = { ...baseBook, aiExplanation: "This suits your love of classics." };
    render(wrap(<BookCard book={book} showExplanation />));
    expect(screen.getByText(/This suits your love of classics/i)).toBeInTheDocument();
  });

  it("does NOT show AI section when aiExplanation is empty", () => {
    render(wrap(<BookCard book={{ ...baseBook, aiExplanation: "" }} showExplanation />));
    expect(screen.queryByText(/AI:/i)).not.toBeInTheDocument();
  });

  it("does NOT show AI section when showExplanation is false", () => {
    const book = { ...baseBook, aiExplanation: "Should not show" };
    render(wrap(<BookCard book={book} showExplanation={false} />));
    expect(screen.queryByText(/Should not show/i)).not.toBeInTheDocument();
  });
});
