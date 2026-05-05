import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Register from "../../pages/Register";
import { renderWithRouter } from "../renderWithRouter";

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

describe("Register form validation", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows an error for an invalid university email", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Register />);

    await user.type(screen.getByPlaceholderText(/university email/i), "hacker@gmail.com");
    await user.type(screen.getByPlaceholderText(/pick a username/i), "alice");
    await user.type(screen.getByPlaceholderText(/at least 8 characters/i), "Password123");
    await user.type(screen.getByPlaceholderText(/re-enter your password/i), "Password123");
    await user.click(screen.getByRole("checkbox", { name: /agree to terms/i }));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/please use a university email/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows an error for a short password", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Register />);

    await user.type(screen.getByPlaceholderText(/university email/i), "student@uol.ac.uk");
    await user.type(screen.getByPlaceholderText(/pick a username/i), "alice");
    await user.type(screen.getByPlaceholderText(/at least 8 characters/i), "short");
    await user.type(screen.getByPlaceholderText(/re-enter your password/i), "short");
    await user.click(screen.getByRole("checkbox", { name: /agree to terms/i }));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires the email field before submission", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Register />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits a valid form and shows success feedback", async () => {
    const user = userEvent.setup();
    global.fetch.mockImplementation(() => mockJsonResponse({}));

    renderWithRouter(<Register />);

    await user.type(screen.getByPlaceholderText(/university email/i), "student@uol.ac.uk");
    await user.type(screen.getByPlaceholderText(/pick a username/i), "alice");
    await user.type(screen.getByPlaceholderText(/at least 8 characters/i), "Password123");
    await user.type(screen.getByPlaceholderText(/re-enter your password/i), "Password123");
    await user.click(screen.getByRole("checkbox", { name: /agree to terms/i }));
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/registered! please verify your email/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/register$/),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "student@uol.ac.uk",
          password: "Password123",
          username: "alice",
        }),
      }),
    );
  });
});
