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
import Conversations from "./pages/Conversations";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 默认进入商品列表（公开） */}
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* 公开页面 */}
        <Route path="/home" element={<Home />} />
        <Route path="/products/:id" element={<ProductDetail />} />

        {/* 公开的认证相关页面 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* 需要登录 + 必须已验证邮箱 */}
        <Route
          path="/publish"
          element={
            <ProtectedRoute requireVerified>
              <PublishProduct />
            </ProtectedRoute>
          }
        />

        {/* Conversations list */}
        <Route
          path="/conversations"
          element={
            <ProtectedRoute>
              <Conversations />
            </ProtectedRoute>
          }
        />

        {/* Single chat with a user */}
        <Route
          path="/chat/:otherUserId"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        {/* 需要登录 */}
        <Route
          path="/me"
          element={
            <ProtectedRoute>
              <MeProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-products"
          element={
            <ProtectedRoute>
              <MyProducts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-products/:id/edit"
          element={
            <ProtectedRoute>
              <EditProduct />
            </ProtectedRoute>
          }
        />

        {/* 管理员 */}
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            </ProtectedRoute>
          }
        />

        {/* 兜底 */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;