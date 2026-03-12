import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createCustomIcon } from "../../utils/MapIcons";
import toast from "react-hot-toast";

const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.flyTo(center, zoom, {
        animate: true,
        duration: 1.5,
      });
    } else {
      toast.error("Koordinat tidak valid atau kurir baru pertama kali ditambahkan.");
    }
  }, [center, zoom, map]);
  return null;
};

const baseCampIcon = L.divIcon({
  html: `<div class="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white shadow-lg bg-amber-500 text-white font-bold text-sm">BC</div>`,
  className: "custom-leaflet-icon",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -45],
});

const CourierMap = ({ couriers, selectedCourier, onMarkerClick, baseCamp }) => {
  // Koordinat Default (Sumbawa Besar)
  const defaultCenter = [-8.504146, 117.428485];

  // Tentukan pusat peta: Jika ada yang dipilih, fokus ke dia. Jika tidak, default atau base camp.
  const mapCenter = selectedCourier
    ? [selectedCourier.lat, selectedCourier.lng]
    : baseCamp
    ? [baseCamp.lat, baseCamp.lng]
    : defaultCenter;

  const zoomLevel = selectedCourier ? 16 : baseCamp ? 13 : 12;

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-inner border border-gray-200 relative z-0">
      <MapContainer
        center={baseCamp ? [baseCamp.lat, baseCamp.lng] : defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater center={mapCenter} zoom={zoomLevel} />

        {baseCamp && (
          <>
            <Circle
              center={[baseCamp.lat, baseCamp.lng]}
              radius={baseCamp.radius_km * 1000}
              pathOptions={{
                color: "#d97706",
                fillColor: "#f59e0b",
                fillOpacity: 0.12,
                weight: 2,
              }}
            />
            <Marker position={[baseCamp.lat, baseCamp.lng]} icon={baseCampIcon}>
              <Popup>
                <span className="font-semibold">{baseCamp.label || "Base Camp"}</span>
                <br />
                <span className="text-xs text-gray-500">Radius {baseCamp.radius_km} km</span>
              </Popup>
            </Marker>
          </>
        )}

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
