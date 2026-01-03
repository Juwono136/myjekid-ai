import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { createCustomIcon } from "../../utils/MapIcons";
import toast from "react-hot-toast";

// Komponen kecil untuk mengupdate view peta saat kurir dipilih
const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.flyTo(center, zoom, {
        animate: true,
        duration: 1.5, // Efek terbang yang halus
      });
    } else {
      toast.error("Maaf, koordinat tidak valid.");
    }
  }, [center, zoom, map, toast]);
  return null;
};

const CourierMap = ({ couriers, selectedCourier, onMarkerClick }) => {
  // Koordinat Default (Sumbawa besar)
  const defaultCenter = [-8.504146, 117.428485];

  // Tentukan pusat peta: Jika ada yang dipilih, fokus ke dia. Jika tidak, default.
  const mapCenter = selectedCourier ? [selectedCourier.lat, selectedCourier.lng] : defaultCenter;

  const zoomLevel = selectedCourier ? 16 : 12;

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-inner border border-gray-200 relative z-0">
      <MapContainer
        center={defaultCenter}
        zoom={15}
        scrollWheelZoom={true}
        className="h-full w-full"
        zoomControl={false} // Kita bisa buat custom zoom control nanti jika mau
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater center={mapCenter} zoom={zoomLevel} />

        {couriers.map((courier) => (
          <Marker
            key={courier.id}
            position={[courier.lat, courier.lng]}
            icon={createCustomIcon(courier.status)}
            eventHandlers={{
              click: () => onMarkerClick(courier),
            }}
          >
            <Popup className="custom-popup">
              <div className="p-1">
                <h3 className="font-bold text-gray-800">{courier.name}</h3>
                <p className="text-xs text-gray-500 mb-2">{courier.phone}</p>
                <span
                  className={`badge badge-sm text-white border-none ${
                    courier.status === "IDLE"
                      ? "badge-success"
                      : courier.status === "BUSY"
                      ? "badge-error"
                      : "badge-neutral"
                  }`}
                >
                  {courier.status}
                </span>
                <p className="text-[10px] text-gray-400 mt-2">
                  Update: {new Date().toLocaleTimeString()}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default CourierMap;
