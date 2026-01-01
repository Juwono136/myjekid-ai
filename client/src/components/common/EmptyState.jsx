import { FiInbox } from "react-icons/fi";

const EmptyState = ({ message = "Data tidak ditemukan." }) => {
  return (
    <tr>
      <td colSpan="100%" className="text-center py-12 text-gray-400">
        <div className="flex flex-col items-center justify-center">
          <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mb-3">
            <FiInbox size={24} />
          </div>
          <p>{message}</p>
        </div>
      </td>
    </tr>
  );
};

export default EmptyState;
