import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FiChevronDown } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatWhatsAppToMarkdown } from "../../utils/chatFormatter";

const MessageList = ({ messages = [], session }) => {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const hasAutoScrolledRef = useRef(false);

  useEffect(() => {
    hasAutoScrolledRef.current = false;
  }, [session?.phone]);

  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    if (!messages.length) return;
    if (hasAutoScrolledRef.current) return;

    bottomRef.current?.scrollIntoView({ behavior: "auto" });
    hasAutoScrolledRef.current = true;
  }, [messages, session?.phone]);

  useEffect(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;

    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 300);
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-[#efe7dd]">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto p-3 md:p-4 space-y-3 custom-scrollbar"
      >
        {messages.map((msg, index) => {
          const isBot = msg.sender === "BOT";
          const isAdmin = msg.sender === "ADMIN";
          const isSystem = isBot || isAdmin;

          return (
            <div
              key={index}
              className={`flex w-full ${isSystem ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`
                  relative px-3 py-2 rounded-lg shadow-sm text-sm wrap-break-word
                  max-w-[85%] md:max-w-[75%]
                  ${
                    isSystem
                      ? isBot
                        ? "bg-blue-50 text-gray-900 rounded-tr-none"
                        : "bg-[#d9fdd3] text-gray-900 rounded-tr-none"
                      : "bg-white text-gray-900 rounded-tl-none"
                  }
                `}
              >
                <div className="markdown-body prose prose-sm max-w-none prose-p:my-0 leading-relaxed text-gray-800">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {formatWhatsAppToMarkdown(msg.text || "")}
                  </ReactMarkdown>
                </div>

                <div className="text-[10px] mt-1 flex justify-end items-center gap-1 opacity-70 select-none">
                  {isBot && <span className="font-bold text-[9px] uppercase mr-1">BOT</span>}
                  {msg.timestamp && format(new Date(msg.timestamp), "HH:mm", { locale: id })}
                  {isAdmin && <span className="text-blue-500 font-bold">✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} className="h-1" />
      </div>

      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute right-4 bottom-4
                     bg-gray-100 opacity-70 p-2 rounded-full shadow-lg
                     transition-all hover:text-orange-600 hover:opacity-100
                     z-30 cursor-pointer"
        >
          <FiChevronDown size={20} />
        </button>
      )}
    </div>
  );
};

export default MessageList;
