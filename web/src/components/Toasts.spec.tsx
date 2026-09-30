import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Toasts, dismissUndoToast, showToast } from "./Toasts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("stacks notices, pauses expiry while interacting, and runs or dismisses undo", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("PointerEvent", MouseEvent);
  render(<Toasts />);
  const undo = vi.fn();
  act(() => {
    showToast("Copied");
    showToast("Moved", { label: "Undo", run: undo });
  });
  const stack = screen.getByRole("status");
  expect(stack.querySelectorAll(".toast-pill")).toHaveLength(2);
  fireEvent.pointerEnter(stack);
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.getByText("Copied")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(undo).toHaveBeenCalledOnce();
  expect(screen.queryByText("Moved")).toBeNull();
  fireEvent.pointerLeave(stack);
  act(() => vi.advanceTimersByTime(3400));
  expect(screen.queryByText("Copied")).toBeNull();

  act(() => showToast("Archived", { label: "Undo", run: undo }));
  const button = screen.getByRole("button", { name: "Undo" });
  act(() => button.focus());
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.getByText("Archived")).toBeTruthy();
  act(() => dismissUndoToast());
  expect(screen.queryByText("Archived")).toBeNull();
  expect(undo).toHaveBeenCalledOnce();

  act(() => showToast("Drag away"));
  const card = screen.getByText("Drag away").closest(".toast-pill") as HTMLElement;
  card.setPointerCapture = vi.fn();
  fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
  fireEvent.pointerUp(card, { clientX: 60, clientY: 0 });
  expect(screen.queryByText("Drag away")).toBeNull();
});
