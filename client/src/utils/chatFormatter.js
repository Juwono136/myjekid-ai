/**
 * Helper untuk mengubah format text style WhatsApp menjadi Markdown standar.
 * Digunakan sebelum teks dirender oleh react-markdown.
 */
export const formatWhatsAppToMarkdown = (text) => {
  if (!text) return "";

  let formatted = text;

  // 1. Bold: *text* -> **text** (Hanya jika ada karakter di dalamnya)
  // Regex memastikan tidak mengganti * tunggal atau * spasi *
  formatted = formatted.replace(/\*([^\s*][^*]*[^\s*]|[^\s*])\*/g, "**$1**");

  // 2. Italic: _text_ -> *text*
  // Menggunakan boundary \b agar tidak merusak URL yang mengandung underscore
  formatted = formatted.replace(/\b_((?:__|[^_])+?)_\b/g, "*$1*");

  // 3. Strikethrough: ~text~ -> ~~text~~
  formatted = formatted.replace(/~([^~]+)~/g, "~~$1~~");

  formatted = formatted
    .replace(/\r\n/g, "\n") // normalisasi Windows newline
    .replace(/([^\n])\n([^\n])/g, "$1  \n$2");

  // 4. Monospace: ```text``` (Sudah didukung native markdown, tidak perlu diubah)

  return formatted;
};
