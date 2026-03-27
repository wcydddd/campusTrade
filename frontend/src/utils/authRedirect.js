export function redirectToLogin(navigate, location, message = "Please log in first.") {
  if (typeof window !== "undefined") {
    const goToLogin = window.confirm(
      `${message}\n\nPress OK to go to Login, or Cancel to continue browsing.`,
    );
    if (!goToLogin) return;
  }

  const pathname = location?.pathname || "/home";
  const search = location?.search || "";

  navigate("/login", {
    state: { from: { pathname: `${pathname}${search}` } },
  });
}
