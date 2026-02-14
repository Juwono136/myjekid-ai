import { useEffect, useState, useRef } from "react";
import { FiPlus, FiTrash2, FiX, FiUser, FiChevronDown, FiMapPin } from "react-icons/fi";
import OrderLocationMap from "./OrderLocationMap.jsx";

const OrderAddModal = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  customers = [],
  isCustomersLoading,
}) => {
  const [formData, setFormData] = useState({
    selectedCustomer: null,
    searchQuery: "",
    customerName: "",
    pickup_address: "",
    delivery_address: "",
    latitude: null,
    longitude: null,
    pickup_latitude: null,
    pickup_longitude: null,
    items: [{ item: "", qty: 1, note: "" }],
    notesList: [""],
  });
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setFormData((prev) => ({
        ...prev,
        selectedCustomer: null,
        searchQuery: "",
        customerName: "",
        pickup_address: "",
        delivery_address: "",
        latitude: null,
        longitude: null,
        pickup_latitude: null,
        pickup_longitude: null,
        items: [{ item: "", qty: 1, note: "" }],
        notesList: [""],
      }));
      setShowCustomerDropdown(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizePhone = (raw) => {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits.length) return "";
    let p = digits.startsWith("0") ? digits.slice(1) : digits;
    if (!p.startsWith("62")) p = "62" + p;
    return p;
  };

  const filteredCustomers = formData.searchQuery
    ? customers.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(formData.searchQuery.toLowerCase()) ||
          (c.phone || "").replace(/\s/g, "").includes(formData.searchQuery.replace(/\s/g, ""))
      )
    : customers;

  const handleSelectCustomer = (c) => {
    setFormData((prev) => ({
      ...prev,
      selectedCustomer: { phone: c.phone, name: c.name || "" },
      searchQuery: "",
      customerName: c.name || "",
    }));
    setShowCustomerDropdown(false);
  };

  const clearSelectedCustomer = () => {
    setFormData((prev) => ({ ...prev, selectedCustomer: null, searchQuery: "" }));
    setShowCustomerDropdown(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSearchQueryChange = (value) => {
    setFormData((prev) => ({ ...prev, searchQuery: value }));
    setShowCustomerDropdown(true);
  };

  const updateItem = (index, key, value) => {
    setFormData((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [key]: value };
      return { ...prev, items };
    });
  };

  const addItemRow = () =>
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { item: "", qty: 1, note: "" }],
    }));

  const removeItemRow = (index) =>
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));

  const updateNote = (index, value) =>
    setFormData((prev) => {
      const list = [...prev.notesList];
      list[index] = value;
      return { ...prev, notesList: list };
    });
  const addNoteRow = () =>
    setFormData((prev) => ({ ...prev, notesList: [...prev.notesList, ""] }));
  const removeNoteRow = (index) =>
    setFormData((prev) => ({
      ...prev,
      notesList: prev.notesList.filter((_, i) => i !== index),
    }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const phone = formData.selectedCustomer?.phone || normalizePhone(formData.searchQuery);
    if (!phone || phone.length < 10) {
      return;
    }
    const payload = {
      user_phone: phone,
      customer_name: (formData.selectedCustomer?.name || formData.customerName || "").trim() || null,
      pickup_address: (formData.pickup_address || "").trim(),
      delivery_address: (formData.delivery_address || "").trim(),
      items_summary: formData.items
        .map((item) => ({
          item: (item.item || "").trim(),
          qty: Number(item.qty) || 1,
          note: (item.note || "").trim(),
        }))
        .filter((item) => item.item),
      order_notes: formData.notesList.map((line) => line.trim()).filter(Boolean),
    };
    if (formData.latitude != null && formData.longitude != null && !Number.isNaN(formData.latitude) && !Number.isNaN(formData.longitude)) {
      payload.latitude = formData.latitude;
      payload.longitude = formData.longitude;
    }
    if (formData.pickup_latitude != null && formData.pickup_longitude != null && !Number.isNaN(formData.pickup_latitude) && !Number.isNaN(formData.pickup_longitude)) {
      payload.pickup_latitude = formData.pickup_latitude;
      payload.pickup_longitude = formData.pickup_longitude;
    }
    onSubmit(payload);
  };

  if (!isOpen) return null;

  const submittedPhone = formData.selectedCustomer?.phone || normalizePhone(formData.searchQuery);
  const phoneValid = submittedPhone.length >= 10;
  const hasItems = formData.items.some((i) => (i.item || "").trim());
  const hasAddress = (formData.delivery_address || "").trim().length >= 3;

  return (
    <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="modal-box w-full max-w-4xl p-0 overflow-hidden rounded-2xl shadow-2xl relative max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-[#f14c06] to-[#e85a2a] px-4 sm:px-6 py-4 border-b border-orange-200 shrink-0">
          <div className="flex justify-between items-start gap-2">
            <div>
              <h3 className="font-bold text-lg text-white">Tambah Order by Admin</h3>
              <p className="text-xs text-white/90 mt-1">
                Buat order untuk pelanggan secara manual. Order langsung status Mencari Kurir; notifikasi dikirim ke pelanggan & kurir.
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle btn-ghost text-white hover:bg-white/20"
              aria-label="Tutup"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0"
        >
          {/* Data Pelanggan — simpel: input + dropdown, chip + X */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3" ref={dropdownRef}>
            <div className="flex items-center gap-2">
              <FiUser className="text-orange-600 shrink-0" size={16} />
              <span className="text-sm font-semibold text-gray-800">Pelanggan</span>
            </div>
            {formData.selectedCustomer ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm">
                  <span className="font-medium text-gray-800">{formData.selectedCustomer.name || "Pelanggan"}</span>
                  <span className="text-gray-500 font-mono text-xs">{formData.selectedCustomer.phone}</span>
                </span>
                <button type="button" onClick={clearSelectedCustomer} className="btn btn-ghost btn-sm btn-circle text-red-500 hover:bg-red-50" title="Batalkan" aria-label="Batalkan pilihan">
                  <FiX size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={formData.searchQuery}
                  onChange={(e) => handleSearchQueryChange(e.target.value)}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="input input-bordered w-full rounded-xl h-11 pl-9 pr-9 text-sm"
                  placeholder="Cari nama / no. HP atau ketik no. HP baru"
                />
                <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <FiChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 ${showCustomerDropdown ? "rotate-180" : ""}`} size={16} />
                {showCustomerDropdown && (customers.length > 0 || isCustomersLoading) && (
                  <ul className="absolute z-20 mt-1 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                    {isCustomersLoading ? (
                      <li className="px-3 py-3 text-sm text-gray-500">Memuat...</li>
                    ) : filteredCustomers.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-gray-500">Ketik no. HP untuk pelanggan baru</li>
                    ) : (
                      filteredCustomers.slice(0, 12).map((c) => (
                        <li key={c.phone} role="button" tabIndex={0} onClick={() => handleSelectCustomer(c)} onKeyDown={(e) => e.key === "Enter" && handleSelectCustomer(c)} className="px-3 py-2 hover:bg-orange-50 cursor-pointer text-sm flex justify-between gap-2">
                          <span className="font-medium truncate">{c.name || "Pelanggan"}</span>
                          <span className="text-gray-500 font-mono text-xs shrink-0">{c.phone}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData((prev) => ({ ...prev, customerName: e.target.value }))}
              className="input input-bordered w-full rounded-xl h-10 text-sm"
              placeholder="Nama pelanggan (opsional)"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label text-xs font-bold text-gray-500 uppercase">Alamat Pickup</label>
              <input
                type="text"
                value={formData.pickup_address}
                onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                placeholder="Contoh: Warung Nasi Padang"
              />
            </div>
            <div className="form-control">
              <label className="label text-xs font-bold text-gray-500 uppercase">Alamat Antar *</label>
              <input
                type="text"
                value={formData.delivery_address}
                onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                placeholder="Contoh: Kantor BKPSDM"
                required
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
              <FiMapPin className="text-orange-600" size={16} />
              <h4 className="text-sm font-bold text-gray-800">Koordinat Titik Alamat Pickup *</h4>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">
                Wajib untuk mencari kurir terdekat. Titik lokasi tempat ambil pesanan. Cari alamat atau klik di peta.
              </p>
              <OrderLocationMap
                latitude={formData.pickup_latitude}
                longitude={formData.pickup_longitude}
                initialAddress={formData.pickup_address}
                onLocationChange={(lat, lng) => setFormData((prev) => ({ ...prev, pickup_latitude: lat, pickup_longitude: lng }))}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
              <FiMapPin className="text-orange-600" size={16} />
              <h4 className="text-sm font-bold text-gray-800">Koordinat Titik Alamat Antar</h4>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 mb-3">
                Opsional. Cari alamat atau nama tempat, pilih dari hasil; atau klik di peta. Koordinat akan dikirim ke kurir via WhatsApp untuk panduan lokasi antar.
              </p>
              <OrderLocationMap
                latitude={formData.latitude}
                longitude={formData.longitude}
                initialAddress={formData.delivery_address}
                onLocationChange={(lat, lng) => setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <h4 className="text-sm font-bold text-gray-800">Item Pesanan</h4>
              <button
                type="button"
                onClick={addItemRow}
                className="btn btn-xs bg-blue-50 text-blue-600 hover:bg-blue-100 border-none rounded-lg"
              >
                <FiPlus className="mr-1" /> Tambah Item
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {formData.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-4">
                  <div className="lg:col-span-5">
                    <label className="label text-xs font-bold text-gray-500 uppercase">Item</label>
                    <input
                      type="text"
                      value={item.item}
                      onChange={(e) => updateItem(idx, "item", e.target.value)}
                      className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      placeholder="Contoh: Nasi Goreng"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label text-xs font-bold text-gray-500 uppercase">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) => updateItem(idx, "qty", e.target.value)}
                      className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                  <div className="lg:col-span-4">
                    <label className="label text-xs font-bold text-gray-500 uppercase">Catatan</label>
                    <input
                      type="text"
                      value={item.note}
                      onChange={(e) => updateItem(idx, "note", e.target.value)}
                      className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      placeholder="Contoh: pedas"
                    />
                  </div>
                  <div className="lg:col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="btn btn-ghost btn-square text-red-400 hover:text-red-600"
                      disabled={formData.items.length === 1}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <h4 className="text-sm font-bold text-gray-800">Catatan Order</h4>
              <span className="text-xs text-gray-500">Satu catatan per baris</span>
            </div>
            <div className="p-4 space-y-2">
              {formData.notesList.map((note, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => updateNote(idx, e.target.value)}
                    className="input input-bordered flex-1 rounded-xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm"
                    placeholder={`Catatan ${idx + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeNoteRow(idx)}
                    className="btn btn-ghost btn-square text-red-400 hover:text-red-600 shrink-0"
                    disabled={formData.notesList.length <= 1}
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addNoteRow}
                className="btn btn-xs bg-orange-50 text-orange-600 hover:bg-orange-100 border-none rounded-lg"
              >
                <FiPlus className="mr-1" /> Tambah baris catatan
              </button>
            </div>
          </div>

          <div className="pt-4 pb-2 flex flex-col-reverse sm:flex-row gap-3 justify-end border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 sm:flex-none px-5 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 rounded-xl font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!phoneValid || !hasItems || !hasAddress || isLoading}
              className="btn flex-1 sm:flex-none bg-[#f14c06] px-6 py-2.5 hover:bg-[#d14306] border-none text-white rounded-xl font-medium shadow-md disabled:opacity-50"
            >
              {isLoading ? "Membuat order..." : "Buat Order & Kirim ke Kurir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OrderAddModal;
