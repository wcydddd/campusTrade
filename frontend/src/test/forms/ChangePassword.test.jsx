import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePassword from "../../pages/ChangePassword";
import { renderWithRouter } from "../renderWithRouter";

describe("ChangePassword form validation", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("marks the current password as required", () => {
    const { container } = renderWithRouter(<ChangePassword />, {
      route: "/me/change-password",
      path: "/me/change-password",
    });

    const [currentPasswordInput] = container.querySelectorAll('input[type="password"]');
    expect(currentPasswordInput).toBeRequired();
    expect(currentPasswordInput.checkValidity()).toBe(false);
  });

  it("shows an error when the new password is too short", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<ChangePassword />, {
      route: "/me/change-password",
      path: "/me/change-password",
    });

    const [currentPasswordInput, newPasswordInput, confirmPasswordInput] =
      container.querySelectorAll('input[type="password"]');

    await user.type(currentPasswordInput, "OldPassword123");
    await user.type(newPasswordInput, "short");
    await user.type(confirmPasswordInput, "short");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/new password must be at least 8 characters/i)).toBeInTheDocument();
  });
});
