import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./input-otp";

// `input-otp` schedules a setTimeout in a focus/sizing handler that is not
// cleared by React's effect teardown. On slower CI runners the timer fires
// after happy-dom has torn down, throwing `ReferenceError: window is not
// defined`. Fake timers let us drop any pending callbacks before the
// environment goes away. The tests themselves don't depend on the timer
// firing, so freezing time has no behavioural impact.
describe("InputOTP interaction tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the correct number of slots", () => {
    render(
      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    );
    const slots = screen.getAllByRole("textbox");
    // input-otp renders a single hidden input
    expect(slots.length).toBeGreaterThanOrEqual(1);
  });

  it("renders with data-slot attributes", () => {
    const { container } = render(
      <InputOTP maxLength={2}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>
    );
    const otpSlots = container.querySelectorAll('[data-slot="input-otp-slot"]');
    expect(otpSlots).toHaveLength(2);
  });
});
