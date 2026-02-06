import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const defaultCenter = [-6.201853, 106.786056];
const roundCoord = (v) => Math.round(v * 1e6) / 1e6;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// NOTE: Jangan set header "User-Agent" via fetch (diblock browser).

const createMarkerIcon = () =>
  L.divIcon({
    html: `<div style="width:24px;height:24px;background:#f14c06;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

async function searchAddress(query) {
  if (!query || query.trim().length < 3) return [];
  const q = encodeURIComponent(query.trim());
  const url = `${NOMINATIM_URL}?q=${q}&format=json&limit=5&countrycodes=id`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((item) => ({
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    display_name: item.display_name || "",
  }));
}

const MapClickHandler = ({ onLocationChange }) => {
  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;
      onLocationChange(roundCoord(lat), roundCoord(lng));
    },
  });
  return null;
};

const MapViewUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.flyTo(center, zoom ?? 17, { duration: 0.5 });
    }
  }, [center, zoom, map]);
  return null;
};

const OrderLocationMap = ({ latitude, longitude, initialAddress, onLocationChange, disabled }) => {
  const [addressInput, setAddressInput] = useState(initialAddress || "");
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const hasCoords = latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude);
  const position = hasCoords ? [Number(latitude), Number(longitude)] : null;

  useEffect(() => {
    if (initialAddress && typeof initialAddress === "string") setAddressInput((prev) => prev || initialAddress);
  }, [initialAddress]);

  const doSearch = useCallback(async () => {
    const q = addressInput.trim();
    if (q.length < 3) return;
    setIsSearching(true);
    setSuggestions([]);
    try {
      const results = await searchAddress(q);
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, [addressInput]);

  const handleSelectSuggestion = useCallback(
    (item) => {
      const lat = roundCoord(item.lat);
      const lon = roundCoord(item.lon);
      onLocationChange(lat, lon);
      setAddressInput(item.display_name || addressInput);
      setSuggestions([]);
    },
    [onLocationChange, addressInput]
  );

  const handleMapClick = useCallback(
    (lat, lng) => {
      if (disabled) return;
      onLocationChange(lat, lng);
    },
    [onLocationChange, disabled]
  );

  const center = position || defaultCenter;
  const zoom = position ? 17 : 12;

  return (
    <div className="space-y-4">
      {/* Blok pencarian di atas peta dengan z-index tinggi agar dropdown tidak tertutup Leaflet */}
      <div className="relative z-[1000]">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Alamat atau nama tempat</label>
        <div className="relative">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearch())}
            disabled={disabled}
            className="input input-bordered w-full rounded-xl h-11 text-sm pr-20"
            placeholder="Contoh: SMP 3 Kebumen, atau alamat lengkap"
          />
          <button
            type="button"
            onClick={doSearch}
            disabled={disabled || addressInput.trim().length < 3 || isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm bg-orange-500 border-none text-white rounded-lg"
          >
            {isSearching ? "..." : "Cari"}
          </button>
          {suggestions.length > 0 && (
            <ul className="absolute z-[1100] left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
              {suggestions.map((item, i) => (
                <li
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSuggestion(item)}
                  onKeyDown={(e) => e.key === "Enter" && handleSelectSuggestion(item)}
                  className="px-3 py-2.5 hover:bg-orange-50 cursor-pointer text-sm border-b border-gray-100 last:border-0 truncate"
                  title={item.display_name}
                >
                  {item.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">Ketik alamat lalu klik Cari, pilih dari daftar. Atau klik di peta untuk set titik.</p>
      </div>
      {/* Peta di bawah dengan z-index default agar tidak menutupi dropdown */}
      <div className="relative z-0 rounded-xl overflow-hidden border border-gray-200 shadow-inner bg-gray-100 h-[200px] sm:h-[220px] min-h-[160px]">
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={!disabled}
          className="h-full w-full rounded-xl"
          style={{ minHeight: 160 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewUpdater center={center} zoom={zoom} />
          {!disabled && <MapClickHandler onLocationChange={handleMapClick} />}
          {position && (
            <Marker
              position={position}
              icon={createMarkerIcon()}
              draggable={!disabled}
              eventHandlers={
                disabled
                  ? {}
                  : {
                      dragend: (e) => {
                        const { lat, lng } = e.target.getLatLng();
                        onLocationChange(roundCoord(lat), roundCoord(lng));
                      },
                    }
              }
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
};

export default OrderLocationMap;
