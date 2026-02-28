import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import PublishProduct from "./pages/PublishProduct";
import MyProducts from "./pages/MyProducts";
import EditProduct from "./pages/EditProduct";
import MeProfile from "./pages/MeProfile";
import AdminUsers from "./pages/AdminUsers";
import ChangePassword from "./pages/ChangePassword";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* 默认进入 login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 公开页面 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* 需要登录才能访问的页面 */}
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/publish" element={<ProtectedRoute><PublishProduct /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute><MeProfile /></ProtectedRoute>} />
        <Route path="/me/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute><AdminRoute><AdminUsers /></AdminRoute></ProtectedRoute>} />
        <Route path="/my-products" element={<ProtectedRoute><MyProducts /></ProtectedRoute>} />
        <Route path="/my-products/:id/edit" element={<ProtectedRoute><EditProduct /></ProtectedRoute>} />
        <Route path="/products/:id" element={<ProtectedRoute><ProductDetail /></ProtectedRoute>} />
        <Route path="/chat/:productId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />

        {/* 兜底 */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;