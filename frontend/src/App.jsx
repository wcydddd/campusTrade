import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import SellerProfile from "./pages/SellerProfile";
import PublishProduct from "./pages/PublishProduct";
import MyProducts from "./pages/MyProducts";
import EditProduct from "./pages/EditProduct";
import MeProfile from "./pages/MeProfile";
import MyOrders from "./pages/MyOrders";
import OrderDetail from "./pages/OrderDetail";
import MyFavorites from "./pages/MyFavorites";
import RecentViewed from "./pages/RecentViewed";
import MyReviews from "./pages/MyReviews";
import AdminUsers from "./pages/AdminUsers";
import AdminProducts from "./pages/AdminProducts";
import AdminReports from "./pages/AdminReports";
import AdminReview from "./pages/AdminReview";
import ChangePassword from "./pages/ChangePassword";
import Chat from "./pages/Chat";
import Conversations from "./pages/Conversations";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

function PrivateRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}

function App() {
  const token = localStorage.getItem("token");

  return (
    <BrowserRouter>
      <Routes>
        {/* 默认进入商品列表，支持游客浏览 */}
        <Route path="/" element={<Navigate to="/home" replace />} />

        {/* 公共浏览页 */}
        <Route path="/home" element={<Home />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/seller/:sellerId" element={<SellerProfile />} />

        {/* 公开的认证相关页面 */}
        <Route path="/login" element={<Login />} />

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

        <Route
          path="/my-orders"
          element={
            <ProtectedRoute>
              <MyOrders />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:orderId"
          element={
            <ProtectedRoute>
              <OrderDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-favorites"
          element={
            <ProtectedRoute>
              <MyFavorites />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-reviews"
          element={
            <ProtectedRoute>
              <MyReviews />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recent-viewed"
          element={
            <ProtectedRoute>
              <RecentViewed />
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
        <Route
          path="/admin/products"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminProducts />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminReports />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/review"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminReview />
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
