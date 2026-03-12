import { useEffect, useState, useRef } from "react";
import { FiPlus, FiX, FiUser, FiChevronDown } from "react-icons/fi";

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
    chat_messages: [""],
    total_amount: "",
  });
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        selectedCustomer: null,
        searchQuery: "",
        customerName: "",
        chat_messages: [""],
        total_amount: "",
      });
      setShowCustomerDropdown(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowCustomerDropdown(false);
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
    const phone = formData.selectedCustomer?.phone || normalizePhone(formData.searchQuery);
    if (!phone || phone.length < 10) return;

    const lines = formData.chat_messages
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const payload = {
      user_phone: phone,
      customer_name: (formData.selectedCustomer?.name || formData.customerName || "").trim() || null,
      chat_messages: lines,
      total_amount: formData.total_amount ? Number(formData.total_amount) : undefined,
    };
    onSubmit(payload);
  };

  if (!isOpen) return null;

  const submittedPhone = formData.selectedCustomer?.phone || normalizePhone(formData.searchQuery);
  const phoneValid = submittedPhone.length >= 10;
  const hasChat = formData.chat_messages.some((msg) => msg.trim().length > 0);

  return (
    <div className="modal modal-open bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="modal-box w-full max-w-2xl p-0 overflow-hidden rounded-2xl shadow-2xl relative max-h-[92vh] flex flex-col">
        <div className="bg-gradient-to-r from-[#f14c06] to-[#e85a2a] px-4 sm:px-6 py-4 border-b border-orange-200 shrink-0">
          <div className="flex justify-between items-start gap-2">
            <div>
              <h3 className="font-bold text-lg text-white">Tambah Order</h3>
              <p className="text-xs text-white/90 mt-1">
                Isi nomor HP pelanggan dan pesan order (chat). Order langsung dicarikan kurir.
              </p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-sm btn-circle btn-ghost text-white hover:bg-white/20" aria-label="Tutup">
              <FiX size={18} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" ref={dropdownRef}>
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
                <button type="button" onClick={clearSelectedCustomer} className="btn btn-ghost btn-sm btn-circle text-red-500 hover:bg-red-50" title="Batalkan">
                  <FiX size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={formData.searchQuery}
                  onChange={(e) => setFormData((prev) => ({ ...prev, searchQuery: e.target.value }))}
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
                        <li
                          key={c.phone}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectCustomer(c)}
                          onKeyDown={(e) => e.key === "Enter" && handleSelectCustomer(c)}
                          className="px-3 py-2 hover:bg-orange-50 cursor-pointer text-sm flex justify-between gap-2"
                        >
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

          <div className="form-control">
            <label className="label text-xs font-bold text-gray-500 uppercase">PESAN ORDER (CHAT PELANGGAN) *</label>
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
                    className="textarea textarea-bordered w-full rounded-xl min-h-[80px] text-sm leading-relaxed pl-8 pr-4 py-3 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder={index === 0 ? "Contoh: saya mau belanja wortel 5 kg..." : "Pesan lanjutan..."}
                    required={index === 0}
                  />
                  {formData.chat_messages.length > 1 && (
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
              <button
                type="button"
                onClick={handleAddMessage}
                className="btn btn-ghost btn-sm rounded-xl w-full border-dashed border-2 border-gray-200 text-gray-500 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 mt-2"
              >
                <FiPlus size={16} /> Tambah Pesan Lanjutan
              </button>
            </div>
          </div>


          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost rounded-xl flex-1">
              Batal
            </button>
            <button
              type="submit"
              disabled={!phoneValid || !hasChat || isLoading}
              className="btn bg-[#f14c06] hover:bg-[#e85a2a] text-white border-none rounded-xl flex-1"
            >
              {isLoading ? "Membuat..." : "Buat Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OrderAddModal;
