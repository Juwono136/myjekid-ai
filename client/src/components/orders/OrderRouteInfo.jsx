const OrderRouteInfo = ({ order }) => {
  return (
    <div className="grid grid-cols-1 gap-6 mb-8">
      {/* Rute Visual Stepper */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 relative overflow-hidden">
        {/* Pickup Address */}
        {order.pickup_address && (
          <div className="flex gap-4 mb-4 relative z-10">
            <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5 ring-4 ring-blue-100"></div>
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase mb-0.5">
                Lokasi Jemput (Toko/Titik)
              </p>
              <p className="text-sm text-gray-700 leading-snug">{order.pickup_address}</p>
            </div>
          </div>
        )}

        {/* Delivery Address */}
        <div className="flex gap-4 relative z-10">
          <div className="w-3 h-3 rounded-full bg-[#f14c06] mt-1.5 ring-4 ring-orange-100"></div>
          <div>
            <p className="text-xs font-bold text-[#f14c06] uppercase mb-0.5">Lokasi Tujuan</p>
            <p className="text-sm text-gray-700 leading-snug font-medium">
              {order.delivery_address || "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderRouteInfo;
