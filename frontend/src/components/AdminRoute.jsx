import { Navigate, useLocation } from "react-router-dom";
import { getStoredUser } from "../api";

/**
 * Only users with role === 'admin' can access. Otherwise redirect to /home.
 * Requires ProtectedRoute (login) first, so use: <ProtectedRoute><AdminRoute>...</AdminRoute></ProtectedRoute>
 */
export default function AdminRoute({ children }) {
  const location = useLocation();
  let role = "";
  try {
    const user = getStoredUser();
    role = user?.role || "";
  } catch (_) {}

  if (role !== "admin" && role !== "moderator") {
    return <Navigate to="/home" replace state={{ from: location }} />;
  }
  return children;
}
