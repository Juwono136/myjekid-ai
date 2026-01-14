/**
 * Helper untuk mengubah format text style WhatsApp menjadi Markdown standar.
 * Digunakan sebelum teks dirender oleh react-markdown.
 */
export const formatWhatsAppToMarkdown = (text) => {
  if (!text) return "";

  let formatted = text;

  // Bold: *text* -> **text** (Hanya jika ada karakter di dalamnya)
  // Regex memastikan tidak mengganti * tunggal atau * spasi *
  formatted = formatted.replace(/\*([^\s*][^*]*[^\s*]|[^\s*])\*/g, "**$1**");

  // Italic: _text_ -> *text*
  // Menggunakan boundary \b agar tidak merusak URL yang mengandung underscore
  formatted = formatted.replace(/\b_((?:__|[^_])+?)_\b/g, "*$1*");

  // Strikethrough: ~text~ -> ~~text~~
  formatted = formatted.replace(/~([^~]+)~/g, "~~$1~~");

  formatted = formatted
    .replace(/\r\n/g, "\n") // normalisasi Windows newline
    .replace(/([^\n])\n([^\n])/g, "$1  \n$2");

  return formatted;
};
