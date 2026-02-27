import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  // 表单状态
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // 交互状态
  const [touched, setTouched] = useState({ email: false, password: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // 邮箱校验规则
  const emailRegex = /^[^\s@]+@[^\s@]+\.(ac\.uk|edu)$/i;

  const emailError = !email
    ? "Email is required"
    : !emailRegex.test(email)
      ? "Please use a university email (.ac.uk / .edu)"
      : "";

  const passwordError = !password
    ? "Password is required"
    : password.length < 6
      ? "Password must be at least 6 characters"
      : "";

  const isFormValid = !emailError && !passwordError;

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });

    if (!isFormValid) return;

    setIsSubmitting(true);

    // 🚀 现在是模拟登录成功
    // 后端对接时，把这段替换为真实 fetch / axios 请求
    setTimeout(() => {
      console.log("Login successful:", { email, password, rememberMe });

      // ✅ 写入 token（PrivateRoute 判断依据）
      localStorage.setItem("token", "mock-token");
      localStorage.setItem("user", JSON.stringify({ email }));

      setIsSubmitting(false);

      // ✅ 登录成功进入受保护主页
      navigate("/home");
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-12 w-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
          CampusTrade
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Sign in to access your campus marketplace
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                University Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur("email")}
                className={`w-full mt-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 transition
                  ${touched.email && emailError
                    ? "border-red-300 focus:ring-red-500"
                    : "border-gray-300 focus:ring-indigo-500"}
                `}
                placeholder="student@university.ac.uk"
              />
              {touched.email && emailError && (
                <p className="mt-2 text-sm text-red-600">{emailError}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur("password")}
                className={`w-full mt-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 transition
                  ${touched.password && passwordError
                    ? "border-red-300 focus:ring-red-500"
                    : "border-gray-300 focus:ring-indigo-500"}
                `}
                placeholder="••••••••"
              />
              {touched.password && passwordError && (
                <p className="mt-2 text-sm text-red-600">{passwordError}</p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mr-2"
                />
                Remember me
              </label>

              <button
                type="button"
                onClick={() => alert("Forgot Password feature coming soon")}
                className="text-indigo-600 hover:text-indigo-500"
              >
                Forgot your password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Register link */}
          <div className="mt-6 text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link
              to="/register"
              className="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}