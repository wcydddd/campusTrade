import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPassword from "../../pages/ForgotPassword";
import { renderWithRouter } from "../renderWithRouter";

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

describe("ForgotPassword form validation", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("disables submission for an invalid email", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPassword />, { route: "/forgot-password", path: "/forgot-password" });

    const submitButton = screen.getByRole("button", { name: /send reset link/i });
    await user.type(screen.getByPlaceholderText(/student@university\.ac\.uk/i), "hacker@gmail.com");

    expect(submitButton).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows success feedback after a valid request", async () => {
    const user = userEvent.setup();
    global.fetch.mockImplementation(() => mockJsonResponse({}));

    renderWithRouter(<ForgotPassword />, { route: "/forgot-password", path: "/forgot-password" });

    await user.type(screen.getByPlaceholderText(/student@university\.ac\.uk/i), "student@uol.ac.uk");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/we've sent a password reset link/i),
    ).toBeInTheDocument();
  });
});
