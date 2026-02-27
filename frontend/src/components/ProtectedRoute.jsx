import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token || (typeof token === "string" && token.trim() === "")) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
