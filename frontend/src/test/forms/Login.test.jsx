import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "../../pages/Login";
import { renderWithRouter } from "../renderWithRouter";

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: async () => data,
  });
}

describe("Login form validation", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows required field errors for missing email and password", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<Login />, { route: "/login", path: "/login" });

    const emailInput = screen.getByPlaceholderText(/university email/i);
    const passwordInput = container.querySelector('input[type="password"]');

    await user.click(emailInput);
    await user.tab();
    await user.click(passwordInput);
    await user.tab();

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it("shows an error when the login API returns a failure", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<Login />, { route: "/login", path: "/login" });
    const passwordInput = container.querySelector('input[type="password"]');

    global.fetch.mockImplementation(() =>
      mockJsonResponse({ detail: "Invalid credentials" }, { ok: false, status: 401 }),
    );

    await user.type(screen.getByPlaceholderText(/university email/i), "student@uol.ac.uk");
    await user.type(passwordInput, "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the submit button disabled until the form is valid", async () => {
    const user = userEvent.setup();
    const { container } = renderWithRouter(<Login />, { route: "/login", path: "/login" });
    const passwordInput = container.querySelector('input[type="password"]');
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    expect(submitButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/university email/i), "student@uol.ac.uk");
    await user.type(passwordInput, "Password123");

    expect(submitButton).toBeEnabled();
  });
});
