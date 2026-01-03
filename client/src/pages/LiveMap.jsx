import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCouriers } from "../features/courierSlice";
import { socket } from "../services/socketClient";

// --- COMPONENTS ---
import CourierMap from "../components/map/CourierMap";
import CourierListOverlay from "../components/map/CourierListOverlay";
import PageHeader from "../components/common/PageHeader";
import { FiMap } from "react-icons/fi";
import Loader from "../components/Loader";
import useDebounce from "../hooks/useDebounce";

const LiveMap = () => {
  const dispatch = useDispatch();
  const { isLoading } = useSelector((state) => state.courier);

  const [allMapData, setAllMapData] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper: Normalisasi Data
  const normalizeCourierData = (data) => {
    return data.map((c) => ({
      ...c,
      // Jika null, biarkan null. Jangan di-filter di sini.
      lat: c.lat || c.current_latitude || null,
      lng: c.lng || c.current_longitude || null,
    }));
  };

  const loadData = async (showLoading = true) => {
    if (showLoading) setIsRefreshing(true);
    try {
      const result = await dispatch(fetchCouriers({ page: 1, limit: 100, status: "ALL" })).unwrap();
      if (result && result.data) {
        setAllMapData(normalizeCourierData(result.data));
      }
    } catch (err) {
      console.error("Gagal load map data:", err);
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    if (!socket.connected) {
      socket.connect();
    }

    const handleLocationUpdate = (data) => {
      setAllMapData((prevData) => {
        const index = prevData.findIndex((c) => c.id === data.id);
        if (index !== -1) {
          const updatedList = [...prevData];
          updatedList[index] = {
            ...updatedList[index],
            lat: data.lat,
            lng: data.lng,
            last_active_at: data.updatedAt || new Date(),
            status: "BUSY",
          };
          return updatedList;
        } else {
          // Insert baru jika belum ada
          return [
            ...prevData,
            {
              id: data.id,
              name: data.name || "Kurir Baru",
              phone: data.phone || "",
              lat: data.lat,
              lng: data.lng,
              status: "BUSY",
              last_active_at: new Date(),
            },
          ];
        }
      });
    };

    socket.on("courier-location-update", handleLocationUpdate);

    return () => {
      socket.off("courier-location-update", handleLocationUpdate);
    };
  }, [dispatch]);

  // --- FILTERING LOGIC DIPERBAIKI ---
  const filteredCouriers = useMemo(() => {
    // JANGAN filter berdasarkan lat/lng di sini agar tetap muncul di list
    let result = allMapData;

    if (debouncedSearch) {
      const lowerSearch = debouncedSearch.toLowerCase();
      result = result.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(lowerSearch)) ||
          (c.phone && c.phone.includes(lowerSearch))
      );
    }
    return result;
  }, [allMapData, debouncedSearch]);

  // Siapkan data khusus untuk Map (Hanya yang punya Lat/Lng)
  const mapMarkers = useMemo(() => {
    return filteredCouriers.filter((c) => c.lat && c.lng);
  }, [filteredCouriers]);

  const handleSelectCourier = (courier) => {
    setSelectedCourier(courier);
  };

  const handleManualRefresh = () => {
    loadData(true);
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-4">
      <div className="flex-none hidden md:block">
        <PageHeader
          title="Live Tracking Armada"
          subtitle="Pemantauan lokasi kurir secara real-time via WhatsApp Live Location."
          icon={FiMap}
        />
      </div>

      <div className="flex-1 relative bg-gray-100 rounded-none md:rounded-2xl overflow-hidden shadow-sm border border-gray-200 -mx-4 md:mx-0 -mb-4 md:mb-0">
        {isLoading && allMapData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-50">
            <Loader type="block" />
          </div>
        ) : (
          <>
            {/* Map hanya menerima marker yang valid */}
            <CourierMap
              couriers={mapMarkers}
              selectedCourier={selectedCourier}
              onMarkerClick={handleSelectCourier}
            />
            {/* List Overlay menerima SEMUA data (termasuk yang lokasi null) */}
            <CourierListOverlay
              couriers={filteredCouriers}
              selectedId={selectedCourier?.id}
              onSelect={handleSelectCourier}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onRefresh={handleManualRefresh}
              isRefreshing={isRefreshing}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default LiveMap;
