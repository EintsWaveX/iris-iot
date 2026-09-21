window.DATA = {
  roster: [
    { kode: "NAB", nama: "Bustan Nabiel Maulana", divisi: "Inti" },
    { kode: "ADD", nama: "Adrianus Wismar Nugrahanto", divisi: "Inti" },
    { kode: "NAT", nama: "Putri Natasya Villyadi", divisi: "Inti" },
    { kode: "DES", nama: "Nathaniel Mildess", divisi: "Inti" },
    { kode: "NUE", nama: "Immanuel Eben Haezer Joseph Aleteia", divisi: "ASO" },
    { kode: "TWT", nama: "Muhammad Raditya Dwi Putra", divisi: "ASO" },
    { kode: "MAP", nama: "Muhammad Apri Putra Pratama", divisi: "ASO" },
    { kode: "MCD", nama: "Marvel Cristo Damanik", divisi: "ASO" },
    { kode: "RGZ", nama: "Rega Arzula Akbar", divisi: "ARD" },
    { kode: "WIL", nama: "Wildan Khalid Wijaya", divisi: "ARD" },
    { kode: "ZAN", nama: "Ruifauzan Khiyar Wienarya", divisi: "ARD" },
    { kode: "IKY", nama: "Mochammad Rifky Adiraysan", divisi: "ARD" },
    { kode: "GRY", nama: "Geraldi Ridwan Hakim", divisi: "ADS" },
    { kode: "GMW", nama: "Agung Putra Pamungkas", divisi: "ADS" },
    { kode: "OCU", nama: "Agung Setia Dharma", divisi: "ADS" },
    { kode: "LYY", nama: "Serly Marleny", divisi: "ADC" },
    { kode: "ICA", nama: "Monica Rizkia Nanda", divisi: "ADC" },
    { kode: "FAT", nama: "Moh. Fathirochman Yasin", divisi: "ADC" },
    { kode: "BAR", nama: "Muhammad Raid Ihsan Akbar", divisi: "AER" },
    { kode: "YEN", nama: "Bryan Gabriel Izaac Sasabone", divisi: "AER" },
    { kode: "MCU", nama: "Rido Alip Fianto", divisi: "AER" },
    { kode: "XIN", nama: "Graceyana Ardhia Shinta Thalia Kottama", divisi: "AER" },
    { kode: "LUV", nama: "Luqmanul Hakim", divisi: "ARM" },
    { kode: "GAN", nama: "Darma Al Gani", divisi: "ARM" },
    { kode: "TRA", nama: "Tirta Razzan", divisi: "ARM" },
  ],
  divisi: ["Inti", "ASO", "ARD", "ADS", "ADC", "AER", "ARM"],

  // The four drawn groups. They used to be distinguishable only by a 2-3px
  // coloured border, which is not enough to tell "Grup 2" from "Grup 4"
  // across a room. Each now carries a constellation name and a crest drawn
  // from `stars` (points on a 0-100 grid) joined by `lines` (index pairs),
  // so a group has an identity at projector distance and not just a hue.
  groups: [
    {
      no: 1,
      nama: "Vela",
      stars: [[18, 72], [40, 44], [66, 56], [86, 26], [34, 88]],
      lines: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 2]]
    },
    {
      no: 2,
      nama: "Lyra",
      stars: [[24, 20], [68, 28], [76, 66], [32, 58], [50, 88]],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4]]
    },
    {
      no: 3,
      nama: "Cygnus",
      stars: [[50, 12], [50, 46], [50, 82], [18, 52], [82, 40]],
      lines: [[0, 1], [1, 2], [3, 1], [1, 4]]
    },
    {
      no: 4,
      nama: "Orion",
      stars: [[22, 18], [76, 22], [42, 50], [52, 54], [62, 58], [26, 86], [78, 84]],
      lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]]
    }
  ],

  games: [
    { id: "g1", no: 1, nama: "Tebak nama/kode asisten", deskripsi: "sebutin nama dari orang yang ditunjuk", contoh: "https://vt.tiktok.com/ZSVa7tJ83/", pengusul: "bar" },
    { id: "g2", no: 2, nama: "Estafet sarung dikolam renang", deskripsi: "estafet sarung pada umumnya tapi lebih susah aja", contoh: "https://vt.tiktok.com/ZSVavdhoQ/", pengusul: "bar" },
    { id: "g3", no: 3, nama: "Balap pegang sedotan", deskripsi: "seru lah pokonya", contoh: null, pengusul: "REG" },
    { id: "g4", no: 4, nama: "Bingo", deskripsi: "ini juga", contoh: null, pengusul: "REG" },
    { id: "g5", no: 5, nama: "Bikin kalimat", deskripsi: "kaya di tiktok ntuh diah mudah dimengerti", contoh: "https://vt.tiktok.com/ZSVXkgafD/", pengusul: "zan" },
    { id: "g6", no: 6, nama: "Reflek perkalian", deskripsi: "sama kaya yang no5, tapi yang disebut angka, terus jawab hasil dari perkalian kedua angka tsb", contoh: null, pengusul: "zan" },
  ],

  // The scoring rules previously lived only inside engine.js and the
  // operator's head, so nobody in the room could check why a group had the
  // points it had. The copy lives here, in Indonesian, so the wording is
  // editable in one place and ui-rules.js stays pure presentation.
  //
  // Everything below must stay in step with engine.js: `drawGroups` for the
  // division-balanced draw, `resolveBracket` for the bracket shape, and
  // `computeStandings` for the points and the tiebreak.
  rules: {
    ringkas:
      "Empat grup, dua semifinal, satu final. Tiap game berdiri sendiri, " +
      "tetapi poinnya menumpuk sepanjang malam.",

    sections: [
      {
        id: "undian",
        eyebrow: "Tahap satu",
        judul: "Pembagian grup",
        paragraf: [
          "Hanya asisten yang ditandai hadir di layar Kehadiran yang ikut diundi. Paling sedikit empat orang, karena setiap grup harus terisi."
        ],
        poin: [
          {
            label: "Seimbang per divisi",
            teks: "Peserta dikelompokkan menurut divisinya, diacak di dalam divisi itu, lalu dibagikan bergiliran ke Grup 1 sampai Grup 4. Cara ini menyebar tiap divisi ke seluruh grup, bukan menumpuknya di satu tempat."
          },
          {
            label: "Urutan nama ikut diacak",
            teks: "Susunan nama di dalam satu grup diacak sekali lagi, supaya urutannya tidak membocorkan siapa datang dari divisi mana."
          },
          {
            label: "Undi ulang mengosongkan bagan",
            teks: "Menekan Undi Ulang membuat undian yang sepenuhnya baru dan menghapus seluruh hasil pertandingan game itu — semifinal maupun juaranya."
          }
        ]
      },

      {
        id: "bagan",
        eyebrow: "Tahap dua",
        judul: "Bagan turnamen",
        paragraf: [
          "Bagannya tetap dan tidak ikut diundi: Grup 1 selalu bertemu Grup 2, Grup 3 selalu bertemu Grup 4."
        ],
        poin: [
          { label: "Semifinal 1", teks: "Grup 1 melawan Grup 2." },
          { label: "Semifinal 2", teks: "Grup 3 melawan Grup 4." },
          { label: "Final", teks: "Pemenang Semifinal 1 melawan pemenang Semifinal 2." }
        ]
      },

      {
        id: "poin",
        eyebrow: "Tahap tiga",
        judul: "Perolehan poin",
        paragraf: [
          "Poin dihitung per orang, bukan per grup: setiap anggota grup menerima angka yang sama."
        ],
        poin: [
          {
            label: "Juara tidak ditambah poin finalis",
            teks: "Grup yang memenangi final menerima 3 poin saja, bukan 3 + 1. Gelar juara menggantikan gelar finalis untuk game yang sama."
          },
          {
            label: "Selama final belum diputuskan",
            teks: "Grup yang sudah memenangi semifinal langsung dihitung 1 poin sebagai finalis. Angkanya naik menjadi 3 begitu grup itu memenangi final."
          }
        ]
      },

      {
        id: "peringkat",
        eyebrow: "Tahap empat",
        judul: "Klasemen",
        paragraf: [
          "Klasemen mengurutkan seluruh 25 asisten menurut total poin dari semua game, bukan menurut grup."
        ],
        poin: [
          {
            label: "Poin terbanyak lebih dahulu",
            teks: "Urutan pertama ditentukan oleh jumlah poin, dari terbesar ke terkecil."
          },
          {
            label: "Seri diputus menurut abjad",
            teks: "Bila poinnya sama, nama yang lebih awal secara abjad menempati urutan lebih atas."
          },
          {
            label: "Peringkat kembar",
            teks: "Peringkat memakai penomoran 1-2-2-4: yang seri berbagi peringkat yang sama, dan peringkat sesudahnya melompat sebanyak jumlah yang seri itu."
          }
        ]
      }
    ],

    // Rendered as the scoring table. `poin` must match the arithmetic in
    // Engine.computeStandings.
    skor: [
      { poin: 3, label: "Juara", teks: "Setiap anggota grup yang memenangi final." },
      { poin: 1, label: "Finalis", teks: "Setiap anggota grup yang kalah di final." },
      { poin: 0, label: "Semifinalis", teks: "Grup yang kalah di semifinal tidak mendapat poin." }
    ]
  }
};
