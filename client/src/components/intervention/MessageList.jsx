import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FiChevronDown } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatWhatsAppToMarkdown } from "../../utils/chatFormatter";
import api from "../../services/api";

/** Gambar yang di-load lewat API (agar token terkirim untuk proxy media). */
function ChatImage({ mediaUrl, alt = "Gambar", className }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!mediaUrl) {
      setSrc(null);
      setLoading(false);
      setError(false);
      return;
    }
    if (mediaUrl.startsWith("data:")) {
      setSrc(mediaUrl);
      setLoading(false);
      setError(false);
      return;
    }
    const isProxy = mediaUrl.startsWith("/api/") || (typeof mediaUrl === "string" && !mediaUrl.startsWith("http"));
    if (!isProxy) {
      setSrc(mediaUrl);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const path = mediaUrl.startsWith("/api/") ? mediaUrl.slice(4) : mediaUrl;
    let blobUrl = null;
    api
      .get(path, { responseType: "blob" })
      .then((res) => {
        const blob = res.data;
        if (blob && blob.size > 0) {
          blobUrl = URL.createObjectURL(blob);
          setSrc(blobUrl);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [mediaUrl]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-md min-h-[80px] ${className || ""}`}>
        <span className="text-gray-400 text-sm">Memuat gambar…</span>
      </div>
    );
  }
  if (error || !src) {
    return (
      <div className={`flex items-center gap-2 bg-gray-100/50 p-2 rounded-md border border-gray-200 min-h-[48px] ${className || ""}`}>
        <span className="text-xl">📷</span>
        <span className="text-xs italic text-gray-500">Gambar</span>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className || "rounded-md max-w-full h-auto max-h-60 object-contain"} />;
}

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
          let type = (msg.type || (msg.media_url ? "image" : "chat")).toLowerCase();
          if (type === "ptt") type = "audio";
          if (type === "loc") type = "location";
          if (type === "sticker") type = "image";

          const hasMedia = type !== "chat" || msg.media_url;
          const textBlock = (content) =>
            content ? (
              <div className="mt-1 break-words [&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {formatWhatsAppToMarkdown(content)}
                </ReactMarkdown>
              </div>
            ) : null;

          return (
            <div
              key={msg.id ?? index}
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
                  {type === "image" || (hasMedia && type === "chat") ? (
                    <div className="flex flex-col gap-1">
                      {msg.media_url ? (
                        <ChatImage mediaUrl={msg.media_url} alt="Gambar" className="rounded-md max-w-full h-auto max-h-60 object-contain" />
                      ) : (
                        <div className="flex items-center gap-2 bg-gray-100/50 p-2 rounded-md border border-gray-200 min-h-[48px]">
                          <span className="text-xl">📷</span>
                          <span className="text-xs italic text-gray-500">Gambar</span>
                        </div>
                      )}
                      {textBlock(msg.text)}
                    </div>
                  ) : type === "location" ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 bg-gray-100/50 p-2 rounded-md border border-gray-200 min-h-[48px]">
                        <span className="text-xl">📍</span>
                        <div className="text-xs">
                          <div className="font-semibold">Lokasi</div>
                          {(msg.latitude != null || msg.longitude != null) && (
                            <div className="text-gray-500 font-mono mt-0.5">{msg.latitude}, {msg.longitude}</div>
                          )}
                        </div>
                      </div>
                      {(msg.latitude != null && msg.longitude != null) && (
                        <a
                          href={`https://maps.google.com/?q=${msg.latitude},${msg.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline mt-1 inline-block"
                        >
                          Buka di Google Maps
                        </a>
                      )}
                      {textBlock(msg.text)}
                    </div>
                  ) : type === "audio" ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 bg-gray-100/50 p-2 rounded-md border border-gray-200 min-h-[48px]">
                        <span className="text-xl">🎤</span>
                        <span className="text-xs italic text-gray-500">Pesan Suara (Voice Note)</span>
                      </div>
                      {msg.media_url && (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                          Putar / Unduh
                        </a>
                      )}
                      {textBlock(msg.text)}
                    </div>
                  ) : type === "video" ? (
                    <div className="flex flex-col gap-1">
                      {msg.media_url ? (
                        <video src={msg.media_url} controls className="rounded-md max-w-full max-h-48" />
                      ) : (
                        <div className="flex items-center gap-2 bg-gray-100/50 p-2 rounded-md border border-gray-200 min-h-[48px]">
                          <span className="text-xl">🎥</span>
                          <span className="text-xs italic text-gray-500">Pesan Video</span>
                        </div>
                      )}
                      {textBlock(msg.text)}
                    </div>
                  ) : type === "document" ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 bg-gray-100/50 p-2 rounded-md border border-gray-200 min-h-[48px]">
                        <span className="text-xl">📄</span>
                        <span className="text-xs italic text-gray-500">Dokumen / File</span>
                      </div>
                      {msg.media_url && (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                          Unduh file
                        </a>
                      )}
                      {textBlock(msg.text)}
                    </div>
                  ) : (
                    <div className="break-words [&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {formatWhatsAppToMarkdown(String(msg.text || "").trim()) || "\u00A0"}
                      </ReactMarkdown>
                    </div>
                  )}
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
