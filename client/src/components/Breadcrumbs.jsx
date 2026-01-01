import { useLocation, Link } from "react-router-dom";
import { FiHome } from "react-icons/fi";

const Breadcrumbs = () => {
  const location = useLocation();

  // Pecah URL menjadi array path
  const pathnames = location.pathname.split("/").filter((x) => x);

  // Map nama URL ke Label yang user-friendly
  const routeNameMap = {
    dashboard: "Overview",
    map: "Live Map",
    orders: "Order Monitor",
    chat: "Intervention",
    reports: "Laporan",
    settings: "Pengaturan",
    couriers: "Kurir",
  };

  return (
    <div className="text-sm breadcrumbs text-gray-500 p-0">
      <ul>
        {/* LEVEL 1: HOME */}
        <li>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 hover:text-[#f14c06] transition-colors"
          >
            <FiHome size={16} />
            {/* Teks Home disembunyikan di HP sangat kecil biar muat, muncul di Tablet+ */}
            <span className="hidden sm:inline font-medium">Home</span>
          </Link>
        </li>

        {/* LEVEL SELANJUTNYA (DINAMIS) */}
        {pathnames.map((value, index) => {
          // Jangan render 'dashboard' lagi karena sudah diwakili icon Home di atas
          if (value === "dashboard") return null;

          const to = `/${pathnames.slice(0, index + 1).join("/")}`;
          const isLast = index === pathnames.length - 1;
          const displayName = routeNameMap[value] || value; // Fallback ke nama asli

          return (
            <li key={to}>
              {isLast ? (
                // Jika halaman aktif saat ini (Teks Oranye & Tebal)
                <span className="font-bold text-[#f14c06] capitalize">{displayName}</span>
              ) : (
                // Jika masih parent path (Link bisa diklik)
                <Link to={to} className="hover:text-[#f14c06] capitalize transition-colors">
                  {displayName}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Breadcrumbs;
