/******************************************
>> Editable Parameter
******************************************/

// Main metadata.
#let module-title           = "IoT"
#let lab-name               = "IoT Runtime and Integration System Laboratory"
#let lab-name-short         = "IRIS LABORATORY"
#let head-lab-name          = "Automation System and Intelligence Control (ASIC)"
#let module-year            = "2026/2027"
#let updated-year           = "2026"

#let logo-image             = "assets/logo_iris.png"
#let cover-image-id         = "covers/cover-id.png"
#let cover-image-en         = "covers/cover-en.png"

#let footer-left-text-id    = "MODUL PRAKTIKUM"
#let footer-right-text-id   = "PEMROGRAMAN PERANGKAT IOT"

#let footer-left-text-en    = "PRACTICUM MODULE"
#let footer-right-text-en   = "IOT DEVICE PROGRAMMING"

#let place              = "Bandung"
#let date-id            = "31 Agustus 2026"
#let date-en            = "31 August 2026"

// Person List
#let kepala-praktikum-ttd     = ""
#let koordinator-asisten-ttd  = ""

#let kepala-praktikum     = (
  nama: "Dr. Junartho Halomoan, S.T., M.T",  nip: "10820038", 
)
#let pembina-praktikum    = (
  nama: "Istiqomah, S.T. M.Sc", nip: "25910022", 
)

// Penyusun Modul
#let koordinator-asisten  = (
  nama: "Bustan Nabiel Maulana",  nim: "101022300013", 
)
#let penanggung-jawab = (
  nama: "Adrianus Wismar Nugrahanto", nim: "101022330019"
)

#let penyusun-praktikum = (
  (nama: "Immanuel Eben Haezer Aleteia" , nim: "101022300172"),
  (nama: "Muhammad Raditya Dwi Putra"   , nim: "101022440006"),
  (nama: "Muhammad Apri Putra Pratama"  , nim: "101012500043"),
  (nama: "Marvel Cristo Damanik"        , nim: "101012580014"),
  (nama: "Rega Arzula Akbar"            , nim: "101022330038"),
  (nama: "Wildan Khalid Wijaya"         , nim: "101022400126"),
  (nama: "Ruifauzan Khiyar Wienarya"    , nim: "101022400038"),
  (nama: "Mochammad Rifky Adiraysan"    , nim: "101022330158"),
)

#let divisions = (
  "ketua"      : (id: "Koordinator Asisten"       , en: "Assistant Coordinator"),
  "wakil"      : (id: "Wakil Koordinator Asisten" , en: "Vice Assistant Coordinator"),
  "sekretaris" : (id: "Sekretaris"                , en: "Secretary"),
  "bendahara"  : (id: "Bendahara"                 , en: "Treasurer"),
  "k-ASO"      : (id: "Kepala Divisi ASO"         , en: "Chief of ASO Division"),
  "k-ARD"      : (id: "Kepala Divisi ARD"         , en: "Chief of ARD Division"),
  "k-ADS"      : (id: "Kepala Divisi ADS"         , en: "Chief of ADS Division"),
  "k-ADC"      : (id: "Kepala Divisi ADC"         , en: "Chief of ADC Division"),
  "k-AER"      : (id: "Kepala Divisi AER"         , en: "Chief of AER Division"),
  "k-ARM"      : (id: "Kepala Divisi ARM"         , en: "Chief of ARM Division"),
  "ASO"        : (id: "Anggota Divisi ASO"        , en: "Member of ASO Division"),
  "ARD"        : (id: "Anggota Divisi ARD"        , en: "Member of ARD Division"),
  "ADS"        : (id: "Anggota Divisi ADS"        , en: "Member of ADS Division"),
  "ADC"        : (id: "Anggota Divisi ADC"        , en: "Member of ADC Division"),
  "AER"        : (id: "Anggota Divisi AER"        , en: "Member of AER Division"),
  "ARM"        : (id: "Anggota Divisi ARM"        , en: "Member of ARM Division"),
)

// Format:
// NIM || Nama || Kode Asisten || Nomor Telpon || ID Line || Divisi (Indo) || Divisi (Inggris)
#let asistens = (
  // Inti //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("ketua").id, div-en: divisions.at("ketua").en,
    nim: "101022300013", nama: "Bustan Nabiel Maulana", 
    kode: "NAB", telp: "081216919968",  line: "tanmln", 
  ),
  (
    div-id: divisions.at("wakil").id, div-en: divisions.at("wakil").en,
    nim: "101022330019", nama: "Adrianus Wismar Nugrahanto", 
    kode: "ADD", telp: "08811566526",  line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("sekretaris").id, div-en: divisions.at("sekretaris").en,
    nim: "101052300029", nama: "Putri Natasya Villyadi", 
    kode: "NAT", telp: "082172772372", line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("bendahara").id, div-en: divisions.at("bendahara").en,
    nim: "101052400100", nama: "Nathaniel Mildess", 
    kode: "DES", telp: "087819956413", line: "mildessnath_", 
  ),
  // ASO //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("k-ASO").id, div-en: divisions.at("k-ASO").en,
    nim: "101022300172", nama: "Immanuel Eben Haezer Joseph Aleteia", 
    kode: "NUE", telp: "085829290950", line: "eintswx", 
  ),
  (
    div-id: divisions.at("ASO").id, div-en: divisions.at("ASO").en,
    nim: "101022440006", nama: "Muhammad Raditya Dwi Putra", 
    kode: "TWT", telp: "089676594781", line: "muteless.seia", 
  ),
  (
    div-id: divisions.at("ASO").id, div-en: divisions.at("ASO").en,
    nim: "101012500043", nama: "Muhammad Apri Putra Pratama",
    kode: "MAP", telp: "082112774785", line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("ASO").id, div-en: divisions.at("ASO").en,
    nim: "101012580014", nama: "Marvel Cristo Damanik", 
    kode: "MCD", telp: "08999457440", line: "<ID LINE>", 
  ),
  // ARD //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("k-ARD").id, div-en: divisions.at("k-ARD").en,
    nim: "101022330038", nama: "Rega Arzula Akbar", 
    kode: "RGZ", telp: "082126565892", line: "arzula233", 
  ),
  (
    div-id: divisions.at("ARD").id, div-en: divisions.at("ARD").en,
    nim: "101022400126", nama: "Wildan Khalid Wijaya", 
    kode: "WIL", telp: "082119761448", line: "willdamnn", 
  ),
  (
    div-id: divisions.at("ARD").id, div-en: divisions.at("ARD").en,
    nim: "101022400038", nama: "Ruifauzan Khiyar Wienarya", 
    kode: "ZAN", telp: "085793477750", line: "ruienrya_", 
  ),
  (
    div-id: divisions.at("ARD").id, div-en: divisions.at("ARD").en,
    nim: "101022330158", nama: "Mochammad Rifky Adiraysan", 
    kode: "IKY", telp: "0895384470333", line: "<ID LINE>", 
  ),
  // ADS //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("k-ADS").id, div-en: divisions.at("k-ADS").en,
    nim: "101022330079", nama: "Geraldi Ridwan Hakim", 
    kode: "GRY", telp: "085224492559", line: "geraldirh", 
  ),
  (
    div-id: divisions.at("ADS").id, div-en: divisions.at("ADS").en,
    nim: "101022330011", nama: "Agung Putra Pamungkas", 
    kode: "GMW", telp: "082387359411", line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("ADS").id, div-en: divisions.at("ADS").en,
    nim: "101022300325", nama: "Agung Setia Dharma", 
    kode: "OCU", telp: "081289458913", line: "<ID LINE>", 
  ),
  // ADC //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("k-ADC").id, div-en: divisions.at("k-ADC").en,
    nim: "101022300125", nama: "Serly Marleny", 
    kode: "LYY", telp: "081388790318", line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("ADC").id, div-en: divisions.at("ADC").en,
    nim: "101022330033", nama: "Monica Rizkia Nanda", 
    kode: "ICA", telp: "082130661485", line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("ADC").id, div-en: divisions.at("ADC").en,
    nim: "101022400093", nama: "Moh. Fathirochman Yasin", 
    kode: "FAT", telp: "085240181824", line: "<ID LINE>", 
  ),
  // AER //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("k-AER").id, div-en: divisions.at("k-AER").en,
    nim: "101022300129", nama: "Muhammad Raid Ihsan Akbar", 
    kode: "BAR", telp: "082124072608", line: "mr.ihsanakbar", 
  ),
  (
    div-id: divisions.at("AER").id, div-en: divisions.at("AER").en,
    nim: "101022300195", nama: "Bryan Gabriel Izaac Sasabone", 
    kode: "YEN", telp: "082197881252", line: "<ID LINE>", 
  ),
  (
    div-id: divisions.at("AER").id, div-en: divisions.at("AER").en,
    nim: "101022400216", nama: "Rido Alip Fianto", 
    kode: "MCU", telp: "085779076891", line: "<ID LINE>"     , 
  ),
  (
    div-id: divisions.at("AER").id, div-en: divisions.at("AER").en,
    nim: "101022330034", nama: "Graceyana Ardhia Shinta Thalia Kottama", 
    kode: "XIN", telp: "081233477989", line: "<ID LINE>", 
  ),
  // ARM //////////////////////////////////////////////////////////////////////////
  (
    div-id: divisions.at("k-ARM").id, div-en: divisions.at("k-ARM").en,
    nim: "101052300102", nama: "Luqmanul Hakim", 
    kode: "LUV", telp: "082238264823", line: "luqman0765", 
  ),
  (
    div-id: divisions.at("ARM").id, div-en: divisions.at("ARM").en,
    nim: "101012330221", nama: "Darma Al Gani", 
    kode: "GAN", telp: "089513829923", line: "darmapamatan", 
  ),
  (
    div-id: divisions.at("ARM").id, div-en: divisions.at("ARM").en,
    nim: "101022330157", nama: "Tirta Razzan", 
    kode: "TRA", telp: "082257298778", line: "<ID LINE>", 
  ),
  
)

// Revision List
#let revisions = (
  id : (
    (
      modul     : "Modul 1",
      deskripsi : "Penambahan materi mengenai Bluetooth Low Energy (BLE) beserta implementasinya",
      tanggal   : "31 Agustus 2026"
    ), 
    (
      modul     : "Modul 2",
      deskripsi : "Pergantian topik materi dari Google Firebase dan Koduler menjadi server lokal HTTP dengan komunikasi WebSocket",
      tanggal   : "31 Agustus 2026"
    ), 
    (
      modul     : "Modul 3",
      deskripsi : "Perubahan penggunaan broker MQTT yang sebelumnya menggunakan AdafruitIO dengan broker lokal Mosquitto MQTT",
      tanggal   : "31 Agustus 2026"
    ), 
    (
      modul     : "Modul 4",
      deskripsi : "Penambahan materi mengenai LoRaWAN beserta implementasinya menggunakan platform ANTARES",
      tanggal   : "31 Agustus 2026"
    ), 
    (
      modul     : "Modul 1, 2, 3, dan 4",
      deskripsi : "Merapihkan format penulisan",
      tanggal   : "31 Agustus 2026"
    ), 
  ),
  en : (
    (
      module      : "Module 1", 
      description : "Added material regarding to Bluetooth Low Energy complete with the implementation", 
      date        : "31 August 2026"
    ), 
    (
      module      : "Module 2", 
      description : "Changed the topic from Google Firebase and Kodular to local HTTP server with WebSocket communication",
      date        : "31 August 2026"
    ), 
    (
      module      : "Module 3",
      description : "Changed the MQTT broker from Adafruit IO to local Mosquitto MQTT server", 
      date        : "31 August 2026"
    ), 
    (
      module      : "Module 4", 
      description : "Added material regarding to LoRaWAN complete with its implementation using ANTARES platfrom", 
      date        : "31 August 2026"
    ), 
    (
      module      : "Module 1, 2, 3, dan 4", 
      description : "Improved the writing format and fixed the typos", 
      date        : "31 August 2026"
    ), 
  )
)
