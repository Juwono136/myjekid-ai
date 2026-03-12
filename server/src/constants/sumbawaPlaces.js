/**
 * Daftar tempat makan, minum, dan wisata di Pulau Sumbawa (sumber kebenaran untuk rekomendasi chatbot).
 * AI agent memilih dan memformat rekomendasi secara dinamis dari list ini sesuai kebutuhan pelanggan;
 * tidak ada teks rekomendasi yang di-hardcode di kode. Update list ini berkala agar data tetap akurat.
 * Map URL: Google Maps search (user bisa buka langsung dari chat).
 */

const encodeMapQuery = (name, area = "Sumbawa") =>
  encodeURIComponent(`${name}, ${area}`);

const MAP_BASE = "https://www.google.com/maps/search/?api=1&query=";

export const SUMBAWA_PLACES = [
  {
    name: "Rumah Makan Sari Gurih",
    type: "makan",
    description: "Masakan khas Sumbawa, seafood & nusantara.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Rumah Makan Sari Gurih", "Sumbawa Besar")}`,
  },
  {
    name: "Warung Makan Bu Ani",
    type: "makan",
    description: "Nasi campur dan masakan rumahan, harga terjangkau.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Warung Makan Bu Ani", "Sumbawa Besar")}`,
  },
  {
    name: "RM Sederhana Sumbawa",
    type: "makan",
    description: "Restoran Padang & masakan Minang.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("RM Sederhana", "Sumbawa Besar")}`,
  },
  {
    name: "Depot Seafood Pantai",
    type: "makan",
    description: "Seafood segar dengan view laut.",
    area: "Sumbawa",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Depot Seafood Pantai Sumbawa")}`,
  },
  {
    name: "Warung Nia",
    type: "makan",
    description: "Ayam bakar, ikan bakar, dan lalapan.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Warung Nia", "Sumbawa Besar")}`,
  },
  {
    name: "Kopi Kenangan Sumbawa",
    type: "minum",
    description: "Kopi kekinian dan snack.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Kopi Kenangan", "Sumbawa Besar")}`,
  },
  {
    name: "Kedai Kopi Teman",
    type: "minum",
    description: "Kopi lokal dan suasana nyaman untuk nongkrong.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Kedai Kopi Teman Sumbawa")}`,
  },
  {
    name: "Es Pisang Ijo Sumbawa",
    type: "minum",
    description: "Es pisang ijo dan minuman dingin khas.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Es Pisang Ijo", "Sumbawa Besar")}`,
  },
  {
    name: "RM Bima Seafood",
    type: "makan",
    description: "Seafood dan masakan khas Bima.",
    area: "Bima",
    mapUrl: `${MAP_BASE}${encodeMapQuery("RM Bima Seafood", "Bima Sumbawa")}`,
  },
  {
    name: "Warung Makan Khas Sumbawa",
    type: "makan",
    description: "Sate bulayak, plecing, dan masakan lokal.",
    area: "Sumbawa",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Warung Makan Khas Sumbawa")}`,
  },
  {
    name: "Pantai Lakey",
    type: "wisata",
    description: "Pantai terkenal untuk surfing dan pemandangan.",
    area: "Hu'u, Dompu",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Pantai Lakey", "Sumbawa")}`,
  },
  {
    name: "Pantai Tanjung Menangis",
    type: "wisata",
    description: "Spot sunset dan wisata pantai.",
    area: "Sumbawa",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Pantai Tanjung Menangis", "Sumbawa")}`,
  },
  {
    name: "Gunung Tambora",
    type: "wisata",
    description: "Wisata alam dan sejarah (kawah Tambora).",
    area: "Dompu",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Gunung Tambora", "Sumbawa")}`,
  },
  {
    name: "Benteng Dalam Loka",
    type: "wisata",
    description: "Situs sejarah Kerajaan Sumbawa.",
    area: "Sumbawa Besar",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Benteng Dalam Loka", "Sumbawa Besar")}`,
  },
  {
    name: "Pasar Senggigi Sumbawa",
    type: "makan",
    description: "Kuliner kaki lima dan oleh-oleh khas.",
    area: "Sumbawa",
    mapUrl: `${MAP_BASE}${encodeMapQuery("Pasar Senggigi", "Sumbawa")}`,
  },
];

export default SUMBAWA_PLACES;
