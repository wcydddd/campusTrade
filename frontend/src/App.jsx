import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* 默认打开网站 -> 跳到 login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 认证相关 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* 主页面 */}
        <Route path="/home" element={<Home />} />

        {/* 其他页面 */}
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/chat/:productId" element={<Chat />} />

        {/* 未匹配路径统一回 login */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;