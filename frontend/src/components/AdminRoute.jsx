import { Navigate, useLocation } from "react-router-dom";

/**
 * Only users with role === 'admin' can access. Otherwise redirect to /home.
 * Requires ProtectedRoute (login) first, so use: <ProtectedRoute><AdminRoute>...</AdminRoute></ProtectedRoute>
 */
export default function AdminRoute({ children }) {
  const location = useLocation();
  let role = "";
  try {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      role = user.role || "";
    }
  } catch (_) {}

  if (role !== "admin") {
    return <Navigate to="/home" replace state={{ from: location }} />;
  }
  return children;
}
