import AppError from "../utils/AppError.js";

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // PROTEKSI: Cek apakah req.user ada?
    // Jika verifyToken belum jalan atau gagal, req.user akan undefined.
    if (!req.user || !req.user.role) {
      return next(new AppError("Anda belum login atau sesi habis. Silakan login kembali.", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError("Anda tidak memiliki izin (Role Access) untuk aksi ini.", 403));
    }
    next();
  };
};
