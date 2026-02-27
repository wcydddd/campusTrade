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

        {/* 默认进入 login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* 主页 */}
        <Route path="/home" element={<Home />} />

        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/chat/:productId" element={<Chat />} />

        {/* 兜底 */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;