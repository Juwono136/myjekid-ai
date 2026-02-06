import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiTrash2, FiX, FiMapPin } from "react-icons/fi";
import { courierService } from "../../services/courierService";
import OrderLocationMap from "./OrderLocationMap.jsx";

const EDITABLE_STATUSES = [
  "DRAFT",
  "PENDING_CONFIRMATION",
  "LOOKING_FOR_DRIVER",
  "ON_PROCESS",
  "BILL_VALIDATION",
];

const OrderEditModal = ({ isOpen, onClose, order, onSubmit, isLoading }) => {
  const [formData, setFormData] = useState({
    pickup_address: "",
    delivery_address: "",
    latitude: null,
    longitude: null,
    items: [],
    notesList: [""],
    courier_id: "",
  });
  const [idleCouriers, setIdleCouriers] = useState([]);
  const [isCourierLoading, setIsCourierLoading] = useState(false);

  const isEditable = useMemo(
    () => (order?.status ? EDITABLE_STATUSES.includes(order.status) : false),
    [order]
  );
  const allowAssignCourier = order?.status === "LOOKING_FOR_DRIVER";

  useEffect(() => {
    if (!isOpen || !order) return;
    let parsedItems = [];
    if (Array.isArray(order.items_summary)) {
      parsedItems = order.items_summary;
    } else if (typeof order.items_summary === "string") {
      try {
        parsedItems = JSON.parse(order.items_summary || "[]");
      } catch {
        parsedItems = [];
      }
    }
    const parsedNotes = Array.isArray(order.order_notes)
      ? order.order_notes
          .map((note) => (typeof note === "string" ? note : note?.note))
          .filter(Boolean)
      : [];

    const lat = order.user?.latitude != null ? Number(order.user.latitude) : null;
    const lng = order.user?.longitude != null ? Number(order.user.longitude) : null;
    setFormData({
      pickup_address: order.pickup_address || "",
      delivery_address: order.delivery_address || "",
      latitude: lat,
      longitude: lng,
      items:
        parsedItems.length > 0
          ? parsedItems.map((item) => ({
              item: item.item || "",
              qty: item.qty || 1,
              note: item.note || "",
            }))
          : [{ item: "", qty: 1, note: "" }],
      notesList: parsedNotes.length > 0 ? parsedNotes : [""],
      courier_id: order.courier?.id || "",
    });
  }, [isOpen, order]);

  useEffect(() => {
    if (!isOpen) return;
    setIsCourierLoading(true);
    courierService
      .getCouriers({ page: 1, limit: 50, status: "IDLE" })
      .then((res) => {
        setIdleCouriers(res.data || []);
      })
      .finally(() => setIsCourierLoading(false));
  }, [isOpen]);

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
    if (!order) return;

    const payload = {
      pickup_address: formData.pickup_address,
      delivery_address: formData.delivery_address,
      items_summary: formData.items
        .map((item) => ({
          item: item.item?.trim(),
          qty: Number(item.qty) || 1,
          note: item.note?.trim() || "",
        }))
        .filter((item) => item.item),
      order_notes: formData.notesList.map((line) => line.trim()).filter(Boolean),
    };
    if (formData.latitude != null && formData.longitude != null && !Number.isNaN(formData.latitude) && !Number.isNaN(formData.longitude)) {
      payload.latitude = formData.latitude;
      payload.longitude = formData.longitude;
    }
    if (allowAssignCourier && formData.courier_id) {
      payload.courier_id = formData.courier_id;
    }
    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="modal-box w-full max-w-4xl p-0 overflow-hidden rounded-2xl shadow-2xl relative max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-4 sm:px-6 py-4 border-b border-gray-600 flex flex-row justify-between items-start gap-2 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-white">Edit Order</h3>
            <p className="text-xs text-gray-300 font-mono mt-1">
              Ref ID: {order?.order_id || "-"}
            </p>
            {order?.user_phone && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-200">
                <span>
                  <span className="font-semibold text-gray-400">Pelanggan:</span>{" "}
                  {order?.user?.name || "-"}
                </span>
                <span>
                  <span className="font-semibold text-gray-400">No. HP:</span>{" "}
                  <span className="font-mono">{order?.user_phone}</span>
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-gray-300 hover:bg-white/10"
            aria-label="Tutup"
          >
            <FiX size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0"
        >

          {!isEditable && order?.status && (
            <div className="alert alert-warning text-sm rounded-xl">
              Order ini tidak bisa diubah pada status <b>{order.status}</b>.
            </div>
          )}

          {!order ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
              <div className="loading loading-spinner loading-md text-gray-300"></div>
              <p className="text-sm">Memuat data order...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Alamat Pickup
                  </label>
                  <input
                    type="text"
                    value={formData.pickup_address}
                    onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                    className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none transition"
                    placeholder="Contoh: Warung Nasi Padang"
                    disabled={!isEditable}
                  />
                </div>
                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Alamat Antar
                  </label>
                  <input
                    type="text"
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none transition"
                    placeholder="Contoh: Kantor BKPSDM"
                    disabled={!isEditable}
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
                    Cari alamat atau nama tempat, lalu pilih dari hasil. Atau klik di peta untuk set titik. Koordinat akan dikirim ke kurir via WhatsApp untuk panduan lokasi antar.
                  </p>
                  <OrderLocationMap
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    initialAddress={formData.delivery_address}
                    onLocationChange={(lat, lng) => setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))}
                    disabled={!isEditable}
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
                    disabled={!isEditable}
                  >
                    <FiPlus className="mr-1" /> Tambah Item
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {formData.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-4">
                      <div className="lg:col-span-5">
                        <label className="label text-xs font-bold text-gray-500 uppercase">
                          Item
                        </label>
                        <input
                          type="text"
                          value={item.item}
                          onChange={(e) => updateItem(idx, "item", e.target.value)}
                          className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none transition"
                          placeholder="Contoh: Nasi Goreng"
                          disabled={!isEditable}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="label text-xs font-bold text-gray-500 uppercase">
                          Qty
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => updateItem(idx, "qty", e.target.value)}
                          className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none transition"
                          disabled={!isEditable}
                        />
                      </div>
                      <div className="lg:col-span-4">
                        <label className="label text-xs font-bold text-gray-500 uppercase">
                          Catatan
                        </label>
                        <input
                          type="text"
                          value={item.note}
                          onChange={(e) => updateItem(idx, "note", e.target.value)}
                          className="input input-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none transition"
                          placeholder="Contoh: pedas"
                          disabled={!isEditable}
                        />
                      </div>
                      <div className="lg:col-span-1 flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="btn btn-ghost btn-square text-red-400 hover:text-red-600"
                          disabled={!isEditable || formData.items.length === 1}
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
                        className="input input-bordered flex-1 rounded-xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none text-sm"
                        placeholder={`Catatan ${idx + 1}`}
                        disabled={!isEditable}
                      />
                      <button
                        type="button"
                        onClick={() => removeNoteRow(idx)}
                        className="btn btn-ghost btn-square text-red-400 hover:text-red-600 shrink-0"
                        disabled={!isEditable || formData.notesList.length <= 1}
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addNoteRow}
                    className="btn btn-xs bg-orange-50 text-orange-600 hover:bg-orange-100 border-none rounded-lg"
                    disabled={!isEditable}
                  >
                    <FiPlus className="mr-1" /> Tambah baris catatan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="form-control lg:col-span-2">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Assign Kurir (IDLE)
                  </label>
                  <select
                    value={formData.courier_id}
                    onChange={(e) => setFormData({ ...formData, courier_id: e.target.value })}
                    className="select select-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none"
                    disabled={!isEditable || !allowAssignCourier}
                  >
                    <option value="">
                      {allowAssignCourier ? "Pilih kurir IDLE" : "Hanya untuk status LOOKING_FOR_DRIVER"}
                    </option>
                    {isCourierLoading ? (
                      <option value="">Memuat kurir...</option>
                    ) : (
                      idleCouriers.map((courier) => (
                        <option key={courier.id} value={courier.id}>
                          {courier.name} - {courier.phone}
                        </option>
                      ))
                    )}
                  </select>
                  {allowAssignCourier && (
                    <p className="text-xs text-gray-400 mt-2">
                      Hanya kurir dengan status IDLE yang dapat ditugaskan.
                    </p>
                  )}
                </div>
              </div>

          <div className="pt-4 pb-2 flex flex-col-reverse sm:flex-row gap-3 justify-end border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 sm:flex-none px-5 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 rounded-xl font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isEditable || isLoading}
              className="btn flex-1 sm:flex-none bg-[#f14c06] px-5 py-2.5 hover:bg-[#d14306] border-none text-white rounded-xl font-medium shadow-md"
            >
              {isLoading ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default OrderEditModal;
