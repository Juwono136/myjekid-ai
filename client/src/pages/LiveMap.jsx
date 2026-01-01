import React, { useEffect, useState, useRef, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCouriers } from "../features/courierSlice";
import CourierMap from "../components/map/CourierMap";
import CourierListOverlay from "../components/map/CourierListOverlay";
import PageHeader from "../components/common/PageHeader";
import { FiMap } from "react-icons/fi";
import Loader from "../components/Loader";
import useDebounce from "../hooks/useDebounce";

// --- Helper Mock Coordinates ---
const injectMockCoordinates = (data) => {
  return data.map((item) => ({
    ...item,
    // Koordinat acak disekitaran Jakarta (hanya dummy)
    // Nanti hapus ini jika backend sudah kirim lat/lng
    lat: item.lat || -6.1751 + (Math.random() - 0.5) * 0.05,
    lng: item.lng || 106.865 + (Math.random() - 0.5) * 0.05,
  }));
};

const LiveMap = () => {
  const dispatch = useDispatch();
  const { couriers, isLoading } = useSelector((state) => state.courier);

  // State Data Mentah (Semua Kurir)
  const [allMapData, setAllMapData] = useState([]);

  // State Seleksi & Search
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // FIX 1: Gunakan hasil debounce
  const debouncedSearch = useDebounce(searchTerm, 500);

  // Refresh State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef(null);

  // --- Fetch Data Function ---
  const loadData = async (showLoading = true) => {
    if (showLoading) setIsRefreshing(true);
    try {
      // Ambil 100 data agar map ramai
      await dispatch(fetchCouriers({ page: 1, limit: 100, status: "ALL" })).unwrap();
    } catch (err) {
      console.error("Gagal load map data:", err);
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  };

  // --- Initial Load & Polling ---
  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(() => {
      loadData(false); // Silent refresh
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [dispatch]);

  // --- Update Data with Mock Coords ---
  useEffect(() => {
    if (couriers.length > 0) {
      // Kita anggap couriers dari Redux adalah "Master Data"
      // Inject dummy coords jika belum ada
      const dataWithLoc = injectMockCoordinates(couriers);
      setAllMapData(dataWithLoc);
    }
  }, [couriers]);

  // FIX 2: Filtering Logic menggunakan Debounced Value
  // Memoize agar tidak kalkulasi ulang setiap render kecil
  const filteredCouriers = useMemo(() => {
    if (!debouncedSearch) return allMapData;

    const lowerSearch = debouncedSearch.toLowerCase();
    return allMapData.filter(
      (c) => c.name.toLowerCase().includes(lowerSearch) || c.phone.includes(lowerSearch)
    );
  }, [allMapData, debouncedSearch]);

  const handleSelectCourier = (courier) => {
    setSelectedCourier(courier);
  };

  const handleManualRefresh = () => {
    loadData(true);
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-4">
      {/* Header Desktop Only */}
      <div className="flex-none hidden md:block">
        <PageHeader
          title="Live Tracking Armada"
          subtitle="Pemantauan lokasi kurir secara real-time."
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
            {/* MAP Component */}
            {/* Kita kirim filteredCouriers ke Map agar marker ikut terfilter */}
            <CourierMap
              couriers={filteredCouriers}
              selectedCourier={selectedCourier}
              onMarkerClick={handleSelectCourier}
            />

            {/* OVERLAY Component */}
            <CourierListOverlay
              couriers={filteredCouriers} // Kirim data yang sudah difilter
              selectedId={selectedCourier?.id}
              onSelect={handleSelectCourier}
              // Search Input Control
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
