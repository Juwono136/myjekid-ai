import { useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";
import { FiX, FiPlus } from "react-icons/fi";
import { courierService } from "../../services/courierService";
import orderService from "../../services/orderService";

const EDITABLE_STATUSES = [
  "DRAFT",
  "PENDING_CONFIRMATION",
  "LOOKING_FOR_DRIVER",
  "ON_PROCESS",
  "BILL_VALIDATION",
];

const CANCELLABLE_STATUSES = ["DRAFT", "PENDING_CONFIRMATION", "LOOKING_FOR_DRIVER"];

const OrderEditModal = ({ isOpen, onClose, order, onSubmit, isLoading, onCancelSuccess }) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [formData, setFormData] = useState({
    chat_messages: [""],
    total_amount: "",
    courier_id: "",
  });
  const [initialFormData, setInitialFormData] = useState(null);
  const [idleCouriers, setIdleCouriers] = useState([]);
  const [isCourierLoading, setIsCourierLoading] = useState(false);
  const messagesContainerRef = useRef(null);

  const isEditable = useMemo(
    () => (order?.status ? EDITABLE_STATUSES.includes(order.status) : false),
    [order]
  );
  const allowAssignCourier = order?.status === "LOOKING_FOR_DRIVER";
  const allowCancelOrder = order?.status && CANCELLABLE_STATUSES.includes(order.status);

  const hasChanges = useMemo(() => {
    if (!initialFormData) return false;
    const a = formData;
    const b = initialFormData;
    if (JSON.stringify(a.chat_messages) !== JSON.stringify(b.chat_messages)) return true;
    if ((a.total_amount ?? "") !== (b.total_amount ?? "")) return true;
    if ((a.courier_id || "") !== (b.courier_id || "")) return true;
    return false;
  }, [formData, initialFormData]);

  useEffect(() => {
    if (!isOpen || !order) return;
    const messages = Array.isArray(order.chat_messages)
      ? order.chat_messages.map((m) => (typeof m === "string" ? m : m?.body ?? ""))
      : [""];
    const total =
      order.total_amount != null && order.total_amount !== ""
        ? String(Number(order.total_amount))
        : "";
    const next = {
      chat_messages: messages.length > 0 ? messages : [""],
      total_amount: total,
      courier_id: order.courier?.id || "",
    };
    setFormData(next);
    setInitialFormData(next);
  }, [isOpen, order]);

  useEffect(() => {
    if (!isOpen) return;
    if (allowAssignCourier && order?.order_id) {
      setIsCourierLoading(true);
      orderService
        .getEligibleCouriers(order.order_id)
        .then((res) => setIdleCouriers(res?.data || []))
        .catch(() => setIdleCouriers([]))
        .finally(() => setIsCourierLoading(false));
    } else {
      setIsCourierLoading(true);
      courierService
        .getCouriers({ page: 1, limit: 50, status: "IDLE" })
        .then((res) => setIdleCouriers(res.data || []))
        .finally(() => setIsCourierLoading(false));
    }
  }, [isOpen, order?.order_id, allowAssignCourier]);

  const handleCancelOrderClick = () => {
    if (order?.order_id) setShowCancelConfirm(true);
  };

  const handleCancelOrderConfirm = () => {
    if (!order?.order_id) return;
    setShowCancelConfirm(false);
    setIsCancelling(true);
    orderService
      .cancelOrder(order.order_id)
      .then(() => {
        toast.success("Order dibatalkan. Pelanggan telah diberitahu.");
        onCancelSuccess?.();
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message || "Gagal membatalkan order.");
      })
      .finally(() => setIsCancelling(false));
  };

  const handleAddMessage = () => {
    setFormData((prev) => ({
      ...prev,
      chat_messages: [...prev.chat_messages, ""],
    }));
    // Scroll to bottom after adding new input
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 10);
  };

  const handleRemoveMessage = (index) => {
    setFormData((prev) => ({
      ...prev,
      chat_messages: prev.chat_messages.filter((_, i) => i !== index),
    }));
  };

  const handleChangeMessage = (index, value) => {
    setFormData((prev) => {
      const newMessages = [...prev.chat_messages];
      newMessages[index] = value;
      return { ...prev, chat_messages: newMessages };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!order) return;

    const payload = {};
    const lines = formData.chat_messages
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 0) payload.chat_messages = lines;

    const totalNum = formData.total_amount !== "" ? Number(formData.total_amount) : undefined;
    if (totalNum !== undefined && !Number.isNaN(totalNum) && totalNum >= 0) {
      payload.total_amount = totalNum;
    }

    if (allowAssignCourier && formData.courier_id) {
      payload.courier_id = formData.courier_id;
    }

    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
        <div className="modal-box w-full max-w-2xl p-0 overflow-hidden rounded-2xl shadow-2xl relative max-h-[92vh] flex flex-col">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-4 border-b border-blue-500 flex flex-row justify-between items-start gap-2 shrink-0">
            <div>
              <h3 className="font-bold text-lg text-white">Edit Order</h3>
              <p className="text-xs text-blue-100 font-mono mt-1">Ref ID: {order?.order_id || "-"}</p>
              {order?.user_phone && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-white/90">
                  <span>
                    <span className="font-semibold text-blue-200">Pelanggan:</span> {order?.user?.name || "-"}
                  </span>
                  <span>
                    <span className="font-semibold text-blue-200">No. HP:</span>{" "}
                    <span className="font-mono">{order?.user_phone}</span>
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle btn-ghost text-white hover:bg-white/20"
              aria-label="Tutup"
            >
              <FiX size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
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
                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    PESAN ORDER (CHAT PELANGGAN)
                  </label>
                  <div 
                    ref={messagesContainerRef}
                    className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar"
                  >
                    {formData.chat_messages.map((msg, index) => (
                      <div key={index} className="flex gap-2 items-start relative group">
                        <div className="absolute left-3 top-3 text-gray-300 font-mono text-xs select-none pointer-events-none">
                          {index + 1}.
                        </div>
                        <textarea
                          value={msg}
                          onChange={(e) => handleChangeMessage(index, e.target.value)}
                          className="textarea textarea-bordered w-full rounded-xl min-h-[80px] text-sm leading-relaxed pl-8 pr-4 py-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                          placeholder={index === 0 ? "Contoh: saya mau belanja wortel 5 kg..." : "Pesan lanjutan..."}
                          disabled={!isEditable}
                          required={index === 0}
                        />
                        {isEditable && formData.chat_messages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMessage(index)}
                            className="btn btn-square btn-ghost text-red-400 hover:bg-red-50 hover:text-red-600 btn-sm mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Hapus pesan"
                          >
                            <FiX size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                    {isEditable && (
                      <button
                        type="button"
                        onClick={handleAddMessage}
                        className="btn btn-ghost btn-sm rounded-xl w-full border-dashed border-2 border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 mt-2"
                      >
                        <FiPlus size={16} /> Tambah Pesan Lanjutan
                      </button>
                    )}
                  </div>
                </div>


                <div className="form-control">
                  <label className="label text-xs font-bold text-gray-500 uppercase">
                    Assign Kurir (IDLE)
                  </label>
                  <select
                    value={formData.courier_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, courier_id: e.target.value }))}
                    className="select select-bordered w-full rounded-xl"
                    disabled={!isEditable || !allowAssignCourier}
                  >
                    <option value="">
                      {allowAssignCourier
                        ? "Pilih kurir (idle)"
                        : "Hanya untuk status LOOKING_FOR_DRIVER"}
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
                </div>

                <div className="pt-4 pb-2 flex flex-col-reverse sm:flex-row gap-3 justify-between items-stretch sm:items-center border-t border-gray-100">
                  <div className="flex gap-3 order-2 sm:order-1">
                    {allowCancelOrder && (
                      <button
                        type="button"
                        onClick={handleCancelOrderClick}
                        disabled={isCancelling}
                        className="btn px-5 py-2.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 rounded-xl font-medium"
                      >
                        {isCancelling ? "Membatalkan..." : "Batalkan order"}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 order-1 sm:order-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn px-5 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 rounded-xl font-medium"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={!isEditable || isLoading || !hasChanges}
                      className="btn bg-blue-600 px-5 py-2.5 hover:bg-blue-700 border-none text-white rounded-xl font-medium disabled:opacity-60"
                    >
                      {isLoading ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </form>
        </div>
      </div>

      {showCancelConfirm && (
        <div className="modal modal-open bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="modal-box max-w-md rounded-2xl shadow-2xl border border-red-100">
            <h3 className="font-bold text-lg text-gray-800">Batalkan order?</h3>
            <p className="py-3 text-gray-600 text-sm">
              Pelanggan akan menerima notifikasi pembatalan via WhatsApp.
            </p>
            <div className="modal-action justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="btn px-4 py-2 bg-gray-100 border border-gray-200 text-gray-700 rounded-xl"
              >
                Tidak
              </button>
              <button
                type="button"
                onClick={handleCancelOrderConfirm}
                disabled={isCancelling}
                className="btn px-4 py-2 bg-red-600 hover:bg-red-700 border-none text-white rounded-xl"
              >
                {isCancelling ? "Membatalkan..." : "Ya, batalkan"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/30" onClick={() => setShowCancelConfirm(false)} aria-hidden="true" />
        </div>
      )}
    </>
  );
};

export default OrderEditModal;
