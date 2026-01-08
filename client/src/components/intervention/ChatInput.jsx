import { useState, useRef } from "react";
import { FiSend } from "react-icons/fi";

const MAX_HEIGHT = 160;

const ChatInput = ({ onSendMessage }) => {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };

  const handleChange = (e) => {
    setText(e.target.value);
    resizeTextarea();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    onSendMessage(text.trim());
    setText("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex-none bg-[#f0f2f5] px-3 py-2 md:px-4 md:py-3 border-t border-gray-200 z-30">
      <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-5xl mx-auto w-full">
        {/* Input Bubble */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-300 px-4 py-2 shadow-sm focus-within:border-[#f14c06]/60 focus-within:ring-2 focus-within:ring-[#f14c06]/20 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            className="w-full bg-transparent resize-none focus:outline-none text-sm md:text-base leading-relaxed placeholder:text-gray-400"
            placeholder="Ketik pesan..."
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            style={{ minHeight: "24px", maxHeight: MAX_HEIGHT }}
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!text.trim()}
          className="btn btn-circle btn-sm md:btn-md bg-[#f14c06] hover:bg-[#d94205] text-white border-none shadow-md shrink-0 self-center transition-transform active:scale-95 disabled:bg-gray-200 disabled:text-gray-400"
        >
          <FiSend size={10} className="md:w-5 md:h-5" />
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
