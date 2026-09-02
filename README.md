# Karhutla EWS

Karhutla EWS adalah dashboard peringatan dini kebakaran hutan dan lahan (karhutla) untuk seluruh wilayah Indonesia. Website ini menampilkan titik panas (hotspot) kebakaran secara real-time di atas peta, lengkap dengan prediksi risiko kebakaran untuk beberapa hari ke depan menggunakan model machine learning.

Live: www.karhutla.site

## Daftar Isi

1. [Cara Kerja Sistem Secara Umum](#cara-kerja-sistem-secara-umum)
2. [Sumber Data: NASA FIRMS](#sumber-data-nasa-firms)
3. [Model Prediksi: XGBoost](#model-prediksi-xgboost)
4. [Peta Dasar: CARTO](#peta-dasar-carto)
5. [Bot Update Otomatis (GitHub Actions)](#bot-update-otomatis-github-actions)
6. [Kenapa Data di Website Ini Akurat dan Real-Time](#kenapa-data-di-website-ini-akurat-dan-real-time)
7. [File Data yang Sering Disebut "database.json"](#file-data-yang-sering-disebut-databasejson)
8. [Cara Menjalankan Proyek Ini](#cara-menjalankan-proyek-ini)

## Cara Kerja Sistem Secara Umum

Website ini dibangun dengan Astro (situs statis) dan tidak punya database aktif seperti MySQL atau MongoDB. Semua data yang tampil di dashboard sebenarnya disimpan dalam satu file JSON, yaitu `public/dashboard_data.json`. File ini yang dibaca oleh halaman web untuk menampilkan peta, grafik, dan angka-angka risiko kebakaran.

File JSON tersebut tidak diisi manual. Setiap beberapa jam, sebuah "robot" (bot) otomatis mengambil data terbaru dari satelit dan cuaca, memprosesnya, lalu menimpa file `dashboard_data.json` dengan data baru. Karena itulah dashboard terlihat selalu ter-update tanpa ada orang yang mengeditnya secara manual.

## Sumber Data: NASA FIRMS

FIRMS (Fire Information for Resource Management System) adalah layanan gratis dari NASA yang mendeteksi titik panas di permukaan bumi menggunakan satelit VIIRS (Suomi NPP dan NOAA-20). Setiap kali satelit ini melintas di atas Indonesia, ia mencatat koordinat lokasi yang suhunya jauh lebih panas dari sekitarnya, kemungkinan besar karena kebakaran.

Website ini mengambil data tersebut lewat API resmi FIRMS, khusus untuk area Indonesia, mencakup sekitar 15 hari ke belakang. Untuk bisa mengakses API ini, dibutuhkan sebuah kunci akses gratis (map key) yang didaftarkan di situs FIRMS.

## Model Prediksi: XGBoost

Titik panas dari satelit hanya menunjukkan kebakaran yang sudah terjadi, bukan yang akan terjadi. Untuk memperkirakan risiko ke depan, sistem ini melatih sebuah model machine learning bernama XGBoost.

Cara kerjanya secara sederhana: seluruh wilayah Indonesia dibagi menjadi kotak-kotak kecil (grid). Untuk tiap kotak, model mempelajari pola dari data historis, yaitu seberapa sering kebakaran terjadi di sana dan bagaimana kondisi curah hujannya. Curah hujan penting karena lahan yang kering jauh lebih rawan terbakar dibanding lahan basah. Dari pola ini, model memprediksi seberapa besar peluang suatu kotak akan mengalami kebakaran dalam beberapa hari mendatang.

## Peta Dasar: CARTO

CARTO adalah penyedia gambar peta dasar (basemap) bergaya gelap yang dipakai sebagai latar belakang peta pada dashboard. CARTO hanya bertugas menampilkan gambar peta (jalan, batas wilayah, kontur), bukan menyediakan data kebakaran. Untuk memuat gambar peta ini, website memerlukan sebuah kunci API dari CARTO yang disimpan sebagai environment variable saat proses build.

## Bot Update Otomatis (GitHub Actions)

Update data dilakukan oleh sebuah workflow GitHub Actions yang dijadwalkan berjalan setiap 3 jam sekali (lihat `.github/workflows/update-data.yml`). Urutan kerjanya:

1. Bot mengambil data hotspot terbaru dari NASA FIRMS.
2. Bot mengambil data curah hujan terbaru.
3. Bot melatih ulang model XGBoost dan menghasilkan `dashboard_data.json` versi terbaru.
4. Jika ada perubahan, bot melakukan commit dan push otomatis ke repository ini.

Karena proses ini berjalan di infrastruktur GitHub, waktu eksekusinya tidak selalu presisi. Kadang update tampil tepat 3 jam setelah yang sebelumnya, kadang meleset atau tertunda beberapa menit hingga puluhan menit karena antrian server GitHub. Ini normal dan tidak berarti sistem rusak.

## Kenapa Data di Website Ini Akurat dan Real-Time

- Data hotspot diambil langsung dari dua satelit sekaligus (Suomi NPP dan NOAA-20), sehingga peluang mendeteksi titik panas lebih besar dibanding hanya mengandalkan satu satelit.
- Setiap kali mengambil data baru, sistem menggabungkannya dengan data lama dan membuang data duplikat, sehingga tidak ada titik yang tercatat dua kali.
- Jika sewaktu-waktu API NASA FIRMS gagal diakses (misalnya sedang gangguan), sistem tidak menampilkan data kosong. Sistem akan tetap memakai data hasil update sebelumnya sebagai cadangan, sambil mencoba lagi di jadwal berikutnya.
- Karena proses ini berulang otomatis setiap 3 jam tanpa perlu campur tangan manusia, data di dashboard selalu mendekati kondisi terkini di lapangan.

## File Data yang Sering Disebut "database.json"

Perlu diluruskan: di dalam repository ini tidak ada file bernama `database.json`. File yang berperan sebagai "sumber data" untuk seluruh dashboard adalah `public/dashboard_data.json`, dan file inilah yang terus-menerus diperbarui oleh bot setiap 3 jam. File ini dihasilkan otomatis oleh script `scripts/generate_dashboard_data.py`, jadi sebaiknya tidak diedit secara manual karena perubahannya akan tertimpa pada update berikutnya.

## Cara Menjalankan Proyek Ini

Yang dibutuhkan: Node.js dan Python 3.12 sudah terpasang di komputer.

1. Clone repository ini, lalu masuk ke foldernya.
2. Pasang dependensi Node: `npm install`
3. Pasang dependensi Python: `pip install -r requirements.txt`
4. Siapkan dua kunci API:
   - `FIRMS_MAP_KEY`, didaftarkan gratis di situs NASA FIRMS.
   - `PUBLIC_CARTO_API_KEY`, disimpan di file `.env` pada root proyek.
5. Jalankan pipeline data secara manual (opsional, untuk memperbarui data lokal): `python scripts/run_update.py`
6. Jalankan website dalam mode pengembangan: `npm run dev`
7. Untuk membangun versi produksi: `npm run build`