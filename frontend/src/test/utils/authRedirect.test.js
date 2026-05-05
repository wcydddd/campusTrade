import { describe, expect, it, vi } from "vitest";
import { redirectToLogin } from "../../utils/authRedirect";

describe("redirectToLogin", () => {
  it("confirms and preserves the current path and search when navigating to login", () => {
    const navigate = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    redirectToLogin(
      navigate,
      { pathname: "/products/123", search: "?tab=details" },
      "Please log in first to buy this product.",
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      "Please log in first to buy this product.\n\nPress OK to go to Login, or Cancel to continue browsing.",
    );
    expect(navigate).toHaveBeenCalledWith("/login", {
      state: { from: { pathname: "/products/123?tab=details" } },
    });
  });

  it("does not navigate when the confirm dialog is cancelled", () => {
    const navigate = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    redirectToLogin(navigate, { pathname: "/publish", search: "" });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to /home when location is missing", () => {
    const navigate = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    redirectToLogin(navigate, null);

    expect(navigate).toHaveBeenCalledWith("/login", {
      state: { from: { pathname: "/home" } },
    });
  });
});
