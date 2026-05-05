import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPassword from "../../pages/ResetPassword";
import { renderWithRouter } from "../renderWithRouter";

describe("ResetPassword form validation", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows a password strength error for short passwords", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<ResetPassword />, {
      route: "/reset-password?token=test-token",
      path: "/reset-password",
    });

    const [passwordInput] = container.querySelectorAll('input[type="password"]');

    await user.type(passwordInput, "123");
    await user.tab();

    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
  });

  it("shows an error when the confirmation password does not match", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<ResetPassword />, {
      route: "/reset-password?token=test-token",
      path: "/reset-password",
    });

    const [passwordInput, confirmInput] = container.querySelectorAll('input[type="password"]');

    await user.type(passwordInput, "Password123");
    await user.type(confirmInput, "Password321");
    await user.tab();

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });
});
