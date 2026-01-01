import L from "leaflet";

// Kita akan menggunakan HTML/CSS murni untuk membuat icon agar performa tinggi
// dan mudah dikustomisasi warnanya via Tailwind logic.

export const createCustomIcon = (status) => {
  let colorClass = "";

  switch (status) {
    case "IDLE":
      colorClass = "bg-green-500 shadow-green-200";
      break;
    case "BUSY":
      colorClass = "bg-red-500 shadow-red-200";
      break;
    case "OFFLINE":
      colorClass = "bg-gray-400 shadow-gray-200";
      break;
    default:
      colorClass = "bg-blue-500 shadow-blue-200";
  }

  // HTML untuk Marker
  const iconHtml = `
    <div class="relative flex items-center justify-center w-10 h-10 rounded-full border-2 border-white shadow-lg ${colorClass} transition-transform hover:scale-110">
      <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="text-white w-5 h-5" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="3" width="15" height="13"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
      </svg>
      <span class="absolute -bottom-1 w-2 h-2 bg-white rotate-45"></span>
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: "custom-leaflet-icon", // Class kosong agar reset default style leaflet
    iconSize: [40, 40],
    iconAnchor: [20, 40], // Ujung bawah tengah
    popupAnchor: [0, -45],
  });
};
