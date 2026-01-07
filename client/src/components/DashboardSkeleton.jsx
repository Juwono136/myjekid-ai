const DashboardSkeleton = () => {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-2xl"></div>
        ))}
      </div>

      {/* Charts Area Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 h-100 bg-gray-200 rounded-2xl"></div>
        <div className="h-100 bg-gray-200 rounded-2xl"></div>
      </div>
    </div>
  );
};

export default DashboardSkeleton;
