import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../features/authSlice";
import toast from "react-hot-toast";
import logoImg from "../assets/logo.png";

import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight } from "react-icons/fi";
import { BiLoaderAlt } from "react-icons/bi";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, token } = useSelector((state) => state.auth);

  // Redirect jika sudah login
  useEffect(() => {
    if (token) navigate("/dashboard");
  }, [token, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error("Email dan Password wajib diisi!");
      return;
    }

    try {
      // Gunakan .unwrap() untuk memisahkan flow sukses dan gagal
      const resultAction = await dispatch(loginUser(formData)).unwrap();

      // SUKSES
      toast.success(`Selamat Datang, ${resultAction.data.name}!`);
      navigate("/dashboard");
    } catch (errPayload) {
      // GAGAL
      console.error("Login Error Payload:", errPayload);
      const errorMessage = errPayload?.message || "Login Gagal.";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-gray-50">
      <style>{`
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>

      {/* BACKGROUND GRADIENT & SHAPES */}
      <div className="absolute inset-0 w-full h-full bg-linear-to-br from-[#c73d06] via-[#d14306] to-[#f1b206] opacity-10 z-0"></div>

      {/* Decoration Circles */}
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-[#f14c06] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
      <div
        className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-[#f1b206] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"
        style={{ animationDelay: "2s" }}
      ></div>

      {/* MAIN CARD */}
      <div className="relative z-10 w-full max-w-4xl m-4 md:m-0 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-slide-up border border-white/20">
        {/* LEFT COLUMN: BRANDING (MyJek Colors) */}
        <div className="hidden md:flex md:w-1/2 bg-linear-to-br from-[#c73d06] to-[#f14c06] relative flex-col justify-center items-center text-white p-12">
          {/* Pattern Overlay */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20"></div>

          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Logo Placeholder */}
            <div className="bg-white text-[#c73d06] w-28 h-28 rounded-2xl flex items-center justify-center text-4xl font-black shadow-lg mb-6 rotate-3 hover:rotate-0 transition-all duration-300">
              <img src={logoImg} alt="logo-image" className="p-3" />
            </div>

            <h1 className="text-4xl font-bold mb-2 tracking-tight">MyJek Admin</h1>
            <p className="text-orange-100 font-light text-lg">Smart Delivery Automation</p>

            <div className="mt-10 px-6 py-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <p className="text-sm font-medium">
                "Kelola order dan kurir secara otomatis dengan Smart Chatbot"
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LOGIN FORM */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="text-center md:text-left mb-8">
            <h2 className="text-3xl font-bold text-orange-800">Selamat Datang</h2>
            <p className="text-gray-500 mt-2 text-sm">Masuk untuk mengakses dashboard kontrol</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* EMAIL INPUT */}
            <div className="form-control">
              <label className="label text-gray-700 font-semibold text-xs uppercase tracking-wide mb-1">
                Email Address
              </label>
              <div className="relative group">
                <div className="absolute z-10 inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[#f14c06] transition-colors">
                  <FiMail size={20} />
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="admin@myjek.com"
                  className="input w-full pl-12 py-6 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#f14c06] focus:ring-0 rounded-xl transition-all font-medium text-gray-600"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* PASSWORD INPUT */}
            <div className="form-control">
              <label className="label text-gray-700 font-semibold text-xs uppercase tracking-wide mb-1">
                Password
              </label>
              <div className="relative group">
                <div className="absolute z-10 inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[#f14c06] transition-colors">
                  <FiLock size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="*******"
                  className="input w-full pl-12 pr-12 py-6 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#f14c06] focus:ring-0 rounded-xl transition-all font-medium text-gray-600"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-[#f14c06] transition-colors cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
              {/* <div className="flex justify-end mt-2">
                <a
                  href="#"
                  className="text-xs font-semibold text-[#f14c06] hover:text-[#d14306] transition-colors"
                >
                  Lupa Password?
                </a>
              </div> */}
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="btn w-full mt-4 h-12 bg-[#f14c06] hover:bg-[#d14306] text-white border-none rounded-xl shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 text-base font-bold"
            >
              {loading ? (
                <>
                  <BiLoaderAlt className="animate-spin" size={20} />
                  Loading...
                </>
              ) : (
                <>
                  Masuk
                  <FiArrowRight />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              MyJek Admin System
              <br />
              &copy; {new Date().getFullYear()} All right reserved
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
