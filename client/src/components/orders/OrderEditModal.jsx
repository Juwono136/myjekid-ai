import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { courierService } from "../../services/courierService";

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
    items: [],
    notesText: "",
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

    setFormData({
      pickup_address: order.pickup_address || "",
      delivery_address: order.delivery_address || "",
      items:
        parsedItems.length > 0
          ? parsedItems.map((item) => ({
              item: item.item || "",
              qty: item.qty || 1,
              note: item.note || "",
            }))
          : [{ item: "", qty: 1, note: "" }],
      notesText: parsedNotes.join("\n"),
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
      order_notes: formData.notesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    if (allowAssignCourier && formData.courier_id) {
      payload.courier_id = formData.courier_id;
    }

    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4 py-6">
      <div className="modal-box w-full max-w-4xl p-0 overflow-hidden rounded-2xl shadow-2xl relative max-h-[92vh]">
        <div className="bg-gray-50 px-4 sm:px-6 py-4 border-b border-gray-100 flex sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h3 className="font-bold text-lg text-gray-800">Edit Order</h3>
            <p className="text-xs text-gray-500 font-mono mt-1">
              Ref ID: {order?.order_id || "-"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-gray-400 hover:bg-gray-200"
          >
            <FiX size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-80px)]"
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Catatan Order
                  </label>
                  <textarea
                    rows={4}
                    value={formData.notesText}
                    onChange={(e) => setFormData({ ...formData, notesText: e.target.value })}
                    className="textarea textarea-bordered w-full rounded-2xl bg-gray-50 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:outline-none"
                    placeholder="Satu catatan per baris"
                    disabled={!isEditable}
                  />
                </div>
                <div className="form-control">
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

          <div className="py-4 flex flex-col mx-auto sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn flex-1 px-4 py-2 bg-gray-200 border-none text-gray-600 hover:bg-gray-200 rounded-xl"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isEditable || isLoading}
              className="btn flex-1 bg-[#f14c06] px-4 py-2 hover:bg-[#d14306] border-none text-white rounded-xl"
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
